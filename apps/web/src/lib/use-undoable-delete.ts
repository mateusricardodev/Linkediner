'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../components/toast';
import { ApiError } from './api';

const UNDO_MS = 5000;

/**
 * Apagar com "Desfazer": o item some na hora, mas só é apagado de verdade depois de 5 s.
 * A API não restaura nada, então o desfazer acontece antes de o pedido sair.
 */
export function useUndoableDelete(
  commit: (id: string) => Promise<unknown>,
  onSettled: () => Promise<unknown> | void,
) {
  const toast = useToast();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  const show = useCallback((id: string) => {
    setHidden((current) => new Set(current).add(id));
  }, []);
  const reveal = useCallback((id: string) => {
    setHidden((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const remove = useCallback(
    (id: string, message: string) => {
      show(id);
      let closeToast = () => {};
      const timer = setTimeout(() => {
        timers.current.delete(id);
        closeToast();
        void (async () => {
          try {
            await commitRef.current(id);
          } catch (cause) {
            toast({
              message:
                cause instanceof ApiError
                  ? cause.message
                  : 'Não conseguimos apagar. Tente de novo.',
              tone: 'danger',
            });
          }
          // Só mostra de volta depois da lista nova, senão o item pisca.
          await settledRef.current();
          reveal(id);
        })();
      }, UNDO_MS);
      timers.current.set(id, timer);
      closeToast = toast({
        message,
        duration: UNDO_MS,
        action: {
          label: 'Desfazer',
          onClick: () => {
            clearTimeout(timers.current.get(id));
            timers.current.delete(id);
            reveal(id);
          },
        },
      });
    },
    [toast, show, reveal],
  );

  // Sair da tela dentro dos 5 s não cancela o que a pessoa pediu: apaga na hora.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const [id, timer] of pending) {
        clearTimeout(timer);
        void Promise.resolve(commitRef.current(id)).catch(() => undefined);
      }
      pending.clear();
    };
  }, []);

  return { hidden, remove };
}
