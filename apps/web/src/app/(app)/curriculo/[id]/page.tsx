'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, ButtonLink, Notice, Skeleton } from '../../../../components/ui';
import { api, ApiError } from '../../../../lib/api';
import { formatDate } from '../../../../lib/documents';
import {
  downloadResume,
  pendingCount,
  resumeDescription,
  RESUME_STATUS,
  resumeFailureMessage,
} from '../../../../lib/resumes';
import type { AtsReport, Job, Resume } from '../../../../lib/types';
import { usePollWhile } from '../../../../lib/use-poll';
import { useResource } from '../../../../lib/use-resource';
import styles from '../curriculo.module.css';
import { AtsPanel } from '../ats-panel';
import { ResumeContentView } from '../resume-content';

/** Enquanto a IA escreve: o que está acontecendo, sem barra de progresso inventada. */
function GeneratingState({ description }: { description: string }) {
  const steps = [
    'Lemos as experiências, a formação e as competências confirmadas do seu perfil.',
    'Escrevemos o resumo e os tópicos de cada experiência.',
    'Conferimos cada frase com o seu perfil. O que não tiver fonte fica marcado para você decidir.',
  ];
  return (
    <div className={styles.reviewLayout}>
      <div className={styles.reviewMain}>
        <section className={styles.generatingCard} aria-live="polite">
          <div className={styles.generatingHead}>
            <span className={styles.spinner} aria-hidden />
            <div>
              <h2 className={styles.generatingTitle}>Escrevendo o seu currículo</h2>
              <p className={styles.footnote}>
                Leva alguns minutos. Você pode sair desta página: o currículo aparece em Gerar
                currículo quando ficar pronto.
              </p>
            </div>
          </div>
          <ol className={styles.generatingSteps}>
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
        <div className={styles.paperSkeleton} aria-hidden>
          <Skeleton width="45%" height={28} />
          <Skeleton width="30%" height={16} />
          <Skeleton height={14} />
          <Skeleton width="92%" height={14} />
          <Skeleton width="40%" height={20} />
          <Skeleton height={14} />
          <Skeleton width="85%" height={14} />
          <Skeleton width="88%" height={14} />
          <Skeleton width="40%" height={20} />
          <Skeleton width="70%" height={14} />
        </div>
      </div>
      <aside className={styles.reviewAside}>
        <section className={styles.sideCard} aria-labelledby="pedido">
          <h2 id="pedido" className={styles.sideTitle}>
            Seu pedido
          </h2>
          <p className={styles.footnote}>{description}</p>
          <p className={styles.footnote}>
            Quando terminar, você revisa cada frase, aprova e baixa em PDF ou DOCX.
          </p>
        </section>
      </aside>
    </div>
  );
}

export default function ResumePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data: resume, error, reload } = useResource(() => api<Resume>(`/v1/resumes/${id}`));
  const jobs = useResource(() => api<Job[]>('/v1/jobs'));
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  usePollWhile(resume?.status === 'generating', reload, resume);

  // A conferência ATS depende do conteúdo: refaz a cada mudança do currículo.
  const hasContent = Boolean(resume?.content);
  const { data: ats, reload: reloadAts } = useResource(() =>
    hasContent ? api<AtsReport>(`/v1/resumes/${id}/ats`) : Promise.resolve(null),
  );
  useEffect(() => {
    if (hasContent) void reloadAts();
  }, [resume, hasContent, reloadAts]);
  const tips = useMemo(() => {
    const byItem = new Map<string, string[]>();
    for (const tip of ats?.tips ?? []) {
      byItem.set(tip.itemId, [...(byItem.get(tip.itemId) ?? []), tip.message]);
    }
    return byItem;
  }, [ats]);

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
    <div className={`${styles.page} ${styles.pageWide}`}>
      <header className={styles.header}>
        <Link href="/curriculo" className={styles.back}>
          ‹ Currículos
        </Link>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Revisar currículo</h1>
          {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
        </div>
        {resume ? (
          <p className={styles.subtitle}>
            {resume.status === 'generating' ? 'Pedido em' : 'Gerado em'}{' '}
            {formatDate(resume.createdAt)} · {resumeDescription(resume, jobs.data ?? [])}
          </p>
        ) : null}
      </header>

      {error && !resume ? (
        <Notice tone="danger">{error.message}</Notice>
      ) : !resume ? (
        <Skeleton height={240} />
      ) : resume.status === 'generating' ? (
        <GeneratingState description={resumeDescription(resume, jobs.data ?? [])} />
      ) : resume.status === 'failed' ? (
        <div className={styles.failedCard}>
          <Notice tone="danger">{resumeFailureMessage(resume.failureCode)}</Notice>
          <p className={styles.footnote}>
            O limite do seu plano foi devolvido: tentar de novo não conta duas vezes.
          </p>
          {actionError ? <Notice tone="danger">{actionError}</Notice> : null}
          <div className={styles.actions}>
            <Button
              disabled={busy !== null}
              onClick={() =>
                void run('retry', async () => {
                  const next = await api<Resume>('/v1/resumes', {
                    method: 'POST',
                    body: { language: resume.language, jobId: resume.jobId },
                  });
                  router.replace(`/curriculo/${next.id}`);
                })
              }
            >
              {busy === 'retry' ? 'Pedindo…' : 'Tentar de novo'}
            </Button>
            <ButtonLink href="/curriculo" variant="plain">
              Mudar as escolhas
            </ButtonLink>
          </div>
        </div>
      ) : null}

      {resume?.content ? (
        <div className={styles.reviewLayout}>
          <div className={styles.reviewMain}>
            <ResumeContentView
              content={resume.content}
              path={(itemId) => `/v1/resumes/${resume.id}/items/${itemId}`}
              onChanged={() => void reload()}
              tips={tips}
            />
          </div>
          <aside className={styles.reviewAside}>
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
                      Aprovado{resume.approvedAt ? ` em ${formatDate(resume.approvedAt)}` : ''}.
                      Qualquer alteração exige aprovar de novo.
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
            {ats ? (
              <div className={styles.atsSlot}>
                <AtsPanel report={ats} />
              </div>
            ) : null}
          </aside>
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
          {!reviewable && resume.status !== 'failed' && actionError ? (
            <Notice tone="danger">{actionError}</Notice>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
