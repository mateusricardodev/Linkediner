'use client';

import { useState } from 'react';
import { Badge, Button, Notice, type BadgeTone } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import {
  canAnalyze,
  DOCUMENT_KINDS,
  extractionNote,
  failureMessage,
  formatBytes,
  formatDate,
} from '../../../lib/documents';
import type { DocumentRecord } from '../../../lib/types';
import styles from './perfil.module.css';

const STATUS: Record<DocumentRecord['status'], { label: string; tone: BadgeTone }> = {
  pending_upload: { label: 'Enviando', tone: 'info' },
  uploaded: { label: 'Aguardando análise', tone: 'neutral' },
  processing: { label: 'Analisando', tone: 'info' },
  processed: { label: 'Analisado', tone: 'success' },
  failed: { label: 'Não analisado', tone: 'danger' },
};

export function DocumentRow({
  document,
  aiAllowed,
  onChanged,
}: {
  document: DocumentRecord;
  aiAllowed: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = STATUS[document.status];
  const note = extractionNote(document);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={styles.documentRow}>
      <div className={styles.documentMain}>
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>{DOCUMENT_KINDS[document.kind].title}</span>
          <span className={styles.rowMeta}>
            {formatBytes(document.sizeBytes)} · apagado em {formatDate(document.expiresAt)}
          </span>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      {document.status === 'failed' ? (
        <p className={styles.failure}>{failureMessage(document.failureCode)}</p>
      ) : null}
      {note ? <Notice tone="warning">{note}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {confirming ? (
        <div className={styles.actions}>
          <p className={styles.confirmText}>
            Apagar o arquivo e os fatos ainda não confirmados? Isso não pode ser desfeito.
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api(`/v1/documents/${document.id}`, { method: 'DELETE' });
                onChanged();
              })
            }
          >
            {busy ? 'Apagando…' : 'Apagar'}
          </Button>
          <Button variant="plain" disabled={busy} onClick={() => setConfirming(false)}>
            Manter
          </Button>
        </div>
      ) : (
        <div className={styles.actions}>
          {aiAllowed && canAnalyze(document) ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api(`/v1/documents/${document.id}/extract`, { method: 'POST' });
                  onChanged();
                })
              }
            >
              {document.status === 'failed' ? 'Tentar de novo' : 'Analisar'}
            </Button>
          ) : null}
          <Button
            variant="plain"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const { url } = await api<{ url: string }>(`/v1/documents/${document.id}/download`);
                window.location.assign(url);
              })
            }
          >
            Baixar
          </Button>
          <Button variant="plain" disabled={busy} onClick={() => setConfirming(true)}>
            Apagar
          </Button>
        </div>
      )}
    </li>
  );
}
