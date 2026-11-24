'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Field, Notice, TextAreaField } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import {
  initialState,
  isDirty,
  planIsEmpty,
  planSave,
  validate,
  type FormItem,
  type ProfileFormState,
} from '../../../lib/profile-form';
import type { Profile, ProfileFact } from '../../../lib/types';
import { AccordionList, LanguagesEditor, SkillsEditor } from './item-editors';
import styles from './perfil.module.css';

type FactType = ProfileFact['type'];

/** Os mesmos limites do LinkedIn, para o que veio de lá caber sem cortar. */
const HEADLINE_MAX = 220;
const SUMMARY_MAX = 2600;

function Card({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={styles.formCard}>
      <div className={styles.sectionHead}>
        <h2 id={`${id}-titulo`} className={styles.cardTitle}>
          {title}
        </h2>
        <p className={styles.sectionHint}>{hint}</p>
      </div>
      {children}
    </section>
  );
}

/** Partes do formulário. O assistente de currículo mostra só algumas em cada etapa. */
export type ProfileFormSection =
  | 'header'
  | 'about'
  | 'experience'
  | 'education'
  | 'skills'
  | 'languages'
  | 'certifications'
  | 'projects'
  | 'achievements';

const ALL_SECTIONS: ProfileFormSection[] = [
  'header',
  'about',
  'experience',
  'education',
  'skills',
  'languages',
  'certifications',
  'projects',
  'achievements',
];

const message = (cause: unknown) =>
  cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.';

/**
 * Perfil profissional num formulário só, como no Linkelyzer: o que veio dos documentos já aparece
 * preenchido, a pessoa ajusta o que quiser e salva tudo de uma vez na barra de baixo.
 * Editar um item conta como confirmação dela; remover vira "recusado", para a próxima leitura do
 * documento não trazer o item de volta.
 */
export function ProfileForm({
  name,
  profile,
  facts,
  onSaved,
  sections = ALL_SECTIONS,
  onDirtyChange,
  saveLabel = 'Salvar perfil',
}: {
  name: string | null;
  profile: Profile;
  facts: ProfileFact[];
  onSaved: () => unknown;
  /** Partes mostradas. As outras continuam salvas como estão. */
  sections?: ProfileFormSection[];
  /** Avisa quando há alterações não salvas, para quem usa o formulário poder segurar a saída. */
  onDirtyChange?: (dirty: boolean) => void;
  saveLabel?: string;
}) {
  const [baseline, setBaseline] = useState(() => initialState(name, profile, facts));
  const [state, setState] = useState(baseline);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [incoming, setIncoming] = useState(false);
  const dirty = isDirty(baseline, state);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;

  const apply = (next: ProfileFormState) => {
    baselineRef.current = next;
    dirtyRef.current = false;
    setBaseline(next);
    setState(next);
    setIncoming(false);
  };

  // Dados novos do servidor (ex.: terminou a leitura de um PDF): entram direto se nada foi
  // editado. Com edição em andamento, só avisa, para não apagar o que a pessoa digitou.
  useEffect(() => {
    const next = initialState(name, profile, facts);
    if (!isDirty(baselineRef.current, next)) return;
    if (dirtyRef.current) {
      setIncoming(true);
      return;
    }
    apply(next);
  }, [name, profile, facts]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = (change: (current: ProfileFormState) => ProfileFormState) => {
    setState(change);
    setSavedAt(null);
  };
  const setHeader = (patch: Partial<ProfileFormState['header']>) =>
    edit((s) => ({ ...s, header: { ...s.header, ...patch } }));

  const listProps = (type: FactType) => ({
    items: state.items.filter((item) => item.type === type),
    onChange: (key: string, values: Record<string, string>) =>
      edit((s) => ({
        ...s,
        items: s.items.map((item) => (item.key === key ? { ...item, values } : item)),
      })),
    onConfirm: (key: string) =>
      edit((s) => ({
        ...s,
        items: s.items.map((item) => (item.key === key ? { ...item, confirm: true } : item)),
      })),
    onRemove: (key: string) =>
      edit((s) => {
        const item = s.items.find((i) => i.key === key);
        return {
          ...s,
          items: s.items.filter((i) => i.key !== key),
          removed: item?.id ? [...s.removed, item.id] : s.removed,
        };
      }),
    onAdd: (item: FormItem) => edit((s) => ({ ...s, items: [...s.items, item] })),
  });

  async function save() {
    const invalid = validate(state);
    if (invalid) {
      setError(invalid);
      return;
    }
    const plan = planSave(baseline, state);
    if (planIsEmpty(plan)) return;
    setBusy(true);
    setError(null);
    // Cópia de trabalho: se algo falhar no meio, o que já foi criado guarda o id e não duplica.
    const working: ProfileFormState = {
      ...state,
      items: [...state.items],
      removed: [...state.removed],
    };
    try {
      if (plan.name) {
        await api('/v1/auth/update-user', { method: 'POST', body: { name: plan.name } });
      }
      if (plan.profile) await api('/v1/profile', { method: 'PATCH', body: plan.profile });
      if (plan.links)
        await api('/v1/profile/links', { method: 'PUT', body: { links: plan.links } });
      for (const id of plan.reject) {
        await api(`/v1/profile/facts/${id}`, {
          method: 'PATCH',
          body: { verification: 'rejected' },
        });
        working.removed = working.removed.filter((r) => r !== id);
      }
      for (const change of plan.update) {
        await api(`/v1/profile/facts/${change.id}`, {
          method: 'PATCH',
          body: { verification: 'user_confirmed', data: change.data },
        });
      }
      for (const id of plan.confirm) {
        await api(`/v1/profile/facts/${id}`, {
          method: 'PATCH',
          body: { verification: 'user_confirmed' },
        });
      }
      for (const item of plan.create) {
        const created = await api<ProfileFact>('/v1/profile/facts', {
          method: 'POST',
          body: { type: item.type, data: item.data },
        });
        working.items = working.items.map((i) =>
          i.key === item.key ? { ...i, id: created.id, verification: created.verification } : i,
        );
      }
      // Tudo salvo: o próximo estado vem do servidor, já com os ids e as confirmações.
      const [freshProfile, freshFacts] = await Promise.all([
        api<Profile>('/v1/profile'),
        api<ProfileFact[]>('/v1/profile/facts'),
      ]);
      apply(initialState(state.header.name.trim(), freshProfile, freshFacts));
      setSavedAt(Date.now());
      // A tela recarrega o resto (score, nome no menu). Os mesmos dados não mexem no formulário.
      void onSaved();
    } catch (cause) {
      setState(working);
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    setError(null);
    // Ao descartar, o que chegou do servidor enquanto a pessoa editava já entra.
    apply(incoming ? initialState(name, profile, facts) : baseline);
  }

  const h = state.header;
  const show = (section: ProfileFormSection) => sections.includes(section);
  return (
    <div className={styles.profileForm}>
      {incoming ? (
        <Notice tone="warning">
          Chegaram dados novos do seu documento. Salve ou descarte as suas alterações para vê-los.
        </Notice>
      ) : null}

      {show('header') ? (
        <Card
          id="cabecalho"
          title="Cabeçalho"
          hint="Nome, título, localização e setor: a base do seu perfil."
        >
          <Field
            label="Nome completo *"
            autoComplete="name"
            maxLength={120}
            value={h.name}
            onChange={(event) => setHeader({ name: event.target.value })}
          />
          <Field
            label="Título profissional (headline)"
            hint={`O mesmo que aparece abaixo do seu nome no LinkedIn · ${h.headline.length}/${HEADLINE_MAX}`}
            placeholder="Ex.: Analista de Dados | SQL, Python e Power BI"
            maxLength={HEADLINE_MAX}
            value={h.headline}
            onChange={(event) => setHeader({ headline: event.target.value })}
          />
          <div className={styles.fieldRow}>
            <Field
              label="Localização"
              placeholder="Ex.: São José dos Campos, São Paulo, Brasil"
              maxLength={120}
              value={h.location}
              onChange={(event) => setHeader({ location: event.target.value })}
            />
            <Field
              label="Setor"
              placeholder="Ex.: Tecnologia da informação"
              maxLength={120}
              value={h.industry}
              onChange={(event) => setHeader({ industry: event.target.value })}
            />
          </div>
          <div className={styles.linkFields}>
            <Field
              label="URL do LinkedIn"
              type="url"
              inputMode="url"
              placeholder="https://www.linkedin.com/in/seu-nome"
              value={h.links.linkedin}
              onChange={(event) =>
                setHeader({ links: { ...h.links, linkedin: event.target.value } })
              }
            />
            <Field
              label="GitHub"
              type="url"
              inputMode="url"
              placeholder="https://github.com/seu-usuario"
              value={h.links.github}
              onChange={(event) => setHeader({ links: { ...h.links, github: event.target.value } })}
            />
            <Field
              label="Portfólio"
              type="url"
              inputMode="url"
              placeholder="https://seu-site.com"
              value={h.links.portfolio}
              onChange={(event) =>
                setHeader({ links: { ...h.links, portfolio: event.target.value } })
              }
            />
          </div>
        </Card>
      ) : null}

      {show('about') ? (
        <Card
          id="sobre"
          title="Sobre você"
          hint="Resumo da sua trajetória. Usado para gerar o currículo e nas análises."
        >
          <div className={styles.longField}>
            <TextAreaField
              label="Sobre"
              rows={7}
              placeholder="Conte em poucas linhas o que você faz, com o que trabalha e o que busca."
              maxLength={SUMMARY_MAX}
              value={h.summary}
              onChange={(event) => setHeader({ summary: event.target.value })}
            />
            <p className={styles.counter}>
              {h.summary.length}/{SUMMARY_MAX}
            </p>
          </div>
        </Card>
      ) : null}

      {show('experience') ? (
        <Card
          id="experiencia"
          title="Experiência"
          hint="Suas experiências profissionais, usadas nas análises e no currículo."
        >
          <AccordionList
            type="experience"
            addLabel="Adicionar experiência"
            {...listProps('experience')}
          />
        </Card>
      ) : null}

      {show('education') ? (
        <Card id="formacao" title="Formação" hint="Formação acadêmica e cursos longos.">
          <AccordionList
            type="education"
            addLabel="Adicionar formação"
            {...listProps('education')}
          />
        </Card>
      ) : null}

      {show('skills') ? (
        <Card id="skills" title="Skills" hint="Habilidades técnicas e comportamentais.">
          <SkillsEditor {...listProps('skill')} />
        </Card>
      ) : null}

      {show('languages') ? (
        <Card id="idiomas" title="Idiomas" hint="Idiomas que você fala e o nível de cada um.">
          <LanguagesEditor {...listProps('language')} />
        </Card>
      ) : null}

      {show('certifications') ? (
        <Card id="certificacoes" title="Certificações" hint="Cursos curtos e certificações.">
          <AccordionList
            type="certification"
            addLabel="Adicionar certificação"
            {...listProps('certification')}
          />
        </Card>
      ) : null}

      {show('projects') ? (
        <Card
          id="projetos"
          title="Projetos"
          hint="Projetos que você construiu ou de que participou."
        >
          <AccordionList type="project" addLabel="Adicionar projeto" {...listProps('project')} />
        </Card>
      ) : null}

      {show('achievements') ? (
        <Card
          id="conquistas"
          title="Conquistas"
          hint="Resultados que você alcançou, com números reais quando houver."
        >
          <AccordionList
            type="achievement"
            addLabel="Adicionar conquista"
            {...listProps('achievement')}
          />
        </Card>
      ) : null}

      <div className={styles.saveBar} role="region" aria-label="Salvar o perfil">
        <span className={styles.saveStatus} aria-live="polite">
          {busy
            ? 'Salvando…'
            : error
              ? null
              : dirty
                ? 'Alterações não salvas'
                : savedAt
                  ? 'Perfil salvo'
                  : 'Tudo salvo'}
        </span>
        {error ? (
          <span className={styles.saveError} role="alert">
            {error}
          </span>
        ) : null}
        <div className={styles.saveActions}>
          <Button variant="plain" disabled={busy || (!dirty && !incoming)} onClick={discard}>
            Descartar
          </Button>
          <Button disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? 'Salvando…' : saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
