import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { buildExportZip } from './infrastructure/export-zip';
import type { DataExport, DeletionRequest } from './domain/account-data';
import { AccountDeletionService, PurgeUser } from './application/account-deletion';
import { DataExportService, ExportUserData, ExpireExports } from './application/data-export';

const USER = '0193b2b0-0000-7000-8000-00000000000a';
const NOW = new Date('2026-11-06T12:00:00Z');
const clock = { now: () => NOW };
const fresh = new Date(NOW.getTime() - 5 * 60 * 1000);
const stale = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);

const request = (o: Partial<DeletionRequest> = {}): DeletionRequest => ({
  id: 'r1',
  userId: USER,
  userRef: 'pseudonimo',
  status: 'pending',
  ...o,
});

function deletionService(enqueue = vi.fn(async () => {})) {
  const begin = vi.fn(async () => request());
  const record = vi.fn(async () => {});
  const service = new AccountDeletionService(
    { emailOf: async () => 'Pessoa@Example.com', begin },
    { enqueue },
    { record },
    (id) => `hmac(${id})`,
    clock,
  );
  return { service, begin, enqueue, record };
}

describe('pedido de exclusão', () => {
  it('exige login recente', async () => {
    const { service, begin } = deletionService();
    await expect(
      service.request(USER, { confirmEmail: 'pessoa@example.com', sessionCreatedAt: stale }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', details: { reason: 'recent_login_required' } });
    expect(begin).not.toHaveBeenCalled();
  });

  it('exige o e-mail da própria conta, sem diferenciar maiúsculas', async () => {
    const { service, begin } = deletionService();
    await expect(
      service.request(USER, { confirmEmail: 'outra@example.com', sessionCreatedAt: fresh }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(begin).not.toHaveBeenCalled();
    await service.request(USER, { confirmEmail: ' pessoa@example.com ', sessionCreatedAt: fresh });
    expect(begin).toHaveBeenCalledWith(USER, expect.objectContaining({ userRef: `hmac(${USER})` }));
  });

  it('a fila fora do ar não perde o pedido: ele já está gravado', async () => {
    const { service, begin } = deletionService(
      vi.fn(async () => {
        throw new Error('fila fora do ar');
      }),
    );
    await expect(
      service.request(USER, { confirmEmail: 'pessoa@example.com', sessionCreatedAt: fresh }),
    ).resolves.toMatchObject({ status: 'pending' });
    expect(begin).toHaveBeenCalled();
  });
});

function purgeSetup(current: DeletionRequest | null = request()) {
  const order: string[] = [];
  const repo = {
    find: vi.fn(async () => current),
    complete: vi.fn(async () => {
      order.push('banco');
    }),
    markFailed: vi.fn(async () => {}),
    listOpen: vi.fn(async () => (current ? [current] : [])),
  };
  const storage = {
    deletePrefix: vi.fn(async () => {
      order.push('arquivos');
      return 3;
    }),
  };
  const tasks = {
    cancelForUser: vi.fn(async () => {
      order.push('fila');
      return 2;
    }),
  };
  const keys = {
    destroy: vi.fn(async () => {
      order.push('chave');
    }),
  };
  return {
    purge: new PurgeUser({
      repo,
      storage,
      tasks,
      keys,
      subscriptions: {
        cancelForUser: async () => {
          order.push('assinatura');
          return 1;
        },
      },
      clock,
    }),
    repo,
    storage,
    tasks,
    keys,
    order,
  };
}

describe('expurgo', () => {
  it('apaga na ordem: fila, arquivos, chave, banco, e relata só contagens', async () => {
    const { purge, repo, storage, order } = purgeSetup();
    expect(await purge.run({ requestId: 'r1' }, { isLastAttempt: false })).toBe('completed');
    expect(order).toEqual(['assinatura', 'fila', 'arquivos', 'chave', 'banco']);
    expect(storage.deletePrefix).toHaveBeenCalledWith(`users/${USER}/`);
    expect(repo.complete).toHaveBeenCalledWith(request(), {
      cancelledTasks: 2,
      deletedFiles: 3,
      cancelledSubscriptions: 1,
    });
  });

  it('pedido concluído ou inexistente não faz nada', async () => {
    for (const current of [request({ status: 'completed', userId: null }), null]) {
      const { purge, tasks, repo } = purgeSetup(current);
      expect(await purge.run({ requestId: 'r1' }, { isLastAttempt: false })).toBe('skipped');
      expect(tasks.cancelForUser).not.toHaveBeenCalled();
      expect(repo.complete).not.toHaveBeenCalled();
    }
  });

  it('se os arquivos falham, o banco fica: a nova tentativa ainda sabe de quem é o prefixo', async () => {
    const { purge, repo, storage } = purgeSetup();
    storage.deletePrefix.mockRejectedValueOnce(new Error('storage fora do ar'));
    await expect(purge.run({ requestId: 'r1' }, { isLastAttempt: false })).rejects.toThrow();
    expect(repo.complete).not.toHaveBeenCalled();
    expect(repo.markFailed).not.toHaveBeenCalled();

    storage.deletePrefix.mockRejectedValueOnce(new Error('storage fora do ar'));
    await expect(purge.run({ requestId: 'r1' }, { isLastAttempt: true })).rejects.toThrow();
    expect(repo.markFailed).toHaveBeenCalledWith('r1');
  });

  it('se a chave não pode ser destruída, o pedido não conclui', async () => {
    const { purge, repo, keys } = purgeSetup();
    keys.destroy.mockRejectedValueOnce(new Error('storage fora do ar'));
    await expect(purge.run({ requestId: 'r1' }, { isLastAttempt: false })).rejects.toThrow();
    expect(repo.complete).not.toHaveBeenCalled();
  });

  it('a tarefa periódica retoma pedidos parados e conta os que seguem falhando', async () => {
    const ok = purgeSetup();
    expect(await ok.purge.resumeOpen()).toEqual({ resumed: 1, failed: 0 });
    expect(ok.repo.listOpen).toHaveBeenCalledWith(new Date(NOW.getTime() - 15 * 60 * 1000));

    const broken = purgeSetup();
    broken.storage.deletePrefix.mockRejectedValue(new Error('storage fora do ar'));
    expect(await broken.purge.resumeOpen()).toEqual({ resumed: 0, failed: 1 });
  });
});

const exportRow = (o: Partial<DataExport> = {}): DataExport => ({
  id: 'e1',
  userId: USER,
  status: 'pending',
  objectKey: null,
  sizeBytes: null,
  expiresAt: null,
  createdAt: NOW,
  ...o,
});

describe('pedido de exportação', () => {
  function setup(existing: DataExport[] = []) {
    const repo = {
      insert: vi.fn(async () => exportRow()),
      list: vi.fn(async () => existing),
      markFailed: vi.fn(async () => {}),
    };
    const storage = { presignDownload: vi.fn(async () => 'https://storage.example/assinada') };
    const enqueue = vi.fn(async () => {});
    const service = new DataExportService(repo, storage, { enqueue }, { record: vi.fn() }, clock);
    return { service, repo, storage, enqueue };
  }

  it('exige login recente, para pedir e para baixar', async () => {
    const { service, enqueue } = setup([
      exportRow({ status: 'ready', objectKey: 'k', expiresAt: new Date(NOW.getTime() + 1000) }),
    ]);
    await expect(service.request(USER, stale)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(enqueue).not.toHaveBeenCalled();
    await expect(service.list(USER, { sessionCreatedAt: stale })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('pedir de novo enquanto gera devolve o mesmo pedido', async () => {
    const { service, enqueue } = setup([exportRow()]);
    expect((await service.request(USER, fresh)).id).toBe('e1');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('lista sem as vencidas, e a URL é de curta duração', async () => {
    const { service, storage } = setup([
      exportRow({
        id: 'ok',
        status: 'ready',
        objectKey: 'k',
        expiresAt: new Date(NOW.getTime() + 1),
      }),
      exportRow({
        id: 'velha',
        status: 'ready',
        objectKey: 'v',
        expiresAt: new Date(NOW.getTime() - 1),
      }),
    ]);
    const items = await service.list(USER, { sessionCreatedAt: fresh });
    expect(items.map((i) => i.id)).toEqual(['ok']);
    expect(items[0]?.downloadUrl).toBe('https://storage.example/assinada');
    expect(storage.presignDownload).toHaveBeenCalledWith('k', {
      expiresInSeconds: 300,
      fileName: 'dados-linkediner.zip',
    });
  });
});

describe('geração da exportação', () => {
  function setup(markReady = true) {
    const stored = new Map<string, Uint8Array>();
    const repo = {
      find: vi.fn(async () => exportRow()),
      markReady: vi.fn(async () => markReady),
      markFailed: vi.fn(async () => {}),
    };
    const storage = {
      head: vi.fn(async (key: string) =>
        key === 'sumiu' ? null : { sizeBytes: 3, contentType: undefined },
      ),
      getBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
      putBytes: vi.fn(async (key: string, bytes: Uint8Array) => {
        stored.set(key, bytes);
      }),
      delete: vi.fn(async () => {}),
    };
    const reader = {
      read: vi.fn(async () => ({
        data: { user: { id: USER } },
        files: [
          { id: 'd1', objectKey: 'k1', mimeType: 'application/pdf' },
          { id: 'd2', objectKey: 'sumiu', mimeType: 'application/pdf' },
        ],
      })),
    };
    const use = new ExportUserData({
      repo,
      reader,
      storage,
      zip: buildExportZip,
      audit: { record: vi.fn(async () => {}) },
      clock,
    });
    return { use, repo, storage, reader, stored };
  }
  const job = { userId: USER, exportId: 'e1' };
  const key = `users/${USER}/exports/e1.zip`;

  it('monta o ZIP com os dados e os arquivos, e expira em 7 dias', async () => {
    const { use, repo, stored } = setup();
    expect(await use.run(job, { isLastAttempt: false })).toBe('ready');
    const zip = await JSZip.loadAsync(stored.get(key)!);
    expect(Object.keys(zip.files).sort()).toEqual([
      'LEIA-ME.txt',
      'dados.json',
      'documentos/',
      'documentos/d1.pdf',
    ]);
    const data = JSON.parse(await zip.file('dados.json')!.async('string'));
    expect(data).toEqual({ user: { id: USER }, missingFiles: ['d2'] });
    expect(repo.markReady).toHaveBeenCalledWith(
      USER,
      'e1',
      expect.objectContaining({
        objectKey: key,
        expiresAt: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000),
      }),
    );
  });

  it('conta excluída durante a geração: o arquivo não sobra no storage', async () => {
    const { use, storage } = setup(false);
    expect(await use.run(job, { isLastAttempt: false })).toBe('skipped');
    expect(storage.delete).toHaveBeenCalledWith(key);
  });

  it('só marca como falha na última tentativa', async () => {
    const { use, repo, reader } = setup();
    reader.read.mockRejectedValue(new Error('banco fora do ar'));
    await expect(use.run(job, { isLastAttempt: false })).rejects.toThrow();
    expect(repo.markFailed).not.toHaveBeenCalled();
    await expect(use.run(job, { isLastAttempt: true })).rejects.toThrow();
    expect(repo.markFailed).toHaveBeenCalledWith(USER, 'e1', 'processing_error');
  });
});

describe('expiração', () => {
  it('apaga o arquivo e o registro', async () => {
    const repo = {
      findExpired: vi.fn(async () => [exportRow({ objectKey: 'k' }), exportRow({ id: 'e2' })]),
      deleteById: vi.fn(async () => {}),
    };
    const storage = { delete: vi.fn(async () => {}) };
    expect(await new ExpireExports(repo, storage, clock).run()).toEqual({ deleted: 2 });
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(repo.deleteById).toHaveBeenCalledTimes(2);
  });
});
