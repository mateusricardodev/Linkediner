'use client';

import { useState } from 'react';
import { Badge, Button, Notice, TextAreaField } from '../../../../components/ui';
import { api, ApiError } from '../../../../lib/api';
import {
  asAnswers,
  asLetter,
  asResume,
  MATERIAL_TITLES,
  materialAvailability,
  materialFailureMessage,
  parseQuestions,
} from '../../../../lib/applications';
import type { ApplicationMaterial, BillingSummary } from '../../../../lib/types';
import { ResumeContentView } from '../../curriculo/resume-content';
import { ReviewItem } from '../../curriculo/review-item';
import styles from '../candidaturas.module.css';

type Kind = ApplicationMaterial['kind'];

const DESCRIPTIONS: Record<Kind, string> = {
  resume: 'Reorganiza o que está no seu perfil para os requisitos desta vaga.',
  cover_letter: 'Uma carta curta, escrita só com o que está comprovado no seu perfil.',
  form_answers: 'Cole as perguntas do formulário da vaga, uma por linha.',
};

function MaterialBody({
  material,
  editable,
  onChanged,
}: {
  material: ApplicationMaterial;
  editable: boolean;
  onChanged: () => void;
}) {
  const path = (itemId: string) =>
    `/v1/applications/${material.applicationId}/materials/${material.id}/items/${itemId}`;
  const itemProps = { path, onChanged, readOnly: !editable };

  if (material.kind === 'resume') {
    return <ResumeContentView content={asResume(material)} createsFacts {...itemProps} />;
  }
  if (material.kind === 'cover_letter') {
    return (
      <ul className={styles.items}>
        {asLetter(material).paragraphs.map((item) => (
          <ReviewItem key={item.id} item={item} maxLength={2000} {...itemProps} />
        ))}
      </ul>
    );
  }
  return (
    <div className={styles.answers}>
      {asAnswers(material).answers.map(({ question, answer }, index) => (
        <div key={index}>
          <h4 className={styles.question}>{question}</h4>
          {answer ? (
            <ul className={styles.items}>
              <ReviewItem item={answer} maxLength={2000} {...itemProps} />
            </ul>
          ) : (
            <p className={styles.unanswered}>
              Seus fatos não respondem a esta pergunta, então ela fica para você responder por conta
              própria.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function MaterialCard({
  kind,
  material,
  applicationId,
  canGenerate,
  canEdit,
  exhausted,
  onChanged,
}: {
  kind: Kind;
  material: ApplicationMaterial | undefined;
  applicationId: string;
  /** Gerar é possível antes da aprovação. Revisar frase a frase, só em revisão. */
  canGenerate: boolean;
  canEdit: boolean;
  /** O limite do mês acabou: o que já existe continua, mas não dá para gerar mais. */
  exhausted: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState((material?.questions ?? []).join('\n'));
  const [confirming, setConfirming] = useState<'replace' | 'delete' | null>(null);
  const ready = material?.status === 'ready' && material.content;
  const generating = material?.status === 'generating';

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setConfirming(null);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  const generate = () =>
    run(() =>
      api(`/v1/applications/${applicationId}/materials`, {
        method: 'POST',
        body: {
          kind,
          ...(kind === 'form_answers' ? { questions: parseQuestions(questions) } : {}),
        },
      }),
    );

  // Depois de aprovado, só aparece o que existe: não há o que gerar nem o que mudar.
  if (!canGenerate && !ready) return null;

  return (
    <section className={styles.material}>
      <div className={styles.materialHead}>
        <div>
          <h3 className={styles.materialTitle}>{MATERIAL_TITLES[kind]}</h3>
          {!ready && !generating ? (
            <p className={styles.description}>{DESCRIPTIONS[kind]}</p>
          ) : null}
        </div>
        {generating ? <Badge tone="info">Gerando</Badge> : null}
      </div>

      {material?.status === 'failed' ? (
        <Notice tone="danger">{materialFailureMessage(material.failureCode)}</Notice>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {generating ? (
        <p className={styles.description} aria-live="polite">
          Isso pode levar alguns minutos, e você pode sair desta página.
        </p>
      ) : null}

      {ready ? <MaterialBody material={material} editable={canEdit} onChanged={onChanged} /> : null}

      {canGenerate && exhausted && !generating ? (
        <p className={styles.description}>
          O limite do seu plano para este material acabou neste mês.
        </p>
      ) : null}

      {canGenerate && !exhausted && !generating ? (
        <>
          {kind === 'form_answers' ? (
            <TextAreaField
              label="Perguntas do formulário"
              rows={4}
              value={questions}
              onChange={(event) => setQuestions(event.target.value)}
            />
          ) : null}
          {confirming === 'replace' ? (
            <div className={styles.actions}>
              <p className={styles.confirmText}>
                Gerar de novo substitui este material, inclusive o que você já revisou.
              </p>
              <Button variant="danger" disabled={busy} onClick={() => void generate()}>
                {busy ? 'Pedindo…' : 'Substituir'}
              </Button>
              <Button variant="plain" disabled={busy} onClick={() => setConfirming(null)}>
                Manter
              </Button>
            </div>
          ) : confirming === 'delete' ? (
            <div className={styles.actions}>
              <p className={styles.confirmText}>Apagar este material?</p>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    api(`/v1/applications/${applicationId}/materials/${material!.id}`, {
                      method: 'DELETE',
                    }),
                  )
                }
              >
                {busy ? 'Apagando…' : 'Apagar'}
              </Button>
              <Button variant="plain" disabled={busy} onClick={() => setConfirming(null)}>
                Manter
              </Button>
            </div>
          ) : (
            <div className={styles.actions}>
              <Button
                variant="secondary"
                disabled={
                  busy || (kind === 'form_answers' && parseQuestions(questions).length === 0)
                }
                reason={
                  !busy && kind === 'form_answers' && parseQuestions(questions).length === 0
                    ? 'Escreva ao menos uma pergunta.'
                    : null
                }
                onClick={() => (ready ? setConfirming('replace') : void generate())}
              >
                {busy ? 'Pedindo…' : ready ? 'Gerar de novo' : 'Gerar'}
              </Button>
              {material && canEdit ? (
                <Button
                  variant="plain-danger"
                  disabled={busy}
                  onClick={() => setConfirming('delete')}
                >
                  Apagar
                </Button>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

export function Materials({
  applicationId,
  materials,
  billing,
  canGenerate,
  canEdit,
  onChanged,
}: {
  applicationId: string;
  materials: ApplicationMaterial[];
  billing: BillingSummary | null;
  canGenerate: boolean;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const kinds = ['resume', 'cover_letter', 'form_answers'] as const;
  // Um material que já existe continua à vista, mesmo que o plano não permita gerar outro.
  const shown = kinds.filter(
    (kind) =>
      materialAvailability(billing, kind) !== 'not_in_plan' ||
      materials.some((m) => m.kind === kind),
  );
  return (
    <>
      {shown.map((kind) => (
        <MaterialCard
          key={kind}
          kind={kind}
          material={materials.find((m) => m.kind === kind)}
          applicationId={applicationId}
          canGenerate={canGenerate}
          canEdit={canEdit}
          exhausted={materialAvailability(billing, kind) !== 'available'}
          onChanged={onChanged}
        />
      ))}
      {canGenerate && shown.length < kinds.length ? (
        <p className={styles.description}>
          Currículo adaptado à vaga, carta de apresentação e respostas de formulário fazem parte dos
          planos pagos.
        </p>
      ) : null}
    </>
  );
}
