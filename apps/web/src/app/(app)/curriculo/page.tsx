'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Badge,
  Button,
  ButtonLink,
  Notice,
  Skeleton,
  SyntheticDataNotice,
} from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { formatDate } from '../../../lib/documents';
import { RESUME_STATUS, resumeFailureMessage } from '../../../lib/resumes';
import type { Me, Resume } from '../../../lib/types';
import { usePollWhile } from '../../../lib/use-poll';
import { useResource } from '../../../lib/use-resource';
import styles from './curriculo.module.css';

export default function ResumesPage() {
  const router = useRouter();
  const me = useResource(() => api<Me>('/v1/me'));
  const resumes = useResource(() => api<Resume[]>('/v1/resumes'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // A API lista do mais antigo para o mais novo.
  const items = [...(resumes.data ?? [])].reverse();
  const generating = items.some((resume) => resume.status === 'generating');
  usePollWhile(generating, resumes.reload, resumes.data);

  const aiAllowed = Boolean(me.data?.consents.granted.ai_processing);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const resume = await api<Resume>('/v1/resumes', { method: 'POST' });
      router.push(`/curriculo/${resume.id}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError('Algo deu errado.', 0, 'UNKNOWN'));
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Currículo</h1>
        <p className={styles.subtitle}>
          Geramos uma versão melhorada a partir do seu perfil. O que não estiver comprovado fica
          marcado para você decidir, e nada sai no arquivo sem a sua aprovação.
        </p>
      </header>

      {me.data && !aiAllowed ? (
        <div className={styles.callout}>
          <p className={styles.calloutText}>
            Para gerar um currículo, autorize a análise por IA na página do seu perfil.
          </p>
          <ButtonLink variant="secondary" href="/perfil">
            Ir para o perfil
          </ButtonLink>
        </div>
      ) : me.data ? (
        <div className={styles.generate}>
          {me.data.syntheticDataOnly ? <SyntheticDataNotice /> : null}
          <Button disabled={busy || generating} onClick={() => void generate()}>
            {busy ? 'Pedindo…' : generating ? 'Gerando…' : 'Gerar novo currículo'}
          </Button>
          {error ? <Notice tone="danger">{error.message}</Notice> : null}
          {error?.code === 'CONFLICT' ? (
            <ButtonLink variant="secondary" href="/perfil">
              Ir para o perfil
            </ButtonLink>
          ) : null}
        </div>
      ) : null}

      {resumes.error && !resumes.data ? (
        <Notice tone="danger">{resumes.error.message}</Notice>
      ) : !resumes.data ? (
        <Skeleton height={88} />
      ) : items.length === 0 ? (
        <p className={styles.empty}>Nenhum currículo gerado ainda.</p>
      ) : (
        <ul className={styles.list} aria-live="polite">
          {items.map((resume) => {
            const status = RESUME_STATUS[resume.status];
            return (
              <li key={resume.id}>
                <Link href={`/curriculo/${resume.id}`} className={styles.resumeLink}>
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>
                      Currículo de {formatDate(resume.createdAt)}
                    </span>
                    {resume.status === 'failed' ? (
                      <span className={styles.rowMeta}>
                        {resumeFailureMessage(resume.failureCode)}
                      </span>
                    ) : null}
                  </span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
