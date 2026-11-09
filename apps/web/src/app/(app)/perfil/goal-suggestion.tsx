'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Notice } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { buildGoalBody, suggestGoal, type GoalForm } from '../../../lib/goals';
import { SENIORITY_LABELS } from '../../../lib/jobs';
import type { ProfileFact } from '../../../lib/types';
import { useResource } from '../../../lib/use-resource';
import styles from './perfil.module.css';

/**
 * "Pelo seu perfil, você atua como X. É por aí?": um objetivo a partir da experiência mais recente.
 * Nada é salvo sem a pessoa confirmar. Sem experiência comprovada, não aparece.
 */
export function GoalSuggestion({
  onCreated,
  onAdjust,
}: {
  onCreated: () => void;
  /** Abre o formulário já preenchido. Sem isso, o ajuste leva ao Perfil. */
  onAdjust?: (form: GoalForm) => void;
}) {
  const facts = useResource(() => api<ProfileFact[]>('/v1/profile/facts'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestion = facts.data ? suggestGoal(facts.data) : null;
  if (!suggestion) return null;

  async function accept() {
    const { body } = buildGoalBody(suggestion!.form);
    if (!body) {
      onAdjust?.(suggestion!.form);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/v1/career-goals', { method: 'POST', body });
      onCreated();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
      setBusy(false);
    }
  }

  const level = SENIORITY_LABELS[suggestion.form.seniority];
  return (
    <div className={styles.suggestion}>
      <p className={styles.suggestionText}>
        Pelo seu perfil, você atua como <strong>{suggestion.role}</strong>
        {suggestion.seniorityFound ? `, nível ${level.toLowerCase()}` : ''}. É por aí que quer
        buscar vagas?
      </p>
      {suggestion.seniorityFound ? null : (
        <p className={styles.footnote}>
          O cargo não diz o nível: deixamos {level.toLowerCase()}, e você pode ajustar.
        </p>
      )}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className={styles.actions}>
        <Button disabled={busy} onClick={() => void accept()}>
          {busy ? 'Salvando…' : 'Sim, é isso'}
        </Button>
        {onAdjust ? (
          <Button variant="plain" disabled={busy} onClick={() => onAdjust(suggestion.form)}>
            Ajustar antes
          </Button>
        ) : (
          <Link href="/perfil#objetivos" className={styles.suggestionLink}>
            Ajustar no perfil
          </Link>
        )}
      </div>
    </div>
  );
}
