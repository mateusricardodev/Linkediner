'use client';

import { useState } from 'react';
import { Button, Notice } from '../../../../components/ui';
import { ApiError } from '../../../../lib/api';
import { asAnswers, letterText, usable } from '../../../../lib/applications';
import { safeExternalUrl } from '../../../../lib/jobs';
import { downloadFile } from '../../../../lib/resumes';
import type { Application, ApplicationMaterial } from '../../../../lib/types';
import styles from '../candidaturas.module.css';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="plain"
      aria-label={label}
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
      }
    >
      {copied ? 'Copiado' : 'Copiar'}
    </Button>
  );
}

/** O material aprovado, pronto para a pessoa enviar. O LinkedIner não envia nada sozinho. */
export function ManualPackage({
  application,
  materials,
}: {
  application: Application;
  materials: ApplicationMaterial[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const applyUrl = safeExternalUrl(application.job.applyUrl);
  const letter = materials.find((m) => m.kind === 'cover_letter' && m.content);
  const answers = materials.find((m) => m.kind === 'form_answers' && m.content);
  const letterCopy = letter ? letterText(letter) : '';

  async function download(format: 'pdf' | 'docx') {
    setBusy(format);
    setError(null);
    try {
      await downloadFile(`/v1/applications/${application.id}/resume?format=${format}`, format);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.package}>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className={styles.packageStep}>
        <h3 className={styles.materialTitle}>Currículo aprovado</h3>
        <p className={styles.description}>
          Exatamente como você aprovou, mesmo que o currículo mude depois.
        </p>
        <div className={styles.actions}>
          <Button disabled={busy !== null} onClick={() => void download('pdf')}>
            {busy === 'pdf' ? 'Gerando…' : 'Baixar PDF'}
          </Button>
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void download('docx')}
          >
            {busy === 'docx' ? 'Gerando…' : 'Baixar DOCX'}
          </Button>
        </div>
      </div>

      {letterCopy ? (
        <div className={styles.packageStep}>
          <div className={styles.copyHead}>
            <h3 className={styles.materialTitle}>Carta de apresentação</h3>
            <CopyButton text={letterCopy} label="Copiar a carta" />
          </div>
          <p className={styles.copyText}>{letterCopy}</p>
        </div>
      ) : null}

      {answers ? (
        <div className={styles.packageStep}>
          <h3 className={styles.materialTitle}>Respostas de formulário</h3>
          {asAnswers(answers).answers.map(({ question, answer }, index) => (
            <div key={index} className={styles.packageAnswer}>
              <div className={styles.copyHead}>
                <h4 className={styles.question}>{question}</h4>
                {answer && usable(answer) ? (
                  <CopyButton text={answer.text} label={`Copiar a resposta: ${question}`} />
                ) : null}
              </div>
              {answer && usable(answer) ? (
                <p className={styles.copyText}>{answer.text}</p>
              ) : (
                <p className={styles.unanswered}>Esta fica para você responder.</p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {applyUrl ? (
        <a href={applyUrl} target="_blank" rel="noopener noreferrer" className={styles.external}>
          Abrir a página da vaga
        </a>
      ) : (
        <p className={styles.description}>
          Esta vaga não tem link salvo: use a página onde a encontrou.
        </p>
      )}
    </div>
  );
}
