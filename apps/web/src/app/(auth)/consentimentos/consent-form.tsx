'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Notice, Skeleton, SyntheticDataNotice } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { safePath } from '../../../lib/safe-path';
import type { Me } from '../../../lib/types';
import { useResource } from '../../../lib/use-resource';
import styles from '../auth.module.css';

const OPTIONS = [
  {
    purpose: 'terms',
    required: true,
    title: 'Termos de uso',
    href: '/termos',
    text: 'Obrigatório para usar o LinkedIner. O LinkedIner ajuda na candidatura, mas não garante entrevista nem contratação.',
  },
  {
    purpose: 'privacy',
    required: true,
    title: 'Política de privacidade',
    href: '/privacidade',
    text: 'Obrigatório. Seus documentos ficam guardados por até 30 dias, e você pode exportar ou apagar seus dados quando quiser.',
  },
  {
    purpose: 'ai_processing',
    required: false,
    title: 'Análise por IA',
    href: '/privacidade#ia',
    text: 'Opcional. Permite enviar o texto do seu currículo e das vagas ao provedor de IA, sem contato e sem dados sensíveis. Sem isso, a análise e a geração de material ficam desligadas.',
  },
] as const;

export function ConsentForm() {
  const router = useRouter();
  const next = safePath(useSearchParams().get('next'));
  const { data: me, error: loadError } = useResource(() => api<Me>('/v1/me'));
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loadError?.status === 401) {
      router.replace(`/entrar?next=${encodeURIComponent(`/consentimentos?next=${next}`)}`);
    }
  }, [loadError, next, router]);

  useEffect(() => {
    if (me) setChecked({ ...me.consents.granted });
  }, [me]);

  const canSubmit = OPTIONS.every((o) => !o.required || checked[o.purpose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!me) return;
    setBusy(true);
    setError(null);
    try {
      // Só o que mudou: cada decisão vira um registro no histórico de consentimentos.
      for (const { purpose } of OPTIONS) {
        const granted = Boolean(checked[purpose]);
        if (granted !== Boolean(me.consents.granted[purpose])) {
          await api(`/v1/me/consents/${purpose}`, { method: 'PUT', body: { granted } });
        }
      }
      router.replace(next);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
      setBusy(false);
    }
  }

  return (
    <div className={`${styles.panel} ${styles.panelWide}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>Suas autorizações</h1>
        <p className={styles.subtitle}>
          Você pode mudar a análise por IA a qualquer momento nas configurações.
        </p>
      </header>

      {loadError && loadError.status !== 401 ? (
        <Notice tone="danger">{loadError.message}</Notice>
      ) : !me ? (
        <Skeleton height={240} />
      ) : (
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {me.syntheticDataOnly ? <SyntheticDataNotice /> : null}
          <fieldset className={styles.group}>
            <legend className="visually-hidden">Autorizações</legend>
            {OPTIONS.map(({ purpose, title, text, required, href }) => (
              <label key={purpose} className={styles.option}>
                <input
                  type="checkbox"
                  checked={Boolean(checked[purpose])}
                  required={required}
                  onChange={(event) =>
                    setChecked((current) => ({ ...current, [purpose]: event.target.checked }))
                  }
                />
                <span>
                  <span className={styles.optionTitle}>{title}</span>
                  <span className={styles.optionText}>
                    {text} {/* Em outra aba, para não perder o que já foi marcado. */}
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      Ler o texto completo
                    </a>
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <Button type="submit" full disabled={busy || !canSubmit}>
            {busy ? 'Salvando…' : 'Continuar'}
          </Button>
          {me.syntheticDataOnly ? null : (
            <p className={styles.footer}>Seus dados não são usados para treinar modelos de IA.</p>
          )}
        </form>
      )}
    </div>
  );
}
