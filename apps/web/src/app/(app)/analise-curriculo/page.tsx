'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import styles from '../../../components/analysis/analysis.module.css';
import { Badge, Button, Notice, Skeleton, SyntheticDataNotice } from '../../../components/ui';
import { scoreLabel, scoreTone } from '../../../lib/analysis';
import { api, ApiError } from '../../../lib/api';
import { DOCUMENT_KINDS, formatDate, uploadDocument, validateFile } from '../../../lib/documents';
import { resumeFailureMessage } from '../../../lib/resume-analysis';
import type { Me, ResumeAnalysisSummary } from '../../../lib/types';
import { usePollWhile } from '../../../lib/use-poll';
import { useResource } from '../../../lib/use-resource';

const CHECKS = [
  'Leitura pelos sistemas de recrutamento (ATS)',
  'Resumo, experiências e resultados',
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

/**
 * Análise de currículo: a pessoa anexa o arquivo, clica em Analisar e vê, embaixo, os currículos
 * já analisados. A análise junta a conferência do arquivo (ATS) e a avaliação por IA.
 */
export default function ResumeAnalysesPage() {
  const router = useRouter();
  const me = useResource(() => api<Me>('/v1/me'));
  const analyses = useResource(() => api<ResumeAnalysisSummary[]>('/v1/resume-analyses'));
  const [file, setFile] = useState<File | null>(null);
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

  function choose(next: File | undefined) {
    if (!next || busy) return;
    const invalid = validateFile('resume', next);
    setError(invalid);
    setFile(invalid ? null : next);
  }

  async function analyze() {
    if (!file) return;
    controller.current = new AbortController();
    setProgress(0);
    setError(null);
    try {
      const document = await uploadDocument('resume', file, setProgress, controller.current.signal);
      const analysis = await api<ResumeAnalysisSummary>('/v1/resume-analyses', {
        method: 'POST',
        body: { documentId: document.id },
      });
      router.push(`/analise-curriculo/${analysis.id}`);
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
    choose(event.dataTransfer.files[0]);
  }

  const list = analyses.data ?? [];
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Análise de currículo</h1>
        <p className={styles.subtitle}>
          Anexe o currículo que você já usa e veja a nota de cada parte, como os sistemas de
          recrutamento leem o arquivo e o que mudar.
        </p>
      </header>

      <section className={styles.card} aria-labelledby="enviar">
        <h2 id="enviar" className="visually-hidden">
          Anexar o currículo
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
              A análise usa IA. Ao autorizar, o texto do currículo vai para o provedor de IA, sem
              e-mail, telefone e dados sensíveis.
            </p>
            <Button variant="secondary" disabled={granting} onClick={() => void allowAi()}>
              {granting ? 'Autorizando…' : 'Autorizar análise por IA'}
            </Button>
          </div>
        ) : (
          <>
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
                accept={DOCUMENT_KINDS.resume.accept}
                disabled={busy}
                onChange={(event) => {
                  const next = event.target.files?.[0];
                  event.target.value = '';
                  choose(next);
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
                  : file
                    ? file.name
                    : 'Arraste o seu currículo aqui'}
              </span>
              <span className={styles.dropHint}>
                {busy
                  ? 'Não feche esta página.'
                  : file
                    ? 'Clique para trocar o arquivo'
                    : `ou clique para escolher o arquivo · ${DOCUMENT_KINDS.resume.formats}`}
              </span>
            </label>
            <div className={styles.analyzeRow}>
              <Button disabled={!file || busy} onClick={() => void analyze()}>
                {busy ? 'Analisando…' : 'Analisar currículo'}
              </Button>
            </div>
          </>
        )}
        <p className={styles.footnote}>
          O mesmo envio também atualiza o seu{' '}
          <Link href="/perfil?tab=profissional">perfil profissional</Link>, e nada entra nele sem a
          sua conferência.
        </p>
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </section>

      <section className={styles.card} aria-labelledby="historico">
        <h2 id="historico" className={styles.cardTitle}>
          Currículos analisados
        </h2>
        {analyses.error && !analyses.data ? (
          <Notice tone="danger">{analyses.error.message}</Notice>
        ) : !analyses.data ? (
          <Skeleton height={88} />
        ) : list.length === 0 ? (
          <div className={styles.empty}>
            <strong>Nenhuma análise ainda</strong>
            <span>Anexe o seu currículo para ver como recrutadores e o ATS enxergam ele.</span>
          </div>
        ) : (
          <ul className={styles.history} aria-live="polite">
            {list.map((item) => (
              <li key={item.id}>
                <Link href={`/analise-curriculo/${item.id}`} className={styles.historyRow}>
                  <span
                    className={styles.historyScore}
                    data-tone={item.score === null ? 'neutral' : scoreTone(item.score)}
                  >
                    {item.score ?? '–'}
                  </span>
                  <span className={styles.historyText}>
                    <span className={styles.historyTitle}>
                      Análise de {formatDate(item.createdAt)}
                      {item.targetRole ? ` · ${item.targetRole}` : ''}
                    </span>
                    <span className={styles.historyMeta}>
                      {item.status === 'ready' && item.score !== null
                        ? `${scoreLabel(item.score)} · ${item.actionsDone} de ${item.actionsTotal} ações concluídas`
                        : item.status === 'failed'
                          ? resumeFailureMessage(item.failureCode)
                          : 'Analisando o seu currículo…'}
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
    </div>
  );
}
