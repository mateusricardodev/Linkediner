'use client';

import { useEffect, useState } from 'react';
import { api } from './api';
import { resolveGoal } from './goals';
import type { CareerGoal } from './types';
import { useResource } from './use-resource';

const STORAGE_KEY = 'linkediner.objetivo';

function readChosen(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** O objetivo usado na compatibilidade. A escolha só vale nesta aba: é uma conveniência. */
export function useGoal() {
  const goals = useResource(() => api<CareerGoal[]>('/v1/career-goals'));
  const [chosenId, setChosenId] = useState<string | null>(null);

  useEffect(() => setChosenId(readChosen()), []);

  function choose(id: string) {
    setChosenId(id);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Sem armazenamento, a escolha vale só até sair da página.
    }
  }

  const all = goals.data;
  return {
    /** Nulo até carregar: quem depende disso espera, para não comparar com o objetivo errado. */
    loaded: all !== null || goals.error !== null,
    active: (all ?? []).filter((goal) => goal.isActive),
    goal: all ? resolveGoal(all, chosenId) : null,
    choose,
  };
}

export const goalQuery = (goal: CareerGoal | null) => (goal ? `?goalId=${goal.id}` : '');
