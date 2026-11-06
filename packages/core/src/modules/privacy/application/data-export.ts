import type { AuditLog } from '../../audit';
import type { ObjectStorage } from '../../documents';
import { AppError, newId, systemClock, type Clock } from '../../shared';
import {
  assertRecentLogin,
  DOWNLOAD_URL_TTL_SECONDS,
  EXPORT_TTL_MS,
  exportObjectKey,
  extensionFor,
  type DataExport,
  type ExportUserJob,
} from '../domain/account-data';

/** Toda operação com `userId` usa o contexto do usuário dono (RLS). */
export interface DataExportRepository {
  insert(userId: string, id: string): Promise<DataExport>;
  find(userId: string, id: string): Promise<DataExport | null>;
  list(userId: string): Promise<DataExport[]>;
  /** Devolve false se o pedido não existe mais: a conta foi excluída durante a geração. */
  markReady(
    userId: string,
    id: string,
    file: { objectKey: string; sizeBytes: number; expiresAt: Date },
  ): Promise<boolean>;
  markFailed(userId: string, id: string, failureCode: string): Promise<void>;
  /** Sem contexto de usuário: roda na tarefa diária de expiração. */
  findExpired(now: Date, limit: number): Promise<DataExport[]>;
  deleteById(id: string): Promise<void>;
}

export interface ExportQueue {
  enqueue(job: ExportUserJob): Promise<void>;
}

/** Pedido e download da exportação, na API. */
export class DataExportService {
  constructor(
    private readonly repo: Pick<DataExportRepository, 'insert' | 'list' | 'markFailed'>,
    private readonly storage: Pick<ObjectStorage, 'presignDownload'>,
    private readonly queue: ExportQueue,
    private readonly audit: AuditLog,
    private readonly clock: Clock = systemClock,
  ) {}

  async request(userId: string, sessionCreatedAt: Date): Promise<DataExport> {
    assertRecentLogin(sessionCreatedAt, this.clock.now());
    const pending = (await this.repo.list(userId)).find((e) => e.status === 'pending');
    if (pending) return pending;

    const created = await this.repo.insert(userId, newId());
    try {
      await this.queue.enqueue({ userId, exportId: created.id });
    } catch {
      await this.repo.markFailed(userId, created.id, 'processing_error');
      throw new AppError(
        'DEPENDENCY_UNAVAILABLE',
        'Não foi possível iniciar a exportação. Tente de novo.',
      );
    }
    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'data_export.requested',
      entityType: 'data_export',
      entityId: created.id,
    });
    return created;
  }

  /** Exportações válidas, com URL de curta duração para as prontas. */
  async list(userId: string, opts: { sessionCreatedAt: Date }) {
    const now = this.clock.now();
    const all = await this.repo.list(userId);
    const visible = all.filter((e) => !e.expiresAt || e.expiresAt > now);
    return Promise.all(
      visible.map(async (item) => {
        let downloadUrl: string | null = null;
        if (item.status === 'ready' && item.objectKey) {
          // O arquivo tem todos os dados da pessoa: baixar exige o mesmo login recente que pedir.
          assertRecentLogin(opts.sessionCreatedAt, now);
          downloadUrl = await this.storage.presignDownload(item.objectKey, {
            expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
            fileName: 'dados-linkediner.zip',
          });
        }
        return { ...item, downloadUrl };
      }),
    );
  }
}

export interface AccountDataSnapshot {
  /** Dados em JSON, por tabela. Nunca inclui hash de senha, tokens ou sessões. */
  data: Record<string, unknown>;
  files: { id: string; objectKey: string; mimeType: string }[];
}

export interface AccountDataReader {
  read(userId: string): Promise<AccountDataSnapshot>;
}

export type BuildExportZip = (input: {
  data: Record<string, unknown>;
  files: { path: string; bytes: Uint8Array }[];
  missingFiles: string[];
}) => Promise<Uint8Array>;

export interface ExportUserDataDeps {
  repo: Pick<DataExportRepository, 'find' | 'markReady' | 'markFailed'>;
  reader: AccountDataReader;
  storage: Pick<ObjectStorage, 'head' | 'getBytes' | 'putBytes' | 'delete'>;
  zip: BuildExportZip;
  audit: AuditLog;
  clock?: Clock;
}

export type ExportOutcome = 'ready' | 'skipped';

/** Gera o ZIP com os dados e os arquivos da pessoa (F9). Roda no worker. */
export class ExportUserData {
  private readonly clock: Clock;

  constructor(private readonly deps: ExportUserDataDeps) {
    this.clock = deps.clock ?? systemClock;
  }

  async run(job: ExportUserJob, opts: { isLastAttempt: boolean }): Promise<ExportOutcome> {
    const { userId, exportId } = job;
    const current = await this.deps.repo.find(userId, exportId);
    if (!current || current.status !== 'pending') return 'skipped';

    const objectKey = exportObjectKey(userId, exportId);
    try {
      const { data, files } = await this.deps.reader.read(userId);
      const included: { path: string; bytes: Uint8Array }[] = [];
      const missingFiles: string[] = [];
      for (const file of files) {
        // Um documento pode ter expirado entre a leitura e aqui: a exportação registra e segue.
        if (!(await this.deps.storage.head(file.objectKey))) {
          missingFiles.push(file.id);
          continue;
        }
        included.push({
          path: `documentos/${file.id}.${extensionFor(file.mimeType)}`,
          bytes: await this.deps.storage.getBytes(file.objectKey),
        });
      }
      const zip = await this.deps.zip({ data, files: included, missingFiles });
      await this.deps.storage.putBytes(objectKey, zip, 'application/zip');
      const saved = await this.deps.repo.markReady(userId, exportId, {
        objectKey,
        sizeBytes: zip.byteLength,
        expiresAt: new Date(this.clock.now().getTime() + EXPORT_TTL_MS),
      });
      if (!saved) {
        // A conta foi excluída durante a geração: o arquivo não pode sobrar no storage.
        await this.deps.storage.delete(objectKey);
        return 'skipped';
      }
      await this.deps.audit.record({
        actorType: 'system',
        actorId: userId,
        action: 'data_export.ready',
        entityType: 'data_export',
        entityId: exportId,
        metadata: { files: included.length, missingFiles: missingFiles.length },
      });
      return 'ready';
    } catch (error) {
      if (opts.isLastAttempt) {
        await this.deps.repo.markFailed(userId, exportId, 'processing_error');
      }
      throw error;
    }
  }
}

/** Apaga as exportações vencidas. Roda diariamente no worker. */
export class ExpireExports {
  constructor(
    private readonly repo: Pick<DataExportRepository, 'findExpired' | 'deleteById'>,
    private readonly storage: Pick<ObjectStorage, 'delete'>,
    private readonly clock: Clock = systemClock,
  ) {}

  async run(batchSize = 200): Promise<{ deleted: number }> {
    let deleted = 0;
    for (;;) {
      const batch = await this.repo.findExpired(this.clock.now(), batchSize);
      for (const item of batch) {
        if (item.objectKey) await this.storage.delete(item.objectKey);
        await this.repo.deleteById(item.id);
        deleted++;
      }
      if (batch.length < batchSize) return { deleted };
    }
  }
}
