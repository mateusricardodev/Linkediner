'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, ButtonLink, Notice, Skeleton, TextAreaField } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { JOB_STATUS, jobFailureMessage } from '../../../lib/jobs';
import {
  blockReason,
  chosenJobId,
  generateBlock,
  pendingFacts,
  provenFacts,
  stepIndex,
  WIZARD_STEPS,
  type JobChoice,
  type WizardStep,
} from '../../../lib/resume-wizard';
import { jobLabel, RESUME_LANGUAGE_LABELS } from '../../../lib/resumes';
import type { Job, Profile, ProfileFact, Resume } from '../../../lib/types';
import { usePollWhile } from '../../../lib/use-poll';
import { ProfileForm, type ProfileFormSection } from '../perfil/profile-form';
import styles from './wizard.module.css';

type Language = Resume['language'];

const FORM_STEPS: Partial<Record<WizardStep, ProfileFormSection[]>> = {
  dados: ['header', 'about'],
  mais: ['experience', 'education', 'skills', 'languages', 'certifications'],
  extra: ['projects', 'achievements'],
};

const STEP_INTRO: Record<WizardStep, { title: string; text: string }> = {
  vaga: {
    title: 'Para qual vaga é o currículo?',
    text: 'A vaga decide o que destacar primeiro. Nada que não está no seu perfil entra por causa dela.',
  },
  idioma: {
    title: 'Em que idioma?',
    text: 'O currículo é escrito no idioma escolhido, com os mesmos fatos do seu perfil.',
  },
  dados: {
    title: 'Seus dados',
    text: 'Confira o cabeçalho e o resumo. O que você salvar aqui também atualiza o seu perfil.',
  },
  mais: {
    title: 'Mais dados',
    text: 'Experiências, formação, competências, idiomas e certificações. Itens sugeridos só entram depois que você confirmar.',
  },
  extra: {
    title: 'Material extra',
    text: 'Projetos e conquistas que ainda não estão no perfil. Só entra no currículo o que você salvar aqui, e use só números que você pode comprovar.',
  },
  gerar: {
    title: 'Tudo pronto para gerar',
    text: 'Confira o resumo. Depois de gerar, você revisa cada frase antes de baixar.',
  },
};

function Stepper({
  current,
  reached,
  onGo,
}: {
  current: WizardStep;
  reached: number;
  onGo: (step: WizardStep) => void;
}) {
  const index = stepIndex(current);
  return (
    <ol className={styles.stepper} aria-label="Etapas">
      {WIZARD_STEPS.map((step, i) => {
        const state = i === index ? 'current' : i < index ? 'done' : 'todo';
        return (
          <li key={step.key} data-state={state}>
            <button
              type="button"
              className={styles.stepButton}
              disabled={i > reached}
              aria-current={i === index ? 'step' : undefined}
              onClick={() => onGo(step.key)}
            >
              <span className={styles.stepNumber}>{state === 'done' ? '✓' : i + 1}</span>
              <span className={styles.stepLabel}>{step.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function JobStep({
  choice,
  onChoice,
  jobs,
  onJobsChanged,
}: {
  choice: JobChoice;
  onChoice: (choice: JobChoice) => void;
  jobs: Job[];
  onJobsChanged: () => unknown;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = jobs.filter((job) => job.status === 'ready');
  const pasted =
    choice.mode === 'pasted' ? (jobs.find((job) => job.id === choice.jobId) ?? null) : null;
  usePollWhile(pasted?.status === 'structuring', onJobsChanged, jobs);

  async function read() {
    setBusy(true);
    setError(null);
    try {
      const job = await api<Job>('/v1/jobs/import', { method: 'POST', body: { text } });
      await onJobsChanged();
      onChoice({ mode: 'pasted', jobId: job.id });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  const options: { mode: JobChoice['mode']; title: string; text: string }[] = [
    {
      mode: 'pasted',
      title: 'Colar a descrição da vaga',
      text: 'Copie o texto do anúncio e cole aqui. A vaga fica salva em Vagas.',
    },
    {
      mode: 'saved',
      title: 'Escolher uma vaga salva',
      text:
        ready.length === 0
          ? 'Você ainda não tem vagas salvas.'
          : `${ready.length} ${ready.length === 1 ? 'vaga salva' : 'vagas salvas'}.`,
    },
    {
      mode: 'general',
      title: 'Currículo geral',
      text: 'Para qualquer vaga, destacando o seu objetivo profissional.',
    },
  ];

  return (
    <div className={styles.stack}>
      <div className={styles.options} role="radiogroup" aria-label="Como escolher a vaga">
        {options.map((option) => (
          <label
            key={option.mode}
            className={styles.option}
            data-checked={choice.mode === option.mode}
            data-disabled={option.mode === 'saved' && ready.length === 0}
          >
            <input
              type="radio"
              name="vaga"
              checked={choice.mode === option.mode}
              disabled={option.mode === 'saved' && ready.length === 0}
              onChange={() =>
                onChoice(
                  option.mode === 'general'
                    ? { mode: 'general' }
                    : { mode: option.mode, jobId: null },
                )
              }
            />
            <span className={styles.optionTitle}>{option.title}</span>
            <span className={styles.optionText}>{option.text}</span>
          </label>
        ))}
      </div>

      {choice.mode === 'pasted' ? (
        pasted ? (
          <div className={styles.jobCard}>
            <div className={styles.jobHead}>
              <strong>
                {pasted.status === 'ready' ? jobLabel(pasted) : 'Lendo a descrição da vaga…'}
              </strong>
              <Badge tone={JOB_STATUS[pasted.status].tone}>{JOB_STATUS[pasted.status].label}</Badge>
            </div>
            {pasted.status === 'ready' && pasted.mustHave.length > 0 ? (
              <p className={styles.muted}>Requisitos: {pasted.mustHave.slice(0, 6).join(', ')}</p>
            ) : null}
            {pasted.status === 'failed' ? (
              <p className={styles.muted}>{jobFailureMessage(pasted.failureCode)}</p>
            ) : null}
            <Button variant="plain" onClick={() => onChoice({ mode: 'pasted', jobId: null })}>
              Colar outra vaga
            </Button>
          </div>
        ) : (
          <div className={styles.stack}>
            <TextAreaField
              label="Descrição da vaga"
              rows={9}
              maxLength={40_000}
              placeholder="Cole aqui o texto do anúncio: cargo, empresa, requisitos e atividades."
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <p className={styles.muted}>
              Cole o texto, não o link: o LinkedIner não abre páginas de vagas.
            </p>
            <div>
              <Button
                variant="secondary"
                disabled={busy || text.trim().length < 80}
                onClick={() => void read()}
              >
                {busy ? 'Lendo…' : 'Ler vaga'}
              </Button>
            </div>
            {error ? <Notice tone="danger">{error}</Notice> : null}
          </div>
        )
      ) : null}

      {choice.mode === 'saved' ? (
        <ul className={styles.jobList}>
          {ready.map((job) => (
            <li key={job.id}>
              <label className={styles.jobOption} data-checked={choice.jobId === job.id}>
                <input
                  type="radio"
                  name="vaga-salva"
                  checked={choice.jobId === job.id}
                  onChange={() => onChoice({ mode: 'saved', jobId: job.id })}
                />
                <span>
                  <span className={styles.optionTitle}>{jobLabel(job)}</span>
                  {job.location ? <span className={styles.optionText}>{job.location}</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function LanguageStep({
  language,
  onChange,
}: {
  language: Language;
  onChange: (language: Language) => void;
}) {
  const hints: Record<Language, string> = {
    pt: 'Para vagas no Brasil.',
    en: 'Para vagas no exterior ou em empresas que pedem currículo em inglês. Formação, cursos e o título do perfil continuam como estão nos seus documentos.',
  };
  return (
    <div className={styles.options} role="radiogroup" aria-label="Idioma do currículo">
      {(Object.keys(RESUME_LANGUAGE_LABELS) as Language[]).map((value) => (
        <label key={value} className={styles.option} data-checked={language === value}>
          <input
            type="radio"
            name="idioma"
            checked={language === value}
            onChange={() => onChange(value)}
          />
          <span className={styles.optionTitle}>{RESUME_LANGUAGE_LABELS[value]}</span>
          <span className={styles.optionText}>{hints[value]}</span>
        </label>
      ))}
    </div>
  );
}

function Review({
  name,
  facts,
  job,
  language,
}: {
  name: string | null;
  facts: ProfileFact[];
  job: Job | null;
  language: Language;
}) {
  const proven = provenFacts(facts);
  const count = (type: ProfileFact['type']) => proven.filter((f) => f.type === type).length;
  const pending = pendingFacts(facts).length;
  const rows: [string, string][] = [
    ['Vaga', job ? jobLabel(job) : 'Currículo geral'],
    ['Idioma', RESUME_LANGUAGE_LABELS[language]],
    ['Nome', name ?? 'Sem nome'],
    ['Experiências', String(count('experience'))],
    ['Formação e certificações', String(count('education') + count('certification'))],
    ['Competências', String(count('skill'))],
    ['Projetos e conquistas', String(count('project') + count('achievement'))],
  ];
  return (
    <div className={styles.stack}>
      <dl className={styles.review}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {pending > 0 ? (
        <Notice tone="warning">
          {pending === 1
            ? '1 item sugerido ainda não foi confirmado e fica de fora.'
            : `${pending} itens sugeridos ainda não foram confirmados e ficam de fora.`}{' '}
          Confirme em &quot;Mais dados&quot; ou &quot;Material extra&quot; se quiser incluir.
        </Notice>
      ) : null}
    </div>
  );
}

/**
 * Gerar currículo em etapas, no modelo do Linkelyzer: vaga, idioma, seus dados, mais dados,
 * material extra e gerar. As etapas de dados editam o próprio perfil, então nada se perde e
 * o próximo currículo já começa com o que a pessoa ajustou.
 */
export function ResumeWizard({
  name,
  profile,
  facts,
  jobs,
  generating,
  onDataChanged,
  onJobsChanged,
}: {
  name: string | null;
  profile: Profile | null;
  facts: ProfileFact[] | null;
  jobs: Job[];
  generating: boolean;
  onDataChanged: () => unknown;
  onJobsChanged: () => unknown;
}) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>('vaga');
  const [reached, setReached] = useState(0);
  const [job, setJob] = useState<JobChoice>({ mode: 'general' });
  const [language, setLanguage] = useState<Language>('pt');
  const [dirty, setDirty] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const index = stepIndex(step);
  const context = { job, jobs, dirty, facts: facts ?? [] };
  const jobId = chosenJobId(job);
  const chosen = jobs.find((j) => j.id === jobId) ?? null;
  const formSections = FORM_STEPS[step];

  function go(next: WizardStep) {
    const nextIndex = stepIndex(next);
    if (nextIndex > index) {
      const reason = blockReason(step, context);
      if (reason) {
        setBlocked(reason);
        return;
      }
    } else if (dirty) {
      setBlocked('Salve ou descarte as suas alterações antes de sair desta etapa.');
      return;
    }
    setBlocked(null);
    setDirty(false);
    setStep(next);
    setReached((r) => Math.max(r, nextIndex));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const resume = await api<Resume>('/v1/resumes', {
        method: 'POST',
        body: { language, jobId },
      });
      router.push(`/curriculo/${resume.id}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError('Algo deu errado.', 0, 'UNKNOWN'));
      setBusy(false);
    }
  }

  const cannotGenerate = generateBlock(context);
  const intro = STEP_INTRO[step];

  return (
    <section className={styles.wizard} aria-labelledby="etapa-titulo">
      <Stepper current={step} reached={reached} onGo={go} />

      <div className={styles.panel}>
        <header className={styles.panelHead}>
          <p className={styles.eyebrow}>
            Etapa {index + 1} de {WIZARD_STEPS.length}
          </p>
          <h2 id="etapa-titulo" className={styles.panelTitle}>
            {intro.title}
          </h2>
          <p className={styles.muted}>{intro.text}</p>
        </header>

        {step === 'vaga' ? (
          <JobStep
            choice={job}
            onChoice={(next) => {
              setJob(next);
              setBlocked(null);
            }}
            jobs={jobs}
            onJobsChanged={onJobsChanged}
          />
        ) : null}
        {step === 'idioma' ? <LanguageStep language={language} onChange={setLanguage} /> : null}
        {formSections ? (
          !profile || !facts ? (
            <Skeleton height={320} />
          ) : (
            <ProfileForm
              key={step}
              name={name}
              profile={profile}
              facts={facts}
              sections={formSections}
              onDirtyChange={setDirty}
              onSaved={onDataChanged}
              saveLabel="Salvar"
            />
          )
        ) : null}
        {step === 'gerar' ? (
          facts ? (
            <Review name={name} facts={facts} job={chosen} language={language} />
          ) : (
            <Skeleton height={200} />
          )
        ) : null}

        {blocked ? <Notice tone="warning">{blocked}</Notice> : null}
        {error ? <Notice tone="danger">{error.message}</Notice> : null}
        {error?.code === 'CONFLICT' ? (
          <ButtonLink variant="secondary" href="/perfil?tab=profissional">
            Ir para o perfil
          </ButtonLink>
        ) : null}

        <div className={styles.nav}>
          {index > 0 ? (
            <Button variant="plain" onClick={() => go(WIZARD_STEPS[index - 1]!.key)}>
              ‹ Voltar
            </Button>
          ) : (
            <span />
          )}
          {step === 'gerar' ? (
            <Button
              disabled={busy || generating || Boolean(cannotGenerate)}
              onClick={() => void generate()}
            >
              {busy ? 'Pedindo…' : generating ? 'Gerando outro…' : 'Gerar currículo'}
            </Button>
          ) : (
            <Button onClick={() => go(WIZARD_STEPS[index + 1]!.key)}>Continuar ›</Button>
          )}
        </div>
        {step === 'gerar' && cannotGenerate ? (
          <p className={styles.muted}>{cannotGenerate}</p>
        ) : null}
      </div>
    </section>
  );
}
