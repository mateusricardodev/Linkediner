'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ButtonLink, Notice, SelectField } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { jobLabel, RESUME_LANGUAGE_LABELS } from '../../../lib/resumes';
import type { Job, ProfileFact, Resume } from '../../../lib/types';
import styles from './curriculo.module.css';

type Language = Resume['language'];

/**
 * Pedido de um currículo: idioma e, se quiser, uma vaga salva para orientar o que destacar.
 * Ao lado, um resumo do que vai entrar, para a pessoa saber antes de gastar o limite do mês.
 */
export function GenerateForm({
  name,
  facts,
  jobs,
  generating,
}: {
  name: string | null;
  facts: ProfileFact[];
  jobs: Job[];
  generating: boolean;
}) {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>('pt');
  const [jobId, setJobId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const proven = facts.filter(
    (f) => f.verification === 'extracted' || f.verification === 'user_confirmed',
  );
  const experiences = proven.filter((f) => f.type === 'experience').length;
  const skills = proven.filter((f) => f.type === 'skill').length;
  const ready = jobs.filter((job) => job.status === 'ready');
  const chosen = ready.find((job) => job.id === jobId) ?? null;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const resume = await api<Resume>('/v1/resumes', {
        method: 'POST',
        body: { language, jobId: jobId || null },
      });
      router.push(`/curriculo/${resume.id}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError('Algo deu errado.', 0, 'UNKNOWN'));
      setBusy(false);
    }
  }

  return (
    <div className={styles.generateGrid}>
      <section className={styles.generateCard} aria-labelledby="gerar">
        <h2 id="gerar" className={styles.generateTitle}>
          Gerar um currículo
        </h2>

        <fieldset className={styles.choice}>
          <legend className={styles.choiceLabel}>Idioma</legend>
          <div className={styles.segmented}>
            {(Object.keys(RESUME_LANGUAGE_LABELS) as Language[]).map((value) => (
              <label key={value} className={styles.segment}>
                <input
                  type="radio"
                  name="idioma"
                  value={value}
                  checked={language === value}
                  onChange={() => setLanguage(value)}
                />
                <span>{RESUME_LANGUAGE_LABELS[value]}</span>
              </label>
            ))}
          </div>
          {language === 'en' ? (
            <p className={styles.footnote}>
              A redação sai em inglês. Formação, cursos e o título do perfil continuam como estão
              nos seus documentos.
            </p>
          ) : null}
        </fieldset>

        <SelectField label="Vaga" value={jobId} onChange={(event) => setJobId(event.target.value)}>
          <option value="">Currículo geral, para qualquer vaga</option>
          {ready.map((job) => (
            <option key={job.id} value={job.id}>
              {jobLabel(job)}
            </option>
          ))}
        </SelectField>
        <p className={styles.footnote}>
          {ready.length === 0
            ? 'Salve uma vaga em Vagas para gerar um currículo pensado para ela.'
            : 'A vaga só decide o que destacar primeiro. Nada que não está no seu perfil entra por causa dela.'}
        </p>

        {error ? <Notice tone="danger">{error.message}</Notice> : null}
        {error?.code === 'CONFLICT' ? (
          <ButtonLink variant="secondary" href="/perfil">
            Ir para o perfil
          </ButtonLink>
        ) : null}
        <Button disabled={busy || generating} onClick={() => void generate()}>
          {busy ? 'Pedindo…' : generating ? 'Gerando…' : 'Gerar currículo'}
        </Button>
      </section>

      <aside className={styles.preview} aria-labelledby="previa">
        <h2 id="previa" className={styles.previewTitle}>
          Seu currículo até agora
        </h2>
        <dl className={styles.previewList}>
          <dt>Dados</dt>
          <dd>
            {[
              name,
              `${experiences} ${experiences === 1 ? 'experiência' : 'experiências'}`,
              `${skills} ${skills === 1 ? 'competência' : 'competências'}`,
            ]
              .filter(Boolean)
              .join(', ')}
          </dd>
          <dt>Idioma</dt>
          <dd>{RESUME_LANGUAGE_LABELS[language]}</dd>
          <dt>Vaga</dt>
          <dd>{chosen ? jobLabel(chosen) : 'Geral'}</dd>
        </dl>
        {experiences === 0 ? (
          <p className={styles.footnote}>
            Envie seu currículo no Perfil: sem experiências comprovadas, não há o que reescrever.
          </p>
        ) : null}
      </aside>
    </div>
  );
}
