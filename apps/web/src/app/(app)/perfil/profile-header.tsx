'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, Field, Notice, Skeleton, TextAreaField } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import type { Profile } from '../../../lib/types';
import { useResource } from '../../../lib/use-resource';
import styles from './perfil.module.css';

type LinkKind = Profile['links'][number]['kind'];

/** Os mesmos limites do domínio: o contador avisa antes de a API recusar. */
const HEADLINE_MAX = 160;
const SUMMARY_MAX = 2000;

const LINK_FIELDS: { kind: Exclude<LinkKind, 'other'>; label: string; placeholder: string }[] = [
  { kind: 'linkedin', label: 'LinkedIn', placeholder: 'https://www.linkedin.com/in/seu-nome' },
  { kind: 'github', label: 'GitHub', placeholder: 'https://github.com/seu-usuario' },
  { kind: 'portfolio', label: 'Portfólio', placeholder: 'https://seu-site.com' },
];

interface Draft {
  headline: string;
  summary: string;
  links: Record<Exclude<LinkKind, 'other'>, string>;
}

const toDraft = (profile: Profile): Draft => {
  const url = (kind: LinkKind) => profile.links.find((l) => l.kind === kind)?.url ?? '';
  return {
    headline: profile.headline ?? '',
    summary: profile.summary ?? '',
    links: { linkedin: url('linkedin'), github: url('github'), portfolio: url('portfolio') },
  };
};

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Título, resumo e links: o que aparece no topo do currículo e conta no score. Diferente dos fatos,
 * é texto da própria pessoa, por isso é editado direto.
 */
export function ProfileHeader({ onChanged }: { onChanged: () => void }) {
  const profile = useResource(() => api<Profile>('/v1/profile'));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (profile.data && !saved) {
      const initial = toDraft(profile.data);
      setDraft(initial);
      setSaved(initial);
    }
  }, [profile.data, saved]);

  const dirty = Boolean(draft && saved && !sameDraft(draft, saved));

  function edit(patch: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setDone(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || !profile.data) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const updated = await api<Profile>('/v1/profile', {
        method: 'PATCH',
        body: { headline: draft.headline.trim() || null, summary: draft.summary.trim() || null },
      });
      // Links de outros tipos não aparecem aqui, mas continuam salvos.
      const others = profile.data.links.filter((l) => l.kind === 'other');
      const typed = LINK_FIELDS.map((f) => ({ kind: f.kind, url: draft.links[f.kind].trim() }))
        .filter((l) => l.url)
        .map((l) => ({ kind: l.kind as LinkKind, url: l.url }));
      const withLinks = await api<Profile>('/v1/profile/links', {
        method: 'PUT',
        body: { links: [...typed, ...others] },
      });
      const next = toDraft({ ...updated, links: withLinks.links });
      setDraft(next);
      setSaved(next);
      setDone(true);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="cabecalho" aria-labelledby="cabecalho-titulo" className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 id="cabecalho-titulo" className={styles.sectionTitle}>
          Cabeçalho
        </h2>
        <p className={styles.sectionHint}>
          Título, resumo e links: a base do seu perfil e o topo do seu currículo.
        </p>
      </div>
      {profile.error && !profile.data ? (
        <Notice tone="danger">{profile.error.message}</Notice>
      ) : !draft ? (
        <Skeleton height={240} />
      ) : (
        <form className={styles.headerForm} onSubmit={(event) => void submit(event)}>
          <Field
            label="Título profissional"
            hint={`O mesmo que aparece abaixo do seu nome no LinkedIn. ${draft.headline.length}/${HEADLINE_MAX}`}
            placeholder="Ex.: Analista de Dados | SQL, Python e Power BI"
            maxLength={HEADLINE_MAX}
            value={draft.headline}
            onChange={(event) => edit({ headline: event.target.value })}
          />
          <TextAreaField
            label="Sobre você"
            rows={6}
            placeholder="Resumo da sua trajetória, no formato livre."
            maxLength={SUMMARY_MAX}
            value={draft.summary}
            onChange={(event) => edit({ summary: event.target.value })}
          />
          <p className={styles.counter}>
            {draft.summary.length}/{SUMMARY_MAX}
          </p>
          <div className={styles.linkFields}>
            {LINK_FIELDS.map((field) => (
              <Field
                key={field.kind}
                label={field.label}
                type="url"
                inputMode="url"
                placeholder={field.placeholder}
                value={draft.links[field.kind]}
                onChange={(event) =>
                  edit({ links: { ...draft.links, [field.kind]: event.target.value } })
                }
              />
            ))}
          </div>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {done ? <Notice>Cabeçalho salvo.</Notice> : null}
          <div className={styles.headerActions}>
            <Button type="submit" disabled={busy || !dirty}>
              {busy ? 'Salvando…' : 'Salvar cabeçalho'}
            </Button>
            {dirty ? (
              <Button variant="plain" disabled={busy} onClick={() => saved && setDraft(saved)}>
                Descartar
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </section>
  );
}
