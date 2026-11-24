'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { api, ApiError } from '../../lib/api';
import {
  actionProgress,
  scoreLabel,
  scoreTone,
  type AnalysisBase,
  type AnalysisSectionBase,
} from '../../lib/analysis';
import { formatDate } from '../../lib/documents';
import { usePollWhile } from '../../lib/use-poll';
import { useResource } from '../../lib/use-resource';
import { Button, ButtonLink, Notice, ScoreRing, Skeleton } from '../ui';
import styles from './analysis.module.css';

type Action = { id: string; text: string; done: boolean };

export function ActionList({
  actions,
  onToggle,
}: {
  actions: Action[];
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

function SectionCard<S extends AnalysisSectionBase>({
  section,
  label,
  hint,
  open,
  onToggleOpen,
  actions,
  onToggleAction,
  headExtra,
  bodyExtra,
}: {
  section: S;
  label: string;
  hint: string | undefined;
  open: boolean;
  onToggleOpen: () => void;
  actions: Action[];
  onToggleAction: (id: string, done: boolean) => void;
  headExtra: ReactNode;
  bodyExtra: ReactNode;
}) {
  const done = actions.filter((a) => a.done).length;
  const panel = `secao-${section.key}`;
  return (
    <section className={styles.section} aria-label={label}>
      <div className={styles.sectionHead}>
        <button
          type="button"
          className={styles.sectionToggle}
          aria-expanded={open}
          aria-controls={panel}
          onClick={onToggleOpen}
        >
          <span className={styles.sectionTitle}>{label}</span>
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
        {headExtra}
      </div>
      {open ? (
        <div id={panel} className={styles.sectionBody}>
          <p>
            <strong>Análise:</strong> {section.analysis}
          </p>
          {section.tip ? <p className={styles.tip}>{section.tip}</p> : null}
          {bodyExtra}
          {section.breakdown.length > 0 ? (
            <details className={styles.breakdown}>
              <summary>Detalhamento da pontuação</summary>
              <ul>
                {section.breakdown.map((item) => (
                  <li key={item.criterion}>
                    <span>{item.criterion}</span>
                    <span className={styles.points}>
                      {item.max === 1
                        ? item.points === 1
                          ? 'Atendido'
                          : 'Não atendido'
                        : `${item.points} de ${item.max}`}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {hint ? <p className={styles.hint}>{hint}</p> : null}
          {actions.length > 0 ? (
            <div>
              <p className={styles.checklistTitle}>Checklist para a seção {label}</p>
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
 * Análise que falhou: tenta de novo com o mesmo arquivo, se ele ainda estiver guardado. O limite do
 * plano já foi devolvido, então tentar de novo não gasta duas vezes.
 */
function RetryActions({
  documentId,
  endpoint,
  listHref,
  anotherLabel,
}: {
  documentId: string | null;
  endpoint: string;
  listHref: string;
  anotherLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    if (!documentId) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api<{ id: string }>(endpoint, { method: 'POST', body: { documentId } });
      router.replace(`${listHref}/${next.id}`);
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
        <ButtonLink href={listHref} variant={documentId ? 'plain' : 'primary'}>
          {anotherLabel}
        </ButtonLink>
      </div>
    </div>
  );
}

export interface AnalysisReportProps<S extends AnalysisSectionBase, A extends AnalysisBase<S>> {
  id: string;
  /** Rota da API, como /v1/linkedin-analyses. */
  endpoint: string;
  /** Página com o envio e o histórico, como /analise-linkedin. */
  listHref: string;
  /** "perfil" ou "currículo", usado nos títulos. */
  subject: string;
  labels: Record<string, string>;
  hints: Partial<Record<string, string>>;
  failureMessage: (code: string | null) => string;
  /** Texto do botão que volta para enviar outro arquivo. */
  anotherLabel: string;
  /** Seção aberta ao chegar. */
  defaultOpen: string;
  /** Ao lado do título de cada seção, como "Editar no LinkedIn". */
  sectionHeadExtra?: (section: S) => ReactNode;
  /** Dentro de cada seção, depois da dica, como o texto pronto para colar. */
  sectionBodyExtra?: (section: S, analysis: A) => ReactNode;
  /** No fim do painel de próximos passos. */
  asideExtra?: (analysis: A) => ReactNode;
}

/**
 * Detalhe de uma análise, no modelo do Linkelyzer: nota geral, resumo, uma seção recolhível por
 * parte e o painel de próximos passos com o checklist salvo.
 */
export function AnalysisReport<S extends AnalysisSectionBase, A extends AnalysisBase<S>>(
  props: AnalysisReportProps<S, A>,
) {
  const { id, endpoint, listHref, subject, labels, hints } = props;
  const resource = useResource(() => api<A>(`${endpoint}/${id}`));
  const [done, setDone] = useState<string[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set([props.defaultOpen]));
  const analysis = resource.data;
  usePollWhile(analysis?.status === 'processing', resource.reload, resource.data);

  if (resource.error && !analysis) {
    return (
      <div className={styles.page}>
        <Notice tone="danger">{resource.error.message}</Notice>
        <Link href={listHref}>Voltar para as análises</Link>
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
              ? `Analisando o seu ${subject}…`
              : 'A análise não terminou'}
          </h1>
          <p className={styles.subtitle}>
            {analysis.status === 'processing'
              ? 'Leva cerca de um minuto. Esta página atualiza sozinha.'
              : props.failureMessage(analysis.failureCode)}
          </p>
        </header>
        {analysis.status === 'processing' ? (
          <Skeleton height={240} />
        ) : (
          <RetryActions
            documentId={analysis.documentId}
            endpoint={endpoint}
            listHref={listHref}
            anotherLabel={props.anotherLabel}
          />
        )}
      </div>
    );
  }

  const current = { ...analysis, doneActions: done ?? analysis.doneActions };
  const progress = actionProgress(current, labels);
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
      const saved = await api<{ doneActions: string[] }>(`${endpoint}/${id}/actions`, {
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
          <h1 className={styles.title}>Sua análise de {subject} está pronta!</h1>
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
                Pontuação do seu {subject}
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
              label={labels[section.key] ?? section.key}
              hint={hints[section.key]}
              open={open.has(section.key)}
              onToggleOpen={() => toggleOpen(section.key)}
              actions={actionsOf(section.key)}
              onToggleAction={(actionId, checked) => void toggle(actionId, checked)}
              headExtra={props.sectionHeadExtra?.(section)}
              bodyExtra={props.sectionBodyExtra?.(section, analysis)}
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
          {props.asideExtra?.(analysis)}
        </aside>
      </div>
    </div>
  );
}
