'use client';

import { useEffect } from 'react';

const POLL_INTERVAL_MS = 3000;

/** Repete `tick` enquanto `active` for verdadeiro. `version` muda a cada resposta recebida. */
export function usePollWhile(active: boolean, tick: () => unknown, version: unknown) {
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [active, tick, version]);
}
