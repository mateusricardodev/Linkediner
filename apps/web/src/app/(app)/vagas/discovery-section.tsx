'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, Button, Notice, Skeleton } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { isNewPosting, postedLabel, sourceLabel, sourceLink } from '../../../lib/jobs';
import { safeExternalUrl } from '../../../lib/jobs';
import type { Discovery, Job } from '../../../lib/types';
import { goalQuery, type useGoal } from '../../../lib/use-goal';
import { useResource } from '../../../lib/use-resource';
import { GoalSuggestion } from '../perfil/goal-suggestion';
import styles from './vagas.module.css';

type Item = Extract<Discovery, { state: 'ready' }>['items'][number];

function DiscoveryRow({ item }: { item: Item }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = safeExternalUrl(item.applyUrl);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const job = await api<Job>(`/v1/discovery/${item.id}/save`, { method: 'POST' });
      router.push(`/vagas/${job.id}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
      setBusy(false);
    }
  }

  return (
    <li className={styles.discoveryRow}>
      <div className={styles.discoveryMain}>
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>{item.title}</span>
          <span className={styles.rowMeta}>
            {[item.company, item.location || null].filter(Boolean).join(' · ')}
          </span>
          <span className={styles.discoveryMeta}>
            {isNewPosting(item.postedAt) ? <Badge tone="accent">Nova</Badge> : null}
            <span>
              {postedLabel(item.postedAt) ? `${postedLabel(item.postedAt)} · ` : null}via{' '}
              <SourceCredit source={item.source} />
            </span>
          </span>
        </div>
        {!item.analyzed ? (
          <span className={styles.noMatch}>Em análise</span>
        ) : item.score === null ? (
          <span className={styles.noMatch}>Sem dados suficientes</span>
        ) : (
          <span className={styles.match}>
            {item.score}%<span className={styles.matchLabel}>compatível</span>
          </span>
        )}
      </div>
      {item.explanation.length > 0 ? (
        <p className={styles.explanation}>{item.explanation.join(' ')}</p>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className={styles.discoveryActions}>
        <Button variant="plain" disabled={busy || !item.analyzed} onClick={() => void save()}>
          {busy ? 'Salvando…' : 'Salvar e ver detalhes'}
        </Button>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className={styles.external}>
            Abrir vaga original
          </a>
        ) : null}
      </div>
    </li>
  );
}

function SourceCredit({ source }: { source: string }) {
  const link = sourceLink(source);
  if (!link) return <>{sourceLabel(source)}</>;
  return (
    <a href={link} target="_blank" rel="noopener" className={styles.sourceCredit}>
      {sourceLabel(source)}
    </a>
  );
}

const PAGE_SIZE = 10;

/** Vagas que o LinkedIner encontrou nas fontes autorizadas, para o objetivo em uso. */
export function DiscoverySection({ goalState }: { goalState: ReturnType<typeof useGoal> }) {
  const goal = goalState.goal;
  const { data, error, reload } = useResource(() =>
    api<Discovery>(`/v1/discovery${goalQuery(goal)}`),
  );

  const [shown, setShown] = useState(PAGE_SIZE);

  // Trocar de objetivo muda a lista. O primeiro carregamento já usa o padrão da API.
  const goalId = goal?.id ?? null;
  useEffect(() => {
    setShown(PAGE_SIZE);
    if (goalId) void reload();
  }, [goalId, reload]);

  // Sem fonte ligada, a seção não existe: a importação manual segue funcionando.
  if (data?.state === 'disabled') return null;

  return (
    <section aria-labelledby="novas" className={styles.section}>
      <h2 id="novas" className={styles.sectionTitle}>
        Encontradas para você
      </h2>
      {error && !data ? (
        <Notice tone="danger">{error.message}</Notice>
      ) : !data ? (
        <Skeleton height={120} />
      ) : data.state === 'upgrade_required' ? (
        <p className={styles.empty}>
          Nos planos pagos, buscamos vagas novas para o seu objetivo direto no site das empresas. No
          seu plano, você continua importando vagas pelo texto ou pelo link.
        </p>
      ) : data.state === 'needs_goal' ? (
        <>
          <p className={styles.empty}>
            Para buscarmos vagas, precisamos de um objetivo de carreira.{' '}
            <Link href="/perfil#objetivos">Definir no perfil</Link>
          </p>
          <GoalSuggestion onCreated={() => void goalState.reload()} />
        </>
      ) : data.items.length === 0 ? (
        <p className={styles.empty}>
          {data.lastSyncedAt
            ? 'Nenhuma vaga aberta combina com este objetivo agora. Procuramos de novo a cada 6 horas.'
            : 'Ainda estamos buscando as primeiras vagas. Isso leva até 6 horas.'}
        </p>
      ) : (
        <>
          <ul className={styles.list}>
            {data.items.slice(0, shown).map((item) => (
              <DiscoveryRow key={item.id} item={item} />
            ))}
          </ul>
          {shown < data.items.length ? (
            <div>
              <Button variant="secondary" onClick={() => setShown(shown + PAGE_SIZE)}>
                Mostrar mais vagas
              </Button>
            </div>
          ) : null}
          <p className={styles.footnote}>
            {data.total > data.items.length
              ? `Mostrando as ${data.items.length} mais recentes de ${data.total}. `
              : ''}
            Buscamos nas listagens públicas de um conjunto de empresas e nos repositórios de vagas
            de comunidades brasileiras no GitHub, então isso não é o mercado inteiro.{' '}
            {data.disclaimer}
          </p>
        </>
      )}
    </section>
  );
}
