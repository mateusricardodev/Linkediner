'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Field, Notice } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { safePath } from '../../lib/safe-path';
import styles from './auth.module.css';

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  linkedin: 'LinkedIn',
};

/** Só aparecem os provedores configurados na API. */
const PROVIDERS = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? '')
  .split(',')
  .map((p) => p.trim())
  .filter((p) => p in PROVIDER_LABELS);

const errorMessage = (cause: unknown) =>
  cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo em instantes.';

/** Erros com que o login social volta para esta tela, no parâmetro `error`. */
const SOCIAL_ERRORS: Record<string, string> = {
  // O e-mail já tem conta com senha. Ligar as duas sem confirmar o e-mail abriria a conta de alguém.
  account_not_linked:
    'Já existe uma conta com este e-mail. Entre com e-mail e senha para continuar.',
  access_denied: 'O login foi cancelado. Você pode tentar de novo ou entrar com e-mail e senha.',
  user_cancelled_login:
    'O login foi cancelado. Você pode tentar de novo ou entrar com e-mail e senha.',
  user_cancelled_authorize:
    'O login foi cancelado. Você pode tentar de novo ou entrar com e-mail e senha.',
  email_not_found: 'O provedor não informou o seu e-mail. Entre com e-mail e senha.',
};
const socialError = (code: string | null) =>
  code
    ? (SOCIAL_ERRORS[code] ?? 'Não foi possível entrar com essa conta. Tente de novo em instantes.')
    : null;

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safePath(params.get('next'));
  const [error, setError] = useState<string | null>(() => socialError(params.get('error')));
  const [busy, setBusy] = useState(false);
  const signUp = mode === 'sign-up';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/auth/${signUp ? 'sign-up' : 'sign-in'}/email`, {
        method: 'POST',
        body: {
          email: form.get('email'),
          password: form.get('password'),
          ...(signUp ? { name: form.get('name') } : {}),
        },
      });
      // A área logada confere os consentimentos e manda para a tela deles, se faltar algum.
      router.replace(next);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  async function continueWith(provider: string) {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>('/v1/auth/sign-in/social', {
        method: 'POST',
        body: {
          provider,
          callbackURL: `${window.location.origin}${next}`,
          // Em caso de erro, a pessoa volta para esta tela, e não para uma página da API.
          errorCallbackURL: `${window.location.origin}${window.location.pathname}?next=${encodeURIComponent(next)}`,
        },
      });
      window.location.assign(url);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  const otherPath = signUp ? '/entrar' : '/criar-conta';
  const otherHref =
    next === '/inicio' ? otherPath : `${otherPath}?next=${encodeURIComponent(next)}`;

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.mark} aria-hidden>
          L
        </div>
        <h1 className={styles.title}>{signUp ? 'Criar conta' : 'Entrar no LinkedIner'}</h1>
      </header>

      {PROVIDERS.length > 0 ? (
        <>
          <div className={styles.providers}>
            {PROVIDERS.map((provider) => (
              <Button
                key={provider}
                variant="secondary"
                full
                disabled={busy}
                onClick={() => void continueWith(provider)}
              >
                Continuar com {PROVIDER_LABELS[provider]}
              </Button>
            ))}
          </div>
          <div className={styles.divider}>ou</div>
        </>
      ) : null}

      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {signUp ? (
          <Field label="Nome" name="name" autoComplete="name" required maxLength={120} />
        ) : null}
        <Field label="E-mail" name="email" type="email" autoComplete="email" required />
        <Field
          label="Senha"
          name="password"
          type="password"
          autoComplete={signUp ? 'new-password' : 'current-password'}
          required
          minLength={signUp ? 10 : undefined}
          maxLength={128}
          hint={signUp ? 'Use pelo menos 10 caracteres.' : undefined}
        />
        <Button type="submit" full disabled={busy}>
          {busy ? 'Aguarde…' : signUp ? 'Criar conta' : 'Entrar'}
        </Button>
      </form>

      <p className={styles.footer}>
        {signUp ? 'Já tem conta? ' : 'Ainda não tem conta? '}
        <Link href={otherHref}>{signUp ? 'Entrar' : 'Criar conta grátis'}</Link>
      </p>
      <p className={styles.footer}>
        Ao continuar, você concorda com os <Link href="/termos">Termos de Uso</Link> e a{' '}
        <Link href="/privacidade">Política de Privacidade</Link>. Seus documentos não são usados
        para treinar IA.
      </p>
    </div>
  );
}
