'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Notice, Skeleton } from '../../../../components/ui';
import { api, ApiError } from '../../../../lib/api';
import { JOB_STATUS, jobFailureMessage, jobMeta, safeExternalUrl } from '../../../../lib/jobs';
import type { Job } from '../../../../lib/types';
import { usePollWhile } from '../../../../lib/use-poll';
import { useResource } from '../../../../lib/use-resource';
import styles from '../vagas.module.css';
import { JobFeedback } from './job-feedback';
import { JobMatchSection } from './job-match';

export default function JobPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data: job, error, reload } = useResource(() => api<Job>(`/v1/jobs/${id}`));
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  usePollWhile(job?.status === 'structuring', reload, job);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  const applyUrl = safeExternalUrl(job?.applyUrl ?? null);
  const details = job
    ? [job.employmentType, job.salaryText].filter((value): value is string => Boolean(value))
    : [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/vagas" className={styles.back}>
          ‹ Vagas
        </Link>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{job?.title ?? 'Vaga'}</h1>
          {job && job.status !== 'ready' ? (
            <Badge tone={JOB_STATUS[job.status].tone}>{JOB_STATUS[job.status].label}</Badge>
          ) : null}
        </div>
        {job && jobMeta(job) ? <p className={styles.subtitle}>{jobMeta(job)}</p> : null}
        {details.length > 0 ? <p className={styles.subtitle}>{details.join(' · ')}</p> : null}
        {applyUrl ? (
          <a href={applyUrl} target="_blank" rel="noopener noreferrer" className={styles.external}>
            Abrir a vaga original
          </a>
        ) : null}
      </header>

      {error && !job ? (
        <Notice tone="danger">{error.message}</Notice>
      ) : !job ? (
        <Skeleton height={240} />
      ) : job.status === 'structuring' ? (
        <p className={styles.empty} aria-live="polite">
          Estamos analisando esta vaga. Isso pode levar alguns minutos, e você pode sair desta
          página.
        </p>
      ) : job.status === 'failed' ? (
        <div className={styles.callout}>
          <p className={styles.calloutText}>{jobFailureMessage(job.failureCode)}</p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                // Importar o mesmo texto de novo refaz a análise da mesma vaga.
                await api('/v1/jobs/import', {
                  method: 'POST',
                  body: { text: job.rawText, ...(job.applyUrl ? { applyUrl: job.applyUrl } : {}) },
                });
                await reload();
              })
            }
          >
            Tentar de novo
          </Button>
        </div>
      ) : (
        <>
          <JobMatchSection jobId={job.id} />
          <JobFeedback job={job} />
        </>
      )}

      {actionError ? <Notice tone="danger">{actionError}</Notice> : null}

      {job ? (
        <details className={styles.rawText}>
          <summary>Texto da vaga</summary>
          <p>{job.rawText}</p>
        </details>
      ) : null}

      {job && job.status !== 'structuring' ? (
        <div className={styles.dangerZone}>
          {confirmingDelete ? (
            <>
              <p className={styles.confirmText}>Apagar esta vaga? Isso não pode ser desfeito.</p>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api(`/v1/jobs/${job.id}`, { method: 'DELETE' });
                    router.replace('/vagas');
                  })
                }
              >
                {busy ? 'Apagando…' : 'Apagar'}
              </Button>
              <Button variant="plain" disabled={busy} onClick={() => setConfirmingDelete(false)}>
                Manter
              </Button>
            </>
          ) : (
            <Button variant="plain" onClick={() => setConfirmingDelete(true)}>
              Apagar vaga
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
