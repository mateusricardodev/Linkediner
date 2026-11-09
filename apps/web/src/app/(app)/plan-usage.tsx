'use client';

import { api } from '../../lib/api';
import type { BillingSummary } from '../../lib/types';
import { useResource } from '../../lib/use-resource';
import styles from './app-shell.module.css';

/** O contador que mais importa no dia a dia: análises de currículo no mês. */
const MAIN_FEATURE = 'profile.analysis';

/**
 * Plano e uso do mês no rodapé do menu. Sem resposta da API, não aparece: o menu nunca quebra
 * por causa disso.
 */
export function PlanUsage() {
  const { data } = useResource(() => api<BillingSummary>('/v1/billing'));
  if (!data) return null;
  const main = data.features.find((f) => f.feature === MAIN_FEATURE);
  const used = main?.used ?? 0;
  const limit = main?.limit ?? 0;
  return (
    <div className={styles.plan}>
      <span className={styles.planName}>Plano {data.plan.name}</span>
      {main && limit > 0 ? (
        <>
          <span
            className={styles.planBar}
            role="progressbar"
            aria-label="Análises de currículo usadas este mês"
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={used}
          >
            <span style={{ width: `${Math.min(used / limit, 1) * 100}%` }} />
          </span>
          <span className={styles.planText}>
            {used} de {limit} {limit === 1 ? 'análise' : 'análises'} este mês
          </span>
        </>
      ) : null}
    </div>
  );
}
