'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Button, Notice } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { DOCUMENT_KINDS, uploadDocument, validateFile } from '../../../lib/documents';
import type { DocumentKind } from '../../../lib/types';
import styles from './perfil.module.css';

export function UploadCard({ kind, onUploaded }: { kind: DocumentKind; onUploaded: () => void }) {
  const info = DOCUMENT_KINDS[kind];
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const uploading = progress !== null;

  useEffect(() => () => controller.current?.abort(), []);

  async function send(file: File) {
    const invalid = validateFile(kind, file);
    setError(invalid);
    if (invalid) return;
    controller.current = new AbortController();
    setProgress(0);
    try {
      await uploadDocument(kind, file, setProgress, controller.current.signal);
      onUploaded();
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
      }
    } finally {
      setProgress(null);
    }
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !uploading) void send(file);
  }

  return (
    <div className={styles.uploadCard}>
      <label
        className={dragging ? `${styles.dropzone} ${styles.dragging}` : styles.dropzone}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <input
          type="file"
          className="visually-hidden"
          accept={info.accept}
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Limpa o campo para que o mesmo arquivo possa ser escolhido de novo.
            event.target.value = '';
            if (file) void send(file);
          }}
        />
        <span className={styles.uploadTitle}>{info.title}</span>
        <span className={styles.uploadFormats}>{info.formats}</span>
        <span className={styles.uploadAction}>
          {uploading ? 'Enviando…' : 'Escolher ou arrastar arquivo'}
        </span>
      </label>

      {uploading ? (
        <div className={styles.progressRow}>
          <div
            className={styles.progress}
            role="progressbar"
            aria-label={`Enviando ${info.title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
          <Button variant="plain" onClick={() => controller.current?.abort()}>
            Cancelar
          </Button>
        </div>
      ) : (
        <p className={styles.uploadHint}>{info.hint}</p>
      )}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
