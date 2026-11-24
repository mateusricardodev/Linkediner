'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AnalysisReport } from '../../../../components/analysis/analysis-report';
import styles from '../../../../components/analysis/analysis.module.css';
import { Button, ButtonLink } from '../../../../components/ui';
import {
  EDITABLE_ON_LINKEDIN,
  failureMessage,
  LINKEDIN_PROFILE_URL,
  SECTION_HINTS,
  SECTION_LABELS,
} from '../../../../lib/linkedin';
import type { LinkedinAnalysis, LinkedinSection } from '../../../../lib/types';

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

export default function LinkedinAnalysisPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AnalysisReport<LinkedinSection, LinkedinAnalysis>
      id={id}
      endpoint="/v1/linkedin-analyses"
      listHref="/analise-linkedin"
      subject="perfil"
      labels={SECTION_LABELS}
      hints={SECTION_HINTS}
      failureMessage={failureMessage}
      anotherLabel="Enviar outro PDF"
      defaultOpen="headline"
      sectionHeadExtra={(section) =>
        EDITABLE_ON_LINKEDIN.has(section.key) ? (
          <a
            href={LINKEDIN_PROFILE_URL}
            target="_blank"
            rel="noreferrer"
            className={styles.editLink}
          >
            Editar no LinkedIn ↗
          </a>
        ) : null
      }
      sectionBodyExtra={(section, analysis) => (
        <Rewrite section={section} locked={analysis.rewritesLocked} />
      )}
      asideExtra={(analysis) =>
        analysis.rewritesLocked ? (
          <div className={styles.upsell}>
            <strong>Desbloqueie os textos prontos</strong>
            <span>Título, sobre e experiência reescritos, prontos para colar.</span>
            <ButtonLink href="/perfil?tab=conta" variant="secondary" full>
              Ver planos
            </ButtonLink>
          </div>
        ) : null
      }
    />
  );
}
