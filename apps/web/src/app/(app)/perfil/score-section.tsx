import { Notice, ScoreRing, Skeleton } from '../../../components/ui';
import type { ApiError } from '../../../lib/api';
import { formatDate } from '../../../lib/documents';
import { previousScore } from '../../../lib/resumes';
import type { ProfileScore } from '../../../lib/types';
import styles from './perfil.module.css';

/** O score nunca aparece sem os motivos e sem o aviso de que não indica chance de contratação. */
export function ScoreSection({
  score,
  error,
}: {
  score: ProfileScore | null;
  error: ApiError | null;
}) {
  const gaps = score?.factors.filter((f) => f.kind === 'gap') ?? [];
  const positives = score?.factors.filter((f) => f.kind === 'positive') ?? [];
  const previous = score ? previousScore(score.history) : null;

  return (
    <section aria-labelledby="score" className={styles.section}>
      <h2 id="score" className={styles.sectionTitle}>
        Score do perfil
      </h2>
      {error && !score ? (
        <Notice tone="danger">{error.message}</Notice>
      ) : !score ? (
        <Skeleton height={200} />
      ) : (
        <div className={styles.score}>
          <div className={styles.scoreRing}>
            <ScoreRing value={score.score} />
            <span className="visually-hidden">Score do perfil: {score.score} de 100</span>
            {previous ? (
              <p className={styles.footnote}>
                Antes: {previous.score}, em {formatDate(previous.calculatedAt)}
              </p>
            ) : null}
          </div>
          <div className={styles.scoreFactors}>
            {gaps.length > 0 ? (
              <div>
                <h3 className={styles.groupTitle}>O que melhorar</h3>
                <ul className={styles.factors}>
                  {gaps.map((factor) => (
                    <li key={factor.criterion}>
                      <span>{factor.recommendation ?? factor.label}</span>
                      <span className={styles.points}>
                        {factor.points} de {factor.maxPoints}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {positives.length > 0 ? (
              <div>
                <h3 className={styles.groupTitle}>O que ajuda</h3>
                <ul className={styles.factors}>
                  {positives.map((factor) => (
                    <li key={factor.criterion}>
                      <span>{factor.label}</span>
                      <span className={styles.points}>
                        {factor.points} de {factor.maxPoints}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className={styles.footnote}>{score.disclaimer}</p>
          </div>
        </div>
      )}
    </section>
  );
}
