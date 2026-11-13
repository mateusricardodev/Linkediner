import Link from 'next/link';
import { useId, type ComponentProps, type ReactNode } from 'react';
import styles from './ui.module.css';

/** `danger` confirma o que não tem volta; `plain-danger` é o gatilho que leva até essa confirmação. */
type ButtonVariant = 'primary' | 'secondary' | 'plain' | 'danger' | 'plain-danger';

const buttonClass = (variant: ButtonVariant, full?: boolean, extra?: string) =>
  [styles.button, styles[variant], full ? styles.full : '', extra ?? ''].filter(Boolean).join(' ');

export function Button({
  variant = 'primary',
  full,
  className,
  type = 'button',
  reason,
  ...props
}: ComponentProps<'button'> & {
  variant?: ButtonVariant;
  full?: boolean;
  /** O que falta para liberar o botão. Passe só enquanto ele estiver bloqueado por falta de algo. */
  reason?: string | null;
}) {
  const reasonId = useId();
  const button = (
    <button
      type={type}
      className={buttonClass(variant, full, className)}
      {...props}
      aria-describedby={reason ? reasonId : props['aria-describedby']}
    />
  );
  if (!reason) return button;
  return (
    <span className={`${styles.withReason} ${full ? styles.withReasonFull : ''}`}>
      {button}
      <span id={reasonId} className={styles.reason}>
        {reason}
      </span>
    </span>
  );
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

export function SelectField({
  label,
  children,
  ...props
}: ComponentProps<'select'> & { label: string }) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <select id={id} className={styles.input} {...props}>
        {children}
      </select>
    </div>
  );
}

export function Notice({
  tone = 'neutral',
  children,
}: {
  tone?: 'danger' | 'warning' | 'neutral';
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

/** Aparece onde o dado sai para a IA, enquanto o plano permitir que o provedor use o conteúdo. */
export function SyntheticDataNotice() {
  return (
    <Notice tone="warning">
      <strong>Ambiente de testes: use só dados fictícios.</strong> A IA está no plano gratuito, em
      que o Google pode usar o conteúdo enviado e revisores humanos podem lê-lo. Não envie seu
      currículo real.
    </Notice>
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
