'use client';

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import styles from './toast.module.css';

export interface ToastOptions {
  message: string;
  tone?: 'neutral' | 'success' | 'danger';
  /** Ação opcional, como "Desfazer". Clicar nela também fecha o aviso. */
  action?: { label: string; onClick: () => void };
  /** Em milissegundos. Avisos com ação ficam mais tempo, para dar tempo de agir. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const DEFAULT_MS = 4000;
const ACTION_MS = 6000;
const MAX_VISIBLE = 3;

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

/** Mostra um aviso curto no canto da tela, sem bloquear o uso. */
export function useToast() {
  const show = use(ToastContext);
  if (!show) throw new Error('useToast fora do ToastProvider.');
  return show;
}

const GLYPH = { neutral: 'i', success: '✓', danger: '!' } as const;

function Toast({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [paused, setPaused] = useState(false);
  const duration = item.duration ?? (item.action ? ACTION_MS : DEFAULT_MS);
  const tone = item.tone ?? 'neutral';
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Com o mouse ou o foco em cima, o aviso espera: ninguém perde a chance de clicar em "Desfazer".
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => closeRef.current(), duration);
    return () => clearTimeout(timer);
  }, [paused, duration]);

  return (
    <div
      className={`${styles.toast} ${styles[tone]}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={styles.glyph} aria-hidden>
        {GLYPH[tone]}
      </span>
      <span className={styles.message}>{item.message}</span>
      {item.action ? (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            item.action?.onClick();
            onClose();
          }}
        >
          {item.action.label}
        </button>
      ) : null}
      <button type="button" className={styles.close} aria-label="Fechar aviso" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const close = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = useCallback((options: ToastOptions) => {
    const id = ++nextId.current;
    setItems((current) => [...current, { ...options, id }].slice(-MAX_VISIBLE));
  }, []);

  return (
    <ToastContext value={show}>
      {children}
      <div className={styles.viewport} role="region" aria-label="Avisos" aria-live="polite">
        {items.map((item) => (
          <Toast key={item.id} item={item} onClose={() => close(item.id)} />
        ))}
      </div>
    </ToastContext>
  );
}
