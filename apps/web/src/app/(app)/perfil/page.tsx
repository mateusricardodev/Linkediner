'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Notice, Skeleton } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { canAnalyze } from '../../../lib/documents';
import { FACT_TYPE_ORDER, FACT_TYPES } from '../../../lib/facts';
import type { DocumentRecord, Me, ProfileFact, ProfileScore } from '../../../lib/types';
import { useResource } from '../../../lib/use-resource';
import { DocumentRow } from './document-row';
import { FactItem } from './fact-item';
import styles from './perfil.module.css';
import { ScoreSection } from './score-section';
import { UploadCard } from './upload-card';

const POLL_INTERVAL_MS = 3000;

export default function ProfilePage() {
  // Busca a autorização aqui para ela estar sempre atual, mesmo depois de mudar nesta tela.
  const me = useResource(() => api<Me>('/v1/me'));
  const documents = useResource(() => api<DocumentRecord[]>('/v1/documents'));
  const facts = useResource(() => api<ProfileFact[]>('/v1/profile/facts'));
  const score = useResource(() => api<ProfileScore>('/v1/profile/score'));
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  const reloadDocuments = documents.reload;
  const reloadFactsOnly = facts.reload;
  const reloadScore = score.reload;
  // O score é calculado a partir dos fatos: os dois mudam juntos.
  const reloadFacts = useCallback(async () => {
    await reloadFactsOnly();
    await reloadScore();
  }, [reloadFactsOnly, reloadScore]);
  // Envio incompleto de outra aba não é um documento da pessoa: ele expira sozinho em 24 horas.
  const visible = documents.data?.filter((d) => d.status !== 'pending_upload') ?? [];
  const processing = visible.filter((d) => d.status === 'processing').length;

  // Enquanto houver análise em andamento, acompanha. Quando uma termina, os fatos mudaram.
  const previousProcessing = useRef(processing);
  useEffect(() => {
    if (processing < previousProcessing.current) void reloadFacts();
    previousProcessing.current = processing;
    if (processing === 0) return;
    const timer = setTimeout(() => void reloadDocuments(), POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [processing, documents.data, reloadDocuments, reloadFacts]);

  const refresh = () => {
    void reloadDocuments();
    void reloadFacts();
  };

  const aiAllowed = Boolean(me.data?.consents.granted.ai_processing);
  const pending = visible.filter(canAnalyze);
  const active = facts.data?.filter((f) => f.verification !== 'rejected') ?? [];
  const rejected = facts.data?.filter((f) => f.verification === 'rejected') ?? [];

  async function allowAi() {
    setGranting(true);
    setGrantError(null);
    try {
      await api('/v1/me/consents/ai_processing', { method: 'PUT', body: { granted: true } });
      await me.reload();
      for (const document of pending) {
        await api(`/v1/documents/${document.id}/extract`, { method: 'POST' });
      }
    } catch (cause) {
      setGrantError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setGranting(false);
      void reloadDocuments();
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Seu perfil</h1>
        <p className={styles.subtitle}>
          Envie seus documentos e revise o que encontramos neles. O LinkedIner só usa o que está
          comprovado nos documentos ou que você confirmou.
        </p>
      </header>

      <ScoreSection score={score.data} error={score.error} />

      <section aria-labelledby="documentos" className={styles.section}>
        <h2 id="documentos" className={styles.sectionTitle}>
          Documentos
        </h2>
        <div className={styles.uploads}>
          <UploadCard kind="resume" onUploaded={refresh} />
          <UploadCard kind="linkedin_pdf" onUploaded={refresh} />
        </div>

        {me.data && !aiAllowed ? (
          <div className={styles.consent}>
            <div className={styles.rowText}>
              <span className={styles.rowTitle}>A análise por IA está desligada</span>
              <span className={styles.rowMeta}>
                Seus arquivos ficam guardados, mas não são analisados. Ao autorizar, o texto dos
                documentos vai para o provedor de IA, sem contato e sem dados sensíveis.
              </span>
            </div>
            {grantError ? <Notice tone="danger">{grantError}</Notice> : null}
            <Button variant="secondary" disabled={granting} onClick={() => void allowAi()}>
              {granting ? 'Autorizando…' : 'Autorizar análise por IA'}
            </Button>
          </div>
        ) : grantError ? (
          <Notice tone="danger">{grantError}</Notice>
        ) : null}

        {documents.error && !documents.data ? (
          <Notice tone="danger">{documents.error.message}</Notice>
        ) : !documents.data ? (
          <Skeleton height={88} />
        ) : visible.length === 0 ? (
          <p className={styles.empty}>Nenhum documento enviado ainda.</p>
        ) : (
          <ul className={styles.list} aria-live="polite">
            {visible.map((document) => (
              <DocumentRow
                key={document.id}
                document={document}
                aiAllowed={aiAllowed}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
        <p className={styles.footnote}>
          Guardamos cada arquivo por até 30 dias. O que você confirmar continua no perfil depois
          disso.
        </p>
      </section>

      <section aria-labelledby="fatos" className={styles.section}>
        <h2 id="fatos" className={styles.sectionTitle}>
          O que encontramos
        </h2>
        {facts.error && !facts.data ? (
          <Notice tone="danger">{facts.error.message}</Notice>
        ) : !facts.data ? (
          <Skeleton height={120} />
        ) : active.length === 0 ? (
          <p className={styles.empty}>
            {processing > 0
              ? 'Estamos analisando seus documentos. Isso pode levar alguns minutos.'
              : visible.some((d) => d.status === 'processed')
                ? 'A análise terminou sem encontrar informações neste documento.'
                : 'As informações aparecem aqui depois da análise dos seus documentos.'}
          </p>
        ) : (
          <div className={styles.factGroups}>
            {FACT_TYPE_ORDER.map((type) => {
              const items = active.filter((f) => f.type === type);
              if (items.length === 0) return null;
              return (
                <div key={type}>
                  <h3 className={styles.groupTitle}>{FACT_TYPES[type].title}</h3>
                  <ul className={styles.list}>
                    {items.map((fact) => (
                      <FactItem key={fact.id} fact={fact} onChanged={() => void reloadFacts()} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        {rejected.length > 0 ? (
          <details className={styles.rejected}>
            <summary>
              {rejected.length === 1 ? '1 item recusado' : `${rejected.length} itens recusados`}
            </summary>
            <ul className={styles.list}>
              {rejected.map((fact) => (
                <FactItem key={fact.id} fact={fact} onChanged={() => void reloadFacts()} />
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}
