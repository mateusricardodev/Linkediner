'use client';

import { useState, type FormEvent } from 'react';
import { Badge, Button, Field, Notice, TextAreaField } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { buildFactData, describeFact, FACT_TYPES, VERIFICATION_LABELS } from '../../../lib/facts';
import type { ProfileFact } from '../../../lib/types';
import styles from './perfil.module.css';

export function FactItem({ fact, onChanged }: { fact: ProfileFact; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { title, meta, body } = describeFact(fact);
  const verification = VERIFICATION_LABELS[fact.verification];
  const rejected = fact.verification === 'rejected';

  async function decide(decision: {
    verification: 'user_confirmed' | 'rejected';
    data?: Record<string, string | null>;
  }) {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/profile/facts/${fact.id}`, { method: 'PATCH', body: decision });
      setEditing(false);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  function startEditing() {
    setValues(
      Object.fromEntries(
        FACT_TYPES[fact.type].fields.map(({ key }) => [key, fact.data[key] ?? '']),
      ),
    );
    setError(null);
    setEditing(true);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const { data, missing } = buildFactData(fact.type, values);
    if (missing.length > 0) {
      setError(`Preencha: ${missing.join(', ')}.`);
      return;
    }
    void decide({ verification: 'user_confirmed', data });
  }

  if (editing) {
    return (
      <li className={styles.fact}>
        <form className={styles.factForm} onSubmit={save}>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {FACT_TYPES[fact.type].fields.map((field) => {
            const props = {
              label: field.required ? field.label : `${field.label} (opcional)`,
              value: values[field.key] ?? '',
              required: field.required,
              maxLength: field.long ? 5000 : 300,
            };
            const onChange = (event: { target: { value: string } }) =>
              setValues((current) => ({ ...current, [field.key]: event.target.value }));
            return field.long ? (
              <TextAreaField key={field.key} {...props} onChange={onChange} />
            ) : (
              <Field key={field.key} {...props} onChange={onChange} />
            );
          })}
          <div className={styles.actions}>
            <Button type="submit" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar e confirmar'}
            </Button>
            <Button variant="plain" disabled={busy} onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={styles.fact}>
      <div className={styles.documentMain}>
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>{title}</span>
          {meta ? <span className={styles.rowMeta}>{meta}</span> : null}
        </div>
        <Badge tone={verification.tone}>{verification.label}</Badge>
      </div>
      {body ? <p className={styles.factBody}>{body}</p> : null}
      {fact.sourceSpan ? (
        <blockquote className={styles.source}>
          <span className={styles.sourceLabel}>Trecho do documento</span>
          {fact.sourceSpan}
        </blockquote>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className={styles.actions}>
        {fact.verification !== 'user_confirmed' ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void decide({ verification: 'user_confirmed' })}
          >
            {rejected ? 'Restaurar' : 'Confirmar'}
          </Button>
        ) : null}
        {!rejected ? (
          <>
            <Button variant="plain" disabled={busy} onClick={startEditing}>
              Corrigir
            </Button>
            <Button
              variant="plain"
              disabled={busy}
              onClick={() => void decide({ verification: 'rejected' })}
            >
              Recusar
            </Button>
          </>
        ) : null}
      </div>
    </li>
  );
}
