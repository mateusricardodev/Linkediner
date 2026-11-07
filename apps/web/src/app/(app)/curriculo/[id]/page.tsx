'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Notice, Skeleton } from '../../../../components/ui';
import { api, ApiError } from '../../../../lib/api';
import { formatDate } from '../../../../lib/documents';
import {
  downloadResume,
  pendingCount,
  RESUME_STATUS,
  resumeFailureMessage,
} from '../../../../lib/resumes';
import type { Resume } from '../../../../lib/types';
import { usePollWhile } from '../../../../lib/use-poll';
import { useResource } from '../../../../lib/use-resource';
import styles from '../curriculo.module.css';
import { ResumeContentView } from '../resume-content';

export default function ResumePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data: resume, error, reload } = useResource(() => api<Resume>(`/v1/resumes/${id}`));
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  usePollWhile(resume?.status === 'generating', reload, resume);

  async function run(name: string, action: () => Promise<unknown>) {
    setBusy(name);
    setActionError(null);
    try {
      await action();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(null);
    }
  }

  const pending = resume?.content ? pendingCount(resume.content) : 0;
  const status = resume ? RESUME_STATUS[resume.status] : null;
  const reviewable = resume?.status === 'draft' || resume?.status === 'approved';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/curriculo" className={styles.back}>
          ‹ Currículos
        </Link>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Revisar currículo</h1>
          {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
        </div>
        {resume ? (
          <p className={styles.subtitle}>Gerado em {formatDate(resume.createdAt)}</p>
        ) : null}
      </header>

      {error && !resume ? (
        <Notice tone="danger">{error.message}</Notice>
      ) : !resume ? (
        <Skeleton height={240} />
      ) : resume.status === 'generating' ? (
        <p className={styles.empty} aria-live="polite">
          Estamos gerando o seu currículo. Isso pode levar alguns minutos, e você pode sair desta
          página.
        </p>
      ) : resume.status === 'failed' ? (
        <Notice tone="danger">{resumeFailureMessage(resume.failureCode)}</Notice>
      ) : resume.content ? (
        <ResumeContentView
          content={resume.content}
          path={(itemId) => `/v1/resumes/${resume.id}/items/${itemId}`}
          onChanged={() => void reload()}
        />
      ) : null}

      {reviewable ? (
        <div className={styles.actionBar} aria-live="polite">
          {actionError ? <Notice tone="danger">{actionError}</Notice> : null}
          {resume.status === 'draft' ? (
            <div className={styles.actionRow}>
              <p className={styles.actionText}>
                {pending === 0
                  ? 'Tudo revisado. Aprove para poder baixar o arquivo.'
                  : pending === 1
                    ? '1 frase ainda precisa da sua decisão.'
                    : `${pending} frases ainda precisam da sua decisão.`}
              </p>
              <Button
                disabled={pending > 0 || busy !== null}
                onClick={() =>
                  void run('approve', async () => {
                    await api(`/v1/resumes/${resume.id}/approve`, { method: 'POST' });
                    await reload();
                  })
                }
              >
                {busy === 'approve' ? 'Aprovando…' : 'Aprovar currículo'}
              </Button>
            </div>
          ) : (
            <div className={styles.actionRow}>
              <p className={styles.actionText}>
                Aprovado{resume.approvedAt ? ` em ${formatDate(resume.approvedAt)}` : ''}. Qualquer
                alteração exige aprovar de novo.
              </p>
              <div className={styles.actions}>
                <Button
                  disabled={busy !== null}
                  onClick={() => void run('pdf', () => downloadResume(resume.id, 'pdf'))}
                >
                  {busy === 'pdf' ? 'Gerando…' : 'Baixar PDF'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void run('docx', () => downloadResume(resume.id, 'docx'))}
                >
                  {busy === 'docx' ? 'Gerando…' : 'Baixar DOCX'}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {resume && resume.status !== 'generating' ? (
        <div className={styles.dangerZone}>
          {confirmingDelete ? (
            <>
              <p className={styles.actionText}>
                Apagar este currículo? Isso não pode ser desfeito.
              </p>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() =>
                  void run('delete', async () => {
                    await api(`/v1/resumes/${resume.id}`, { method: 'DELETE' });
                    router.replace('/curriculo');
                  })
                }
              >
                {busy === 'delete' ? 'Apagando…' : 'Apagar'}
              </Button>
              <Button
                variant="plain"
                disabled={busy !== null}
                onClick={() => setConfirmingDelete(false)}
              >
                Manter
              </Button>
            </>
          ) : (
            <Button variant="plain" onClick={() => setConfirmingDelete(true)}>
              Apagar currículo
            </Button>
          )}
          {!reviewable && actionError ? <Notice tone="danger">{actionError}</Notice> : null}
        </div>
      ) : null}
    </div>
  );
}
