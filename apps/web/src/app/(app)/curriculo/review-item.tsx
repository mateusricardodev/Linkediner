'use client';

import { useState, type FormEvent } from 'react';
import { Badge, Button, Notice, TextAreaField } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { restoreDecision, SUGGESTION_REASONS } from '../../../lib/resumes';
import type { ResumeItem } from '../../../lib/types';
import styles from './curriculo.module.css';

type Decision = { action: 'confirm'; text?: string } | { action: 'remove' };

/** Uma frase gerada, para confirmar, corrigir ou remover. A pessoa é quem sabe se ela é verdadeira. */
export function ReviewItem({
  item,
  path,
  onChanged,
  readOnly = false,
  maxLength = 600,
  createsFacts = false,
  tips,
}: {
  item: ResumeItem;
  /** Melhorias pontuais da conferência ATS para esta frase. */
  tips?: string[];
  /** Onde gravar a decisão sobre esta frase. */
  path: (itemId: string) => string;
  onChanged: () => void;
  readOnly?: boolean;
  maxLength?: number;
  /** No currículo, a frase confirmada passa a fazer parte dos fatos. Na carta, não. */
  createsFacts?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggested = item.status === 'suggested';
  const removed = item.status === 'removed';

  async function decide(decision: Decision) {
    setBusy(true);
    setError(null);
    try {
      await api(path(item.id), { method: 'PATCH', body: decision });
      setEditing(false);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) {
      setError('Escreva a frase ou use Remover.');
      return;
    }
    void decide({ action: 'confirm', text: value });
  }

  if (editing) {
    return (
      <li className={styles.item}>
        <form className={styles.editForm} onSubmit={save}>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <TextAreaField
            label="Frase"
            value={text}
            maxLength={maxLength}
            required
            onChange={(event) => setText(event.target.value)}
          />
          <p className={styles.footnote}>
            Ao salvar, você confirma que esta frase é verdadeira.
            {createsFacts ? ' Ela passa a fazer parte dos seus fatos.' : ''}
          </p>
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
    <li
      id={`frase-${item.id}`}
      className={suggested ? `${styles.item} ${styles.suggested}` : styles.item}
    >
      <div className={styles.itemHead}>
        <p className={removed ? `${styles.itemText} ${styles.removedText}` : styles.itemText}>
          {item.text}
        </p>
        {suggested ? <Badge tone="warning">Precisa da sua confirmação</Badge> : null}
        {item.status === 'user_confirmed' ? <Badge tone="success">Confirmada</Badge> : null}
        {removed ? <Badge tone="neutral">Fora do material</Badge> : null}
      </div>
      {suggested && item.reason ? (
        <p className={styles.reason}>{SUGGESTION_REASONS[item.reason]}</p>
      ) : null}
      {tips?.length && !removed ? (
        <ul className={styles.tips} aria-label="Melhorias para os sistemas de recrutamento">
          {tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {readOnly ? null : (
        <div className={styles.actions}>
          {suggested ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void decide({ action: 'confirm' })}
            >
              Confirmar
            </Button>
          ) : null}
          {removed ? (
            <Button
              variant="plain"
              disabled={busy}
              onClick={() => void decide(restoreDecision(item))}
            >
              {/* A sugestão sem fonte passa a valer como afirmação sua: o botão precisa dizer isso. */}
              {item.reason ? 'Confirmar e restaurar' : 'Restaurar'}
            </Button>
          ) : (
            <>
              <Button
                variant="plain"
                disabled={busy}
                onClick={() => {
                  setText(item.text);
                  setError(null);
                  setEditing(true);
                }}
              >
                Corrigir
              </Button>
              <Button
                variant="plain"
                disabled={busy}
                onClick={() => void decide({ action: 'remove' })}
              >
                Remover
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
