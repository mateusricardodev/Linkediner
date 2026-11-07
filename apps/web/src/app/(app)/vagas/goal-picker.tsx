'use client';

import Link from 'next/link';
import type { useGoal } from '../../../lib/use-goal';
import styles from './vagas.module.css';

/** Mostra com qual objetivo a compatibilidade está sendo calculada, e deixa trocar. */
export function GoalPicker({ goalState }: { goalState: ReturnType<typeof useGoal> }) {
  const { loaded, active, goal, choose } = goalState;
  if (!loaded) return null;

  if (!goal) {
    return (
      <p className={styles.goalLine}>
        Sem objetivo de carreira ativo, a compatibilidade não considera senioridade nem modelo de
        trabalho. <Link href="/perfil#objetivos">Definir objetivo</Link>
      </p>
    );
  }
  if (active.length === 1) {
    return (
      <p className={styles.goalLine}>
        Comparando com o objetivo <strong>{goal.title}</strong>.
      </p>
    );
  }
  return (
    <div className={styles.goalPicker}>
      <label htmlFor="objetivo-em-uso">Comparando com o objetivo</label>
      <select
        id="objetivo-em-uso"
        className={styles.select}
        value={goal.id}
        onChange={(event) => choose(event.target.value)}
      >
        {active.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select>
    </div>
  );
}
