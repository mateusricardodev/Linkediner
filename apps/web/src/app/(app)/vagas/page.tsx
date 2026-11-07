'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  ButtonLink,
  Field,
  Notice,
  Skeleton,
  SyntheticDataNotice,
  TextAreaField,
} from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { hiddenJobs, JOB_STATUS, jobFailureMessage, jobMeta } from '../../../lib/jobs';
import type { Job, Me, Recommendations } from '../../../lib/types';
import { usePollWhile } from '../../../lib/use-poll';
import { goalQuery, useGoal } from '../../../lib/use-goal';
import { useResource } from '../../../lib/use-resource';
import { DiscoverySection } from './discovery-section';
import { GoalPicker } from './goal-picker';
import styles from './vagas.module.css';

function JobLink({ job, children }: { job: Job; children: React.ReactNode }) {
  return (
    <li>
      <Link href={`/vagas/${job.id}`} className={styles.jobLink}>
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{job.title ?? 'Vaga sem título'}</span>
          <span className={styles.rowMeta}>{jobMeta(job) || 'Empresa não informada'}</span>
        </span>
        {children}
      </Link>
    </li>
  );
}

export default function JobsPage() {
  const router = useRouter();
  const me = useResource(() => api<Me>('/v1/me'));
  const jobs = useResource(() => api<Job[]>('/v1/jobs'));
  const goalState = useGoal();
  const goal = goalState.goal;
  const recommendations = useResource(() =>
    api<Recommendations>(`/v1/jobs/recommendations${goalQuery(goal)}`),
  );
  const [text, setText] = useState('');
  const [applyUrl, setApplyUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A API lista da mais antiga para a mais nova.
  const all = [...(jobs.data ?? [])].reverse();
  const pending = all.filter((job) => job.status !== 'ready');
  const analyzing = pending.filter((job) => job.status === 'structuring').length;
  usePollWhile(analyzing > 0, jobs.reload, jobs.data);

  // Quando uma análise termina, a vaga entra nas recomendações.
  const reloadRecommendations = recommendations.reload;
  // Trocar de objetivo muda a compatibilidade. O primeiro carregamento já usa o padrão da API.
  const goalId = goal?.id ?? null;
  useEffect(() => {
    if (goalId) void reloadRecommendations();
  }, [goalId, reloadRecommendations]);
  const previous = useRef(analyzing);
  useEffect(() => {
    if (analyzing < previous.current) void reloadRecommendations();
    previous.current = analyzing;
  }, [analyzing, reloadRecommendations]);

  const aiAllowed = Boolean(me.data?.consents.granted.ai_processing);
  const hidden = recommendations.data ? hiddenJobs(all, recommendations.data) : [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const url = applyUrl.trim();
      const job = await api<Job>('/v1/jobs/import', {
        method: 'POST',
        body: { text, ...(url ? { applyUrl: url } : {}) },
      });
      router.push(`/vagas/${job.id}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Vagas</h1>
        <p className={styles.subtitle}>
          Vagas encontradas para o seu objetivo, ou as que você colar. Compare requisito por
          requisito com o seu perfil.
        </p>
      </header>
      <DiscoverySection goalState={goalState} />

      <section aria-labelledby="importar" className={styles.section}>
        <h2 id="importar" className={styles.sectionTitle}>
          Importar vaga
        </h2>
        {me.data && !aiAllowed ? (
          <div className={styles.callout}>
            <p className={styles.calloutText}>
              Para analisar vagas, autorize a análise por IA na página do seu perfil.
            </p>
            <ButtonLink variant="secondary" href="/perfil">
              Ir para o perfil
            </ButtonLink>
          </div>
        ) : me.data ? (
          <form className={styles.form} onSubmit={(event) => void submit(event)}>
            {me.data.syntheticDataOnly ? <SyntheticDataNotice /> : null}
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <TextAreaField
              label="Texto da vaga"
              rows={8}
              required
              maxLength={40_000}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <Field
              label="Link da vaga (opcional)"
              type="url"
              inputMode="url"
              placeholder="https://"
              hint="Fica só para você abrir depois. O LinkedIner não acessa este endereço."
              value={applyUrl}
              onChange={(event) => setApplyUrl(event.target.value)}
            />
            <div>
              <Button type="submit" disabled={busy || text.trim().length === 0}>
                {busy ? 'Enviando…' : 'Analisar vaga'}
              </Button>
            </div>
          </form>
        ) : null}
      </section>

      {pending.length > 0 ? (
        <section aria-labelledby="andamento" className={styles.section}>
          <h2 id="andamento" className={styles.sectionTitle}>
            Em andamento
          </h2>
          <ul className={styles.list} aria-live="polite">
            {pending.map((job) => (
              <li key={job.id}>
                <Link href={`/vagas/${job.id}`} className={styles.jobLink}>
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{job.title ?? job.rawText.slice(0, 60)}</span>
                    {job.status === 'failed' ? (
                      <span className={styles.rowMeta}>{jobFailureMessage(job.failureCode)}</span>
                    ) : null}
                  </span>
                  <Badge tone={JOB_STATUS[job.status].tone}>{JOB_STATUS[job.status].label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="recomendadas" className={styles.section}>
        <h2 id="recomendadas" className={styles.sectionTitle}>
          Suas vagas
        </h2>
        <GoalPicker goalState={goalState} />
        {recommendations.error && !recommendations.data ? (
          <Notice tone="danger">{recommendations.error.message}</Notice>
        ) : !recommendations.data ? (
          <Skeleton height={88} />
        ) : recommendations.data.items.length === 0 ? (
          <p className={styles.empty}>
            {hidden.length > 0
              ? 'Todas as suas vagas estão ocultas.'
              : 'Nenhuma vaga analisada ainda.'}
          </p>
        ) : (
          <>
            <ul className={styles.list}>
              {recommendations.data.items.map(({ job, score, explanation }) => (
                <JobLink key={job.id} job={job}>
                  {score === null ? (
                    <span className={styles.noMatch}>Sem dados suficientes</span>
                  ) : (
                    <span className={styles.match}>
                      {score}%<span className={styles.matchLabel}>compatível</span>
                    </span>
                  )}
                  {explanation.length > 0 ? (
                    <span className={styles.explanation}>{explanation.join(' ')}</span>
                  ) : null}
                </JobLink>
              ))}
            </ul>
            <p className={styles.footnote}>{recommendations.data.disclaimer}</p>
          </>
        )}
        {hidden.length > 0 ? (
          <details className={styles.hidden}>
            <summary>
              {hidden.length === 1 ? '1 vaga oculta' : `${hidden.length} vagas ocultas`}, por sua
              avaliação ou candidatura enviada
            </summary>
            <ul className={styles.list}>
              {hidden.map((job) => (
                <JobLink key={job.id} job={job}>
                  <Badge tone="neutral">Oculta</Badge>
                </JobLink>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}
