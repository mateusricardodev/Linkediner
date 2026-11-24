'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Notice, Skeleton, SyntheticDataNotice } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { canAnalyze } from '../../../lib/documents';
import type { DocumentRecord, Me, Profile, ProfileFact, ProfileScore } from '../../../lib/types';
import { useResource } from '../../../lib/use-resource';
import { DocumentRow } from './document-row';
import { FactItem } from './fact-item';
import { GoalsSection } from './goals-section';
import styles from './perfil.module.css';
import { ProfileForm } from './profile-form';
import { ScoreSection } from './score-section';
import { UploadCard } from './upload-card';

const POLL_INTERVAL_MS = 3000;

/**
 * Aba "Perfil profissional", no modelo do Linkelyzer: preencher pelo PDF do LinkedIn, objetivo
 * profissional e o formulário com cabeçalho, sobre, experiência, formação, skills e o resto.
 */
export function ProfessionalTab() {
  // Busca a autorização aqui para ela estar sempre atual, mesmo depois de mudar nesta tela.
  const me = useResource(() => api<Me>('/v1/me'));
  const documents = useResource(() => api<DocumentRecord[]>('/v1/documents'));
  const facts = useResource(() => api<ProfileFact[]>('/v1/profile/facts'));
  const profile = useResource(() => api<Profile>('/v1/profile'));
  const score = useResource(() => api<ProfileScore>('/v1/profile/score'));
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  const reloadDocuments = documents.reload;
  const reloadFactsOnly = facts.reload;
  const reloadProfile = profile.reload;
  const reloadScore = score.reload;
  // A leitura de um documento muda fatos e cabeçalho, e o score é calculado a partir deles.
  const reloadFacts = useCallback(async () => {
    await Promise.all([reloadFactsOnly(), reloadProfile()]);
    await reloadScore();
  }, [reloadFactsOnly, reloadProfile, reloadScore]);
  // Envio incompleto de outra aba não é um documento da pessoa: ele expira sozinho em 24 horas.
  const visible = documents.data?.filter((d) => d.status !== 'pending_upload') ?? [];
  const processing = visible.filter((d) => d.status === 'processing').length;

  // Enquanto houver análise em andamento, acompanha. Quando uma termina, o perfil mudou.
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
  const rejected = facts.data?.filter((f) => f.verification === 'rejected') ?? [];
  const loadError = facts.error ?? profile.error ?? me.error;

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
    <div className={styles.tab}>
      <section id="documentos" aria-labelledby="documentos-titulo" className={styles.fillCard}>
        <div className={styles.sectionHead}>
          <h2 id="documentos-titulo" className={styles.cardTitle}>
            Preencher a partir do LinkedIn
          </h2>
          <p className={styles.sectionHint}>
            Envie o PDF do seu perfil do LinkedIn (ou o seu currículo) e os campos abaixo se
            preenchem sozinhos. Você pode editar tudo depois. Só entra o que está escrito no
            documento.
          </p>
        </div>
        {me.data?.syntheticDataOnly ? <SyntheticDataNotice /> : null}
        <div className={styles.uploads}>
          <UploadCard kind="linkedin_pdf" onUploaded={refresh} />
          <UploadCard kind="resume" onUploaded={refresh} />
        </div>

        {me.data && !aiAllowed ? (
          <div className={styles.consent}>
            <div className={styles.rowText}>
              <span className={styles.rowTitle}>A análise por IA está desligada</span>
              <span className={styles.rowMeta}>
                Seus arquivos ficam guardados, mas não são lidos. Ao autorizar, o texto dos
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

        {processing > 0 ? (
          <Notice>
            Lendo o seu documento. Os campos abaixo se preenchem quando terminar, em alguns minutos.
          </Notice>
        ) : null}

        {documents.error && !documents.data ? (
          <Notice tone="danger">{documents.error.message}</Notice>
        ) : !documents.data ? (
          <Skeleton height={88} />
        ) : visible.length > 0 ? (
          <details className={styles.documents}>
            <summary>
              {visible.length === 1
                ? '1 documento enviado'
                : `${visible.length} documentos enviados`}
            </summary>
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
            <p className={styles.footnote}>
              Guardamos cada arquivo por até 30 dias. O que está no perfil continua depois disso.
            </p>
          </details>
        ) : null}
      </section>

      <GoalsSection onChanged={() => void reloadScore()} />

      {loadError && !(facts.data && profile.data && me.data) ? (
        <Notice tone="danger">{loadError.message}</Notice>
      ) : !(facts.data && profile.data && me.data) ? (
        <Skeleton height={480} />
      ) : (
        <ProfileForm
          name={me.data.user.name}
          profile={profile.data}
          facts={facts.data}
          onSaved={() => Promise.all([reloadFacts(), me.reload()])}
        />
      )}

      {rejected.length > 0 ? (
        <details className={styles.rejected}>
          <summary>
            {rejected.length === 1 ? '1 item removido' : `${rejected.length} itens removidos`}
          </summary>
          <p className={styles.footnote}>
            Itens removidos não voltam quando um documento é lido de novo. Restaure o que quiser de
            volta no perfil.
          </p>
          <ul className={styles.list}>
            {rejected.map((fact) => (
              <FactItem key={fact.id} fact={fact} onChanged={() => void reloadFacts()} />
            ))}
          </ul>
        </details>
      ) : null}

      <ScoreSection score={score.data} error={score.error} />
    </div>
  );
}
