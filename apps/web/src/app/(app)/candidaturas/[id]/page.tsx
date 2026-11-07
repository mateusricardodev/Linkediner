'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { APPLICATION_STATE_LABELS } from '../../../../components/application-state';
import { Badge, Button, Notice, Skeleton } from '../../../../components/ui';
import { api, ApiError } from '../../../../lib/api';
import {
  canClose,
  hasResumeForApproval,
  materialAvailability,
  OUTCOME_LABELS,
  outcomesFor,
  pendingInMaterials,
} from '../../../../lib/applications';
import { formatDate } from '../../../../lib/documents';
import type {
  ApplicationDetail,
  ApplicationMaterial,
  BillingSummary,
  Resume,
} from '../../../../lib/types';
import { usePollWhile } from '../../../../lib/use-poll';
import { useResource } from '../../../../lib/use-resource';
import styles from '../candidaturas.module.css';
import { ManualPackage } from './manual-package';
import { Materials } from './materials';

export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useResource(() => api<ApplicationDetail>(`/v1/applications/${id}`));
  const materials = useResource(() =>
    api<ApplicationMaterial[]>(`/v1/applications/${id}/materials`),
  );
  const resumes = useResource(() => api<Resume[]>('/v1/resumes'));
  const billing = useResource(() => api<BillingSummary>('/v1/billing'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [resumeId, setResumeId] = useState('');

  const refresh = () => {
    void detail.reload();
    void materials.reload();
  };

  const application = detail.data?.application;
  const list = materials.data ?? [];
  const generating = list.some((m) => m.status === 'generating');
  usePollWhile(application?.state === 'analyzing' || generating, refresh, materials.data);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setConfirmingClose(false);
      refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }
  const post = (path: string, body?: unknown) => () =>
    api(`/v1/applications/${id}/${path}`, { method: 'POST', ...(body ? { body } : {}) });

  const state = application?.state;
  const label = state ? APPLICATION_STATE_LABELS[state] : null;
  const beforeApproval = state === 'saved' || state === 'analyzing' || state === 'in_review';
  const inReview = state === 'in_review';
  const frozen =
    state === 'manual_action_required' ||
    state === 'sent' ||
    state === 'interview_received' ||
    state === 'rejected';
  const pending = pendingInMaterials(list);
  const hasResume = application ? hasResumeForApproval(application, list) : false;
  const approvedResumes = (resumes.data ?? []).filter((r) => r.status === 'approved').reverse();
  const canChooseResume = state === 'saved' || state === 'in_review';
  const canTailor = materialAvailability(billing.data, 'resume') === 'available';
  const resumeHint = canTailor
    ? 'Escolha um currículo aprovado ou gere um para esta vaga.'
    : 'Escolha um currículo aprovado para continuar.';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/candidaturas" className={styles.back}>
          ‹ Candidaturas
        </Link>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{application?.job.title ?? 'Candidatura'}</h1>
          {label ? <Badge tone={label.tone}>{label.label}</Badge> : null}
        </div>
        {application?.job.company ? (
          <p className={styles.subtitle}>{application.job.company}</p>
        ) : null}
        {application?.jobId ? (
          <Link href={`/vagas/${application.jobId}`} className={styles.back}>
            Ver a compatibilidade com esta vaga
          </Link>
        ) : null}
      </header>

      {detail.error && !detail.data ? (
        <Notice tone="danger">{detail.error.message}</Notice>
      ) : !application ? (
        <Skeleton height={240} />
      ) : (
        <>
          {canChooseResume ? (
            <section className={styles.material}>
              <h3 className={styles.materialTitle}>Currículo geral</h3>
              {approvedResumes.length === 0 ? (
                <p className={styles.description}>
                  Você não tem um currículo aprovado. Aprove um em{' '}
                  <Link href="/curriculo">Currículo</Link>
                  {canTailor ? ' ou gere um para esta vaga abaixo.' : ' e volte para esta página.'}
                </p>
              ) : (
                <>
                  <p className={styles.description}>
                    Use um currículo já aprovado, sem gerar nada novo. Se houver um currículo para
                    esta vaga, ele tem prioridade.
                  </p>
                  <div className={styles.actions}>
                    <label className="visually-hidden" htmlFor="curriculo-aprovado">
                      Currículo aprovado
                    </label>
                    <select
                      id="curriculo-aprovado"
                      className={styles.select}
                      value={resumeId || application.resumeId || approvedResumes[0]!.id}
                      onChange={(event) => setResumeId(event.target.value)}
                    >
                      {approvedResumes.map((resume) => (
                        <option key={resume.id} value={resume.id}>
                          Aprovado em {formatDate(resume.approvedAt ?? resume.createdAt)}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          api(`/v1/applications/${id}/resume`, {
                            method: 'PUT',
                            body: { resumeId: resumeId || approvedResumes[0]!.id },
                          }),
                        )
                      }
                    >
                      {application.resumeId ? 'Trocar' : 'Usar este'}
                    </Button>
                  </div>
                  {application.resumeId ? (
                    <p className={styles.description}>Currículo escolhido para esta candidatura.</p>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          {materials.error && !materials.data ? (
            <Notice tone="danger">{materials.error.message}</Notice>
          ) : !materials.data ? (
            <Skeleton height={160} />
          ) : frozen ? null : (
            <Materials
              applicationId={application.id}
              materials={list}
              billing={billing.data}
              canGenerate={beforeApproval}
              canEdit={inReview}
              onChanged={refresh}
            />
          )}

          {frozen && materials.data ? (
            <section className={styles.block}>
              <h2 className={styles.sectionTitle}>Material aprovado</h2>
              <ManualPackage application={application} materials={list} />
            </section>
          ) : null}

          <div className={styles.actionBar} aria-live="polite">
            {error ? <Notice tone="danger">{error}</Notice> : null}
            {state === 'saved' ? <p className={styles.actionText}>{resumeHint}</p> : null}
            {state === 'analyzing' ? (
              <p className={styles.actionText}>Gerando o material. Aguarde para revisar.</p>
            ) : null}
            {inReview ? (
              <div className={styles.actionRow}>
                <p className={styles.actionText}>
                  {generating
                    ? 'Aguarde o fim da geração.'
                    : pending === 1
                      ? '1 frase ainda precisa da sua decisão.'
                      : pending > 1
                        ? `${pending} frases ainda precisam da sua decisão.`
                        : !hasResume
                          ? resumeHint
                          : 'Tudo revisado.'}
                </p>
                <Button
                  disabled={busy || generating || pending > 0 || !hasResume}
                  onClick={() => void run(post('submit-for-approval'))}
                >
                  Concluir revisão
                </Button>
              </div>
            ) : null}
            {state === 'awaiting_approval' ? (
              <div className={styles.actionRow}>
                <p className={styles.actionText}>
                  Ao aprovar, o material fica congelado. Nada é enviado: o envio é feito por você.
                </p>
                <div className={styles.actions}>
                  <Button disabled={busy} onClick={() => void run(post('approve'))}>
                    Aprovar candidatura
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void run(post('request-changes'))}
                  >
                    Voltar para a revisão
                  </Button>
                </div>
              </div>
            ) : null}
            {state === 'manual_action_required' ? (
              <div className={styles.actionRow}>
                <p className={styles.actionText}>
                  O LinkedIner não enviou nada. Envie pela página da vaga e depois marque aqui.
                </p>
                <Button disabled={busy} onClick={() => void run(post('manual-complete'))}>
                  Já enviei
                </Button>
              </div>
            ) : null}
            {state && outcomesFor(state).length > 0 ? (
              <div className={styles.actionRow}>
                <p className={styles.actionText}>
                  {application.submittedAt
                    ? `Enviada em ${formatDate(application.submittedAt)}. O que aconteceu depois?`
                    : 'O que aconteceu depois?'}
                </p>
                <div className={styles.actions}>
                  {outcomesFor(state).map((outcome) => (
                    <Button
                      key={outcome}
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void run(post('outcome', { outcome }))}
                    >
                      {OUTCOME_LABELS[outcome]}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            {state === 'closed' ? (
              <p className={styles.actionText}>Esta candidatura está encerrada.</p>
            ) : null}
          </div>

          {detail.data && detail.data.events.length > 0 ? (
            <details className={styles.history}>
              <summary>Histórico</summary>
              <ol>
                {[...detail.data.events].reverse().map((event, index) => (
                  <li key={index}>
                    <span>{APPLICATION_STATE_LABELS[event.to].label}</span>
                    <span className={styles.description}>
                      {new Date(event.createdAt).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                      {event.actor === 'user' ? ' · por você' : ' · pelo sistema'}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}

          {state && canClose(state) ? (
            <div className={styles.dangerZone}>
              {confirmingClose ? (
                <>
                  <p className={styles.confirmText}>
                    Desistir desta candidatura? Ela fica encerrada e não pode ser reaberta.
                  </p>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void run(post('close'))}
                  >
                    Desistir
                  </Button>
                  <Button variant="plain" disabled={busy} onClick={() => setConfirmingClose(false)}>
                    Manter
                  </Button>
                </>
              ) : (
                <Button variant="plain" onClick={() => setConfirmingClose(true)}>
                  Desistir da candidatura
                </Button>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
