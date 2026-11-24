'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ButtonLink, Notice, ScoreRing, Skeleton } from '../../../../components/ui';
import { api, ApiError } from '../../../../lib/api';
import { formatDate } from '../../../../lib/documents';
import {
  actionProgress,
  EDITABLE_ON_LINKEDIN,
  failureMessage,
  LINKEDIN_PROFILE_URL,
  scoreLabel,
  scoreTone,
  SECTION_HINTS,
  SECTION_LABELS,
} from '../../../../lib/linkedin';
import type { LinkedinAnalysis, LinkedinSection } from '../../../../lib/types';
import { usePollWhile } from '../../../../lib/use-poll';
import { useResource } from '../../../../lib/use-resource';
import styles from '../linkedin.module.css';

/** Seções com texto pronto, quando o plano inclui. */
const REWRITABLE = new Set<LinkedinSection['key']>(['headline', 'about', 'experience']);

function Rewrite({ section, locked }: { section: LinkedinSection; locked: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!REWRITABLE.has(section.key)) return null;
  if (locked) {
    return (
      <div className={`${styles.rewrite} ${styles.rewriteLocked}`}>
        <p className={styles.rewriteLabel}>
          Texto pronto para colar <span className={styles.premium}>Premium</span>
        </p>
        <p className={styles.rewriteBlur} aria-hidden>
          Analista com experiência em projetos de dados, que transforma informação em decisões e
          entrega painéis usados pelas áreas de negócio todos os dias.
        </p>
        <ButtonLink href="/perfil?tab=conta" variant="secondary">
          Ver planos
        </ButtonLink>
      </div>
    );
  }
  if (!section.rewrite) return null;
  return (
    <div className={styles.rewrite}>
      <p className={styles.rewriteLabel}>
        Texto pronto para colar <span className={styles.premium}>Premium</span>
      </p>
      <p className={styles.rewriteText}>{section.rewrite}</p>
      <div className={styles.rewriteFoot}>
        <span className={styles.footnote}>
          Usa só o que está no seu perfil. Revise antes de colar.
        </span>
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(section.rewrite ?? '').then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
    </div>
  );
}

function ActionList({
  actions,
  onToggle,
}: {
  actions: { id: string; text: string; done: boolean }[];
  onToggle: (id: string, done: boolean) => void;
}) {
  return (
    <ul className={styles.actions}>
      {actions.map((action) => (
        <li key={action.id}>
          <label className={action.done ? `${styles.action} ${styles.actionDone}` : styles.action}>
            <input
              type="checkbox"
              checked={action.done}
              onChange={(event) => onToggle(action.id, event.target.checked)}
            />
            <span>{action.text}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function SectionCard({
  section,
  locked,
  open,
  onToggleOpen,
  actions,
  onToggleAction,
}: {
  section: LinkedinSection;
  locked: boolean;
  open: boolean;
  onToggleOpen: () => void;
  actions: { id: string; text: string; done: boolean }[];
  onToggleAction: (id: string, done: boolean) => void;
}) {
  const done = actions.filter((a) => a.done).length;
  const panel = `secao-${section.key}`;
  const hint = SECTION_HINTS[section.key];
  return (
    <section className={styles.section} aria-label={SECTION_LABELS[section.key]}>
      <div className={styles.sectionHead}>
        <button
          type="button"
          className={styles.sectionToggle}
          aria-expanded={open}
          aria-controls={panel}
          onClick={onToggleOpen}
        >
          <span className={styles.sectionTitle}>{SECTION_LABELS[section.key]}</span>
          {actions.length > 0 ? (
            <span className={styles.sectionDone}>
              ✓ {done}/{actions.length}
            </span>
          ) : null}
          <span className={styles.sectionScore} data-tone={scoreTone(section.score)}>
            {section.score}
            <span>/100</span>
          </span>
          <svg
            className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {EDITABLE_ON_LINKEDIN.has(section.key) ? (
          <a
            href={LINKEDIN_PROFILE_URL}
            target="_blank"
            rel="noreferrer"
            className={styles.editLink}
          >
            Editar no LinkedIn ↗
          </a>
        ) : null}
      </div>
      {open ? (
        <div id={panel} className={styles.sectionBody}>
          <p>
            <strong>Análise:</strong> {section.analysis}
          </p>
          {section.tip ? <p className={styles.tip}>{section.tip}</p> : null}
          <Rewrite section={section} locked={locked} />
          {section.breakdown.length > 0 ? (
            <details className={styles.breakdown}>
              <summary>Detalhamento da pontuação</summary>
              <ul>
                {section.breakdown.map((item) => (
                  <li key={item.criterion}>
                    <span>{item.criterion}</span>
                    <span className={styles.points}>
                      {item.points} de {item.max}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {hint ? <p className={styles.hint}>{hint}</p> : null}
          {actions.length > 0 ? (
            <div>
              <p className={styles.checklistTitle}>
                Checklist para a seção {SECTION_LABELS[section.key]}
              </p>
              <ActionList actions={actions} onToggle={onToggleAction} />
              <p className={styles.footnote}>
                {done} de {actions.length} concluídos
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Análise que falhou: tenta de novo com o mesmo PDF, se ele ainda estiver guardado. O limite do
 * plano já foi devolvido, então tentar de novo não gasta duas vezes.
 */
function RetryActions({ documentId }: { documentId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    if (!documentId) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api<{ id: string }>('/v1/linkedin-analyses', {
        method: 'POST',
        body: { documentId },
      });
      router.replace(`/analise-linkedin/${next.id}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
      setBusy(false);
    }
  }

  return (
    <div className={styles.retry}>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className={styles.retryButtons}>
        {documentId ? (
          <Button disabled={busy} onClick={() => void retry()}>
            {busy ? 'Pedindo…' : 'Tentar de novo'}
          </Button>
        ) : null}
        <ButtonLink href="/analise-linkedin" variant={documentId ? 'plain' : 'primary'}>
          Enviar outro PDF
        </ButtonLink>
      </div>
    </div>
  );
}

export default function LinkedinAnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const resource = useResource(() => api<LinkedinAnalysis>(`/v1/linkedin-analyses/${id}`));
  const [done, setDone] = useState<string[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set(['headline']));
  const analysis = resource.data;
  usePollWhile(analysis?.status === 'processing', resource.reload, resource.data);

  if (resource.error && !analysis) {
    return (
      <div className={styles.page}>
        <Notice tone="danger">{resource.error.message}</Notice>
        <Link href="/analise-linkedin">Voltar para as análises</Link>
      </div>
    );
  }
  if (!analysis) return <Skeleton height={320} />;

  if (analysis.status !== 'ready' || !analysis.result) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            {analysis.status === 'processing'
              ? 'Analisando o seu perfil…'
              : 'A análise não terminou'}
          </h1>
          <p className={styles.subtitle}>
            {analysis.status === 'processing'
              ? 'Leva cerca de um minuto. Esta página atualiza sozinha.'
              : failureMessage(analysis.failureCode)}
          </p>
        </header>
        {analysis.status === 'processing' ? (
          <Skeleton height={240} />
        ) : (
          <RetryActions documentId={analysis.documentId} />
        )}
      </div>
    );
  }

  const current = { ...analysis, doneActions: done ?? analysis.doneActions };
  const progress = actionProgress(current);
  const actionsOf = (key: string) => progress.sections.find((s) => s.key === key)?.actions ?? [];
  const result = analysis.result;

  async function toggle(actionId: string, checked: boolean) {
    const previous = current.doneActions;
    const next = checked
      ? [...previous, actionId]
      : previous.filter((existing) => existing !== actionId);
    setDone(next);
    setSaveError(null);
    try {
      const saved = await api<{ doneActions: string[] }>(`/v1/linkedin-analyses/${id}/actions`, {
        method: 'PUT',
        body: { doneActions: next },
      });
      setDone(saved.doneActions);
    } catch (cause) {
      setDone(previous);
      setSaveError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar.');
    }
  }

  const toggleOpen = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const percent =
    progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);

  return (
    <div className={styles.page}>
      <header className={styles.headerRow}>
        <div className={styles.header}>
          <h1 className={styles.title}>Sua análise de perfil está pronta!</h1>
          <p className={styles.subtitle}>
            Recomendações para você se destacar
            {analysis.targetRole ? ` como ${analysis.targetRole}` : ''}.
          </p>
        </div>
        <span className={styles.date}>{formatDate(analysis.createdAt)}</span>
      </header>
      {!analysis.targetRole ? (
        <Notice>
          Sem um objetivo profissional, as palavras-chave são avaliadas de forma geral.{' '}
          <Link href="/perfil?tab=profissional#objetivos">Definir objetivo</Link>
        </Notice>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.scoreCard} aria-labelledby="pontuacao">
            <div className={styles.scoreRing}>
              <ScoreRing value={result.score} size={136} />
              <h2 id="pontuacao" className={styles.cardTitle}>
                Pontuação do seu perfil
              </h2>
              <p className={styles.scoreText}>{scoreLabel(result.score)}</p>
            </div>
            <div className={styles.scoreProgress}>
              <p>
                <strong>
                  {progress.completed} de {progress.total} ações concluídas
                </strong>
                <span>{percent}%</span>
              </p>
              <span
                className={styles.bar}
                role="progressbar"
                aria-label="Ações concluídas"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.completed}
              >
                <span style={{ width: `${percent}%` }} />
              </span>
              <p className={styles.footnote}>
                Abra cada seção abaixo e marque o que fizer. Seu progresso fica salvo.
              </p>
            </div>
          </section>

          <section className={styles.summary} aria-labelledby="resumo">
            <h2 id="resumo" className={styles.summaryTitle}>
              Resumo geral
            </h2>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryBox} data-tone="success">
                <h3>
                  Pontos fortes <span>{result.strengths.length}</span>
                </h3>
                <ul>
                  {result.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.summaryBox} data-tone="warning">
                <h3>
                  Pontos de melhoria <span>{result.improvements.length}</span>
                </h3>
                <ul>
                  {result.improvements.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.summaryBox}>
                <h3>Palavras-chave ausentes</h3>
                {result.missingKeywords.length > 0 ? (
                  <ul className={styles.keywords}>
                    {result.missingKeywords.map((keyword) => (
                      <li key={keyword}>{keyword}</li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.footnote}>Nenhuma palavra-chave importante faltando.</p>
                )}
              </div>
              <div className={styles.summaryBox}>
                <h3>Posição competitiva</h3>
                <p>{result.competitivePosition}</p>
              </div>
            </div>
          </section>

          {result.sections.map((section) => (
            <SectionCard
              key={section.key}
              section={section}
              locked={analysis.rewritesLocked}
              open={open.has(section.key)}
              onToggleOpen={() => toggleOpen(section.key)}
              actions={actionsOf(section.key)}
              onToggleAction={(actionId, checked) => void toggle(actionId, checked)}
            />
          ))}
        </div>

        <aside className={styles.aside} aria-labelledby="proximos">
          <p className={styles.asideCount}>
            <strong>{progress.completed}</strong>/{progress.total} ações concluídas
          </p>
          <span className={styles.bar} aria-hidden>
            <span style={{ width: `${percent}%` }} />
          </span>
          <h2 id="proximos" className={styles.asideTitle}>
            Próximos passos
          </h2>
          {saveError ? <Notice tone="danger">{saveError}</Notice> : null}
          {progress.sections.map((group) => (
            <div key={group.key} className={styles.asideGroup}>
              <p>
                {group.label}
                <span>
                  {group.actions.filter((a) => a.done).length}/{group.actions.length}
                </span>
              </p>
              <ActionList
                actions={group.actions}
                onToggle={(actionId, checked) => void toggle(actionId, checked)}
              />
            </div>
          ))}
          {analysis.rewritesLocked ? (
            <div className={styles.upsell}>
              <strong>Desbloqueie os textos prontos</strong>
              <span>Título, sobre e experiência reescritos, prontos para colar.</span>
              <ButtonLink href="/perfil?tab=conta" variant="secondary" full>
                Ver planos
              </ButtonLink>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
