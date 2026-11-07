'use client';

import { Badge, Notice, ScoreRing, Skeleton } from '../../../../components/ui';
import { api } from '../../../../lib/api';
import { REQUIREMENT_STATUS } from '../../../../lib/jobs';
import type { JobMatch } from '../../../../lib/types';
import { useResource } from '../../../../lib/use-resource';
import styles from '../vagas.module.css';

type Requirement = JobMatch['requirements'][number];

function Requirements({ title, items }: { title: string; items: Requirement[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className={styles.groupTitle}>{title}</h3>
      <ul className={styles.list}>
        {items.map((requirement, index) => {
          const status = REQUIREMENT_STATUS[requirement.status];
          return (
            <li key={index} className={styles.requirement}>
              <span className={styles.requirementText}>{requirement.text}</span>
              <Badge tone={status.tone}>{status.label}</Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** O número nunca aparece sem os motivos e sem o aviso de que não indica chance de contratação. */
export function JobMatchSection({ jobId }: { jobId: string }) {
  const { data: match, error } = useResource(() => api<JobMatch>(`/v1/jobs/${jobId}/match`));

  return (
    <section aria-labelledby="compatibilidade" className={styles.section}>
      <h2 id="compatibilidade" className={styles.sectionTitle}>
        Compatibilidade
      </h2>
      {error && !match ? (
        <Notice tone="danger">{error.message}</Notice>
      ) : !match ? (
        <Skeleton height={200} />
      ) : (
        <>
          <div className={styles.matchCard}>
            {match.score === null ? (
              <p className={styles.calloutText}>
                Esta vaga não traz requisitos claros, então não há o que comparar.
              </p>
            ) : (
              <div className={styles.ring}>
                <ScoreRing value={match.score} />
                <span className="visually-hidden">Compatibilidade: {match.score} de 100</span>
              </div>
            )}
            <div className={styles.matchDetails}>
              {match.factors.length > 0 ? (
                <ul className={styles.factors}>
                  {match.factors.map((factor) => (
                    <li key={factor.criterion}>
                      <span>{factor.label}</span>
                      <span className={styles.points}>
                        {factor.points} de {factor.maxPoints}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {match.recommendations.length > 0 ? (
                <div>
                  <h3 className={styles.groupTitle}>O que fazer</h3>
                  <ul className={styles.recommendations}>
                    {match.recommendations.map((recommendation, index) => (
                      <li key={index}>{recommendation}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className={styles.footnote}>{match.disclaimer}</p>
            </div>
          </div>
          <Requirements
            title="Requisitos obrigatórios"
            items={match.requirements.filter((r) => r.kind === 'must_have')}
          />
          <Requirements
            title="Desejáveis"
            items={match.requirements.filter((r) => r.kind === 'nice_to_have')}
          />
        </>
      )}
    </section>
  );
}
