'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

/** Carrega um dado ao abrir a tela. Uma resposta antiga nunca substitui a mais recente. */
export function useResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    const request = ++latest.current;
    setLoading(true);
    try {
      const result = await loadRef.current();
      if (request !== latest.current) return;
      setData(result);
      setError(null);
    } catch (cause) {
      if (request !== latest.current) return;
      setError(cause instanceof ApiError ? cause : new ApiError('Algo deu errado.', 0, 'UNKNOWN'));
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}
