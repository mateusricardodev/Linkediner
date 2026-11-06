import { AppError } from '../../shared';

export const PURGE_USER_QUEUE = {
  name: 'privacy.purge_user',
  deadLetter: 'privacy.purge_user.dead',
  retryLimit: 5,
  expireInSeconds: 10 * 60,
} as const;

export const EXPORT_USER_QUEUE = {
  name: 'privacy.export_user',
  deadLetter: 'privacy.export_user.dead',
  retryLimit: 2,
  expireInSeconds: 10 * 60,
} as const;

export interface PurgeUserJob {
  requestId: string;
}

export interface ExportUserJob {
  userId: string;
  exportId: string;
}

export const RECENT_LOGIN_MS = 60 * 60 * 1000;
export const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
/** Um pedido parado por mais que isso é retomado, mesmo que a fila tenha perdido a tarefa. */
export const PURGE_RESUME_AFTER_MS = 15 * 60 * 1000;

/** Sessão roubada ou esquecida aberta não basta para apagar a conta nem levar todos os dados. */
export function assertRecentLogin(sessionCreatedAt: Date, now: Date): void {
  if (now.getTime() - sessionCreatedAt.getTime() > RECENT_LOGIN_MS) {
    throw new AppError('FORBIDDEN', 'Entre de novo para confirmar esta ação.', {
      reason: 'recent_login_required',
    });
  }
}

export interface DeletionRequest {
  id: string;
  userId: string | null;
  userRef: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface DataExport {
  id: string;
  userId: string;
  status: 'pending' | 'ready' | 'failed';
  objectKey: string | null;
  sizeBytes: number | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export const exportObjectKey = (userId: string, exportId: string) =>
  `users/${userId}/exports/${exportId}.zip`;

/** Extensão do arquivo original dentro do ZIP. O tipo real foi verificado no upload. */
export function extensionFor(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('wordprocessingml')) return 'docx';
  return 'bin';
}
