import Link from 'next/link';
import { useId, type ComponentProps, type ReactNode } from 'react';
import styles from './ui.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'plain';

const buttonClass = (variant: ButtonVariant, full?: boolean, extra?: string) =>
  [styles.button, styles[variant], full ? styles.full : '', extra ?? ''].filter(Boolean).join(' ');

export function Button({
  variant = 'primary',
  full,
  className,
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; full?: boolean }) {
  return <button type={type} className={buttonClass(variant, full, className)} {...props} />;
}

export function ButtonLink({
  variant = 'primary',
  full,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; full?: boolean }) {
  return <Link className={buttonClass(variant, full, className)} {...props} />;
}

export function Field({
  label,
  hint,
  ...props
}: ComponentProps<'input'> & { label: string; hint?: string }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        aria-describedby={hint ? hintId : undefined}
        {...props}
      />
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextAreaField({ label, ...props }: ComponentProps<'textarea'> & { label: string }) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <textarea id={id} className={`${styles.input} ${styles.textarea}`} rows={4} {...props} />
    </div>
  );
}

export function Notice({
  tone = 'neutral',
  children,
}: {
  tone?: 'danger' | 'neutral';
  children: ReactNode;
}) {
  return (
    <p
      className={`${styles.notice} ${styles[`notice-${tone}`]}`}
      role={tone === 'danger' ? 'alert' : undefined}
    >
      {children}
    </p>
  );
}

export type BadgeTone = 'neutral' | 'info' | 'accent' | 'success' | 'warning' | 'danger';

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`${styles.badge} ${styles[`badge-${tone}`]}`}>{children}</span>;
}

/** Só o número e o anel: quem usa precisa mostrar também os motivos e o aviso do score. */
export function ScoreRing({ value, size = 112 }: { value: number; size?: number }) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className={styles.ring} style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <circle
          className={styles['ring-track']}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className={styles['ring-value']}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
        />
      </svg>
      <span className={styles['ring-label']}>{value}</span>
    </div>
  );
}

export function Skeleton({
  width = '100%',
  height = 16,
}: {
  width?: number | string;
  height?: number;
}) {
  return <span className={styles.skeleton} style={{ width, height }} aria-hidden />;
}
