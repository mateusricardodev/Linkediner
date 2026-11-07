'use client';

import { useState } from 'react';
import { Notice, Skeleton } from '../../../../components/ui';
import { api, ApiError } from '../../../../lib/api';
import { FEEDBACK_OPTIONS, hidesJob, toggleReason } from '../../../../lib/jobs';
import type { FeedbackReason, Job } from '../../../../lib/types';
import { useResource } from '../../../../lib/use-resource';
import styles from '../vagas.module.css';

/** A avaliação muda a ordem da lista, nunca o número de compatibilidade. */
export function JobFeedback({ job }: { job: Job }) {
  const feedback = useResource(() =>
    api<{ reasons: FeedbackReason[] }>(`/v1/jobs/${job.id}/feedback`),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasons = feedback.data?.reasons ?? [];
  // Sem empresa identificada, não há o que bloquear: a API recusaria.
  const options = FEEDBACK_OPTIONS.filter((o) => o.reason !== 'company_blocked' || job.company);

  async function toggle(reason: FeedbackReason) {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/jobs/${job.id}/feedback`, {
        method: 'PUT',
        body: { reasons: toggleReason(reasons, reason) },
      });
      await feedback.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="avaliacao" className={styles.section}>
      <h2 id="avaliacao" className={styles.sectionTitle}>
        O que você achou?
      </h2>
      <div className={styles.card}>
        {feedback.error && !feedback.data ? (
          <Notice tone="danger">{feedback.error.message}</Notice>
        ) : !feedback.data ? (
          <Skeleton height={80} />
        ) : (
          <>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <div className={styles.chips} role="group" aria-label="Avaliação da vaga">
              {options.map(({ reason, label }) => (
                <button
                  key={reason}
                  type="button"
                  className={styles.chip}
                  aria-pressed={reasons.includes(reason)}
                  disabled={busy}
                  onClick={() => void toggle(reason)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className={styles.footnote} aria-live="polite">
              {hidesJob(reasons)
                ? 'Esta vaga saiu da sua lista. Desmarque para ela voltar.'
                : 'Sua avaliação ajusta a ordem das vagas. Ela não muda a compatibilidade nem é usada para treinar modelos.'}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
