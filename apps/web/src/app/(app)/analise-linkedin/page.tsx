'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Badge, Button, Notice, Skeleton, SyntheticDataNotice } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { formatDate, uploadDocument, validateFile } from '../../../lib/documents';
import { failureMessage, scoreLabel, scoreTone } from '../../../lib/linkedin';
import type { LinkedinAnalysisSummary, Me } from '../../../lib/types';
import { usePollWhile } from '../../../lib/use-poll';
import { useResource } from '../../../lib/use-resource';
import { LinkedinChecklist } from '../perfil/linkedin-checklist';
import styles from './linkedin.module.css';

const CHECKS = [
  'Título e "Sobre"',
  'Experiências e resultados',
  'Competências e formação',
  'Palavras-chave do cargo que você busca',
];

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/** Envio do PDF do LinkedIn e o histórico de análises, no modelo do Linkelyzer. */
export default function LinkedinAnalysesPage() {
  const router = useRouter();
  const me = useResource(() => api<Me>('/v1/me'));
  const analyses = useResource(() => api<LinkedinAnalysisSummary[]>('/v1/linkedin-analyses'));
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [granting, setGranting] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const busy = progress !== null;
  const aiAllowed = Boolean(me.data?.consents.granted.ai_processing);

  useEffect(() => () => controller.current?.abort(), []);
  usePollWhile(
    analyses.data?.some((a) => a.status === 'processing') ?? false,
    analyses.reload,
    analyses.data,
  );

  async function send(file: File) {
    const invalid = validateFile('linkedin_pdf', file);
    setError(invalid);
    if (invalid) return;
    controller.current = new AbortController();
    setProgress(0);
    try {
      const document = await uploadDocument(
        'linkedin_pdf',
        file,
        setProgress,
        controller.current.signal,
      );
      const analysis = await api<LinkedinAnalysisSummary>('/v1/linkedin-analyses', {
        method: 'POST',
        body: { documentId: document.id },
      });
      router.push(`/analise-linkedin/${analysis.id}`);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
      }
      setProgress(null);
    }
  }

  async function allowAi() {
    setGranting(true);
    setError(null);
    try {
      await api('/v1/me/consents/ai_processing', { method: 'PUT', body: { granted: true } });
      await me.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setGranting(false);
    }
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !busy) void send(file);
  }

  const list = analyses.data ?? [];
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Análise de LinkedIn</h1>
        <p className={styles.subtitle}>
          Envie o PDF do seu perfil e veja a nota de cada parte, o que mudar e textos prontos para
          colar no LinkedIn.
        </p>
      </header>

      <section className={styles.card} aria-labelledby="enviar">
        <h2 id="enviar" className="visually-hidden">
          Enviar o PDF do LinkedIn
        </h2>
        <ul className={styles.checks}>
          {CHECKS.map((check) => (
            <li key={check}>
              <CheckIcon />
              {check}
            </li>
          ))}
        </ul>

        {me.data?.syntheticDataOnly ? <SyntheticDataNotice /> : null}

        {me.data && !aiAllowed ? (
          <div className={styles.consent}>
            <p>
              A análise usa IA. Ao autorizar, o texto do PDF vai para o provedor de IA, sem e-mail,
              telefone e dados sensíveis.
            </p>
            <Button variant="secondary" disabled={granting} onClick={() => void allowAi()}>
              {granting ? 'Autorizando…' : 'Autorizar análise por IA'}
            </Button>
          </div>
        ) : (
          <label
            className={dragging ? `${styles.dropzone} ${styles.dragging}` : styles.dropzone}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
          >
            <input
              type="file"
              className="visually-hidden"
              accept="application/pdf,.pdf"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void send(file);
              }}
            />
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            <span className={styles.dropTitle}>
              {busy
                ? progress < 1
                  ? `Enviando… ${Math.round(progress * 100)}%`
                  : 'Começando a análise…'
                : 'Arraste o PDF do seu LinkedIn aqui'}
            </span>
            <span className={styles.dropHint}>
              {busy
                ? 'Não feche esta página.'
                : 'ou clique para escolher o arquivo · PDF, até 10 MB'}
            </span>
          </label>
        )}
        <p className={styles.footnote}>
          No LinkedIn, abra o seu perfil, clique em &quot;Recursos&quot; (ou &quot;Mais&quot;) e
          escolha &quot;Salvar como PDF&quot;. O mesmo envio também preenche o seu{' '}
          <Link href="/perfil?tab=profissional">perfil profissional</Link>.
        </p>
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </section>

      <section className={styles.card} aria-labelledby="historico">
        <h2 id="historico" className={styles.cardTitle}>
          Suas análises de LinkedIn
        </h2>
        {analyses.error && !analyses.data ? (
          <Notice tone="danger">{analyses.error.message}</Notice>
        ) : !analyses.data ? (
          <Skeleton height={88} />
        ) : list.length === 0 ? (
          <div className={styles.empty}>
            <strong>Nenhuma análise ainda</strong>
            <span>
              Envie o PDF do seu LinkedIn para ver como recrutadores enxergam o seu perfil.
            </span>
          </div>
        ) : (
          <ul className={styles.history} aria-live="polite">
            {list.map((item) => (
              <li key={item.id}>
                <Link href={`/analise-linkedin/${item.id}`} className={styles.historyRow}>
                  <span
                    className={styles.historyScore}
                    data-tone={item.score === null ? 'neutral' : scoreTone(item.score)}
                  >
                    {item.score ?? '–'}
                  </span>
                  <span className={styles.historyText}>
                    <span className={styles.historyTitle}>
                      Análise de {formatDate(item.createdAt)}
                    </span>
                    <span className={styles.historyMeta}>
                      {item.status === 'ready' && item.score !== null
                        ? `${scoreLabel(item.score)} · ${item.actionsDone} de ${item.actionsTotal} ações concluídas`
                        : item.status === 'failed'
                          ? failureMessage(item.failureCode)
                          : 'Analisando o seu perfil…'}
                    </span>
                  </span>
                  {item.status === 'processing' ? (
                    <Badge tone="info">Analisando</Badge>
                  ) : item.status === 'failed' ? (
                    <Badge tone="danger">Não concluída</Badge>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <LinkedinChecklist />
    </div>
  );
}
