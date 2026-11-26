'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Notice, Skeleton } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import {
  isNewPosting,
  postedLabel,
  safeExternalUrl,
  sourceLabel,
  sourceLink,
} from '../../../lib/jobs';
import type { DailyJobs, Job } from '../../../lib/types';
import { useResource } from '../../../lib/use-resource';
import styles from './inicio.module.css';

type Pick = Extract<DailyJobs, { state: 'ready' }>['picks'][number];

function SourceCredit({ source }: { source: string }) {
  const link = sourceLink(source);
  if (!link) return <>{sourceLabel(source)}</>;
  return (
    <a href={link} target="_blank" rel="noopener" className={styles.rowLink}>
      {sourceLabel(source)}
    </a>
  );
}

function DailyRow({ pick }: { pick: Pick }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = safeExternalUrl(pick.applyUrl);
  const posted = postedLabel(pick.postedAt);

  // Salva a vaga entre as da pessoa e abre o gerador já com ela escolhida.
  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const job = await api<Job>(`/v1/discovery/${pick.postingId}/save`, { method: 'POST' });
      router.push(`/curriculo?job=${job.id}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
      setBusy(false);
    }
  }

  return (
    <li className={styles.dailyRow}>
      <div className={styles.dailyHead}>
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>{pick.title}</span>
          <span className={styles.rowMeta}>
            {[pick.company, pick.location || null].filter(Boolean).join(' · ') ||
              'Empresa não informada'}
          </span>
          <span className={styles.dailyMeta}>
            {isNewPosting(pick.postedAt) ? <Badge tone="accent">Nova</Badge> : null}
            <span>
              {posted ? `${posted} · ` : null}via <SourceCredit source={pick.source} />
            </span>
          </span>
        </div>
        {pick.score === null ? (
          <span className={styles.noMatch}>Sem dados suficientes</span>
        ) : (
          <span className={styles.match}>
            {pick.score}%<span className={styles.matchLabel}>compatível</span>
          </span>
        )}
      </div>
      {pick.explanation.length > 0 ? (
        <p className={styles.dailyWhy}>{pick.explanation.join(' ')}</p>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className={styles.dailyActions}>
        <Button variant="secondary" disabled={busy} onClick={() => void generate()}>
          {busy ? 'Preparando…' : 'Gerar currículo'}
        </Button>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className={styles.dailyExternal}>
            Abrir vaga →
          </a>
        ) : null}
      </div>
    </li>
  );
}

/** As vagas do dia (ADR 0037): as mais compatíveis de hoje, com nota, link e currículo por vaga. */
export function DailyJobsSection() {
  const { data, error } = useResource(() => api<DailyJobs>('/v1/discovery/today'));

  // Sem fonte ligada, a seção não aparece: o resto do Início segue igual.
  if (data?.state === 'disabled') return null;

  return (
    <section aria-labelledby="vagas-do-dia">
      <h2 id="vagas-do-dia" className={styles.sectionTitle}>
        Vagas do dia
      </h2>
      {error && !data ? (
        <Notice tone="danger">{error.message}</Notice>
      ) : !data ? (
        <Skeleton height={160} />
      ) : data.state === 'upgrade_required' ? (
        <div className={styles.empty}>
          <p>
            Nos planos pagos, todo dia escolhemos as vagas mais compatíveis com o seu perfil, com
            nota e um currículo pensado para cada uma.
          </p>
          <Link href="/perfil?tab=conta">Ver os planos</Link>
        </div>
      ) : data.state === 'needs_goal' ? (
        <div className={styles.empty}>
          <p>Defina um objetivo de carreira para recebermos vagas sob medida.</p>
          <Link href="/perfil?tab=profissional#objetivos">Definir objetivo</Link>
        </div>
      ) : data.picks.length === 0 ? (
        <div className={styles.empty}>
          <p>
            {data.lastSyncedAt
              ? 'Nenhuma vaga nova combinou com o seu objetivo hoje. Procuramos de novo amanhã.'
              : 'Ainda estamos buscando as primeiras vagas para o seu objetivo.'}
          </p>
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {data.picks.map((pick) => (
              <DailyRow key={pick.postingId} pick={pick} />
            ))}
          </ul>
          <p className={styles.disclaimer}>
            As mais compatíveis de hoje, entre as vagas das fontes públicas. {data.disclaimer}
          </p>
        </>
      )}
    </section>
  );
}
