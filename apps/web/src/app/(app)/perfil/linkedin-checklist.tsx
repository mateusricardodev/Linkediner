'use client';

import { useState } from 'react';
import { Notice, Skeleton } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { CHECKLIST, headlineExample, type ChecklistItem } from '../../../lib/linkedin-checklist';
import type { ProfileFact } from '../../../lib/types';
import { useResource } from '../../../lib/use-resource';
import styles from './perfil.module.css';

interface ProfileChecklist {
  linkedinChecklist: ChecklistItem[];
}

/** Ajustes do LinkedIn, marcados pela própria pessoa. O LinkedIner não acessa a conta dela. */
export function LinkedinChecklist() {
  const profile = useResource(() => api<ProfileChecklist>('/v1/profile'));
  const facts = useResource(() => api<ProfileFact[]>('/v1/profile/facts'));
  const [done, setDone] = useState<ChecklistItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = done ?? profile.data?.linkedinChecklist ?? [];
  const example = facts.data ? headlineExample(facts.data) : null;

  async function toggle(item: ChecklistItem, checked: boolean) {
    const previous = current;
    const next = checked ? [...current, item] : current.filter((i) => i !== item);
    setDone(next);
    setError(null);
    try {
      const saved = await api<ProfileChecklist>('/v1/profile', {
        method: 'PATCH',
        body: { linkedinChecklist: next },
      });
      setDone(saved.linkedinChecklist);
    } catch (cause) {
      setDone(previous);
      setError(
        cause instanceof ApiError ? cause.message : 'Não foi possível salvar. Tente de novo.',
      );
    }
  }

  return (
    <section id="linkedin" aria-labelledby="linkedin-titulo" className={styles.section}>
      <div className={styles.checklistHead}>
        <h2 id="linkedin-titulo" className={styles.sectionTitle}>
          Ajustes no LinkedIn
        </h2>
        {profile.data ? (
          <span className={styles.checklistCount}>
            {current.length} de {CHECKLIST.length}
          </span>
        ) : null}
      </div>
      <p className={styles.footnote}>
        Pequenas mudanças que ajudam recrutadores a encontrar você. Faça no LinkedIn e marque aqui:
        não acessamos a sua conta.
      </p>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {profile.error && !profile.data ? (
        <Notice tone="danger">{profile.error.message}</Notice>
      ) : !profile.data ? (
        <Skeleton height={200} />
      ) : (
        <ul className={styles.checklist}>
          {CHECKLIST.map((item) => {
            const checked = current.includes(item.id);
            return (
              <li key={item.id}>
                <label className={styles.checklistItem}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => void toggle(item.id, event.target.checked)}
                  />
                  <span>
                    <span className={checked ? styles.checklistDone : styles.checklistTitle}>
                      {item.title}
                    </span>
                    <span className={styles.checklistHow}>
                      {item.how}
                      {item.id === 'headline' && example ? (
                        <>
                          {' '}
                          Pelo seu perfil, por exemplo: <strong>{example}</strong>.
                        </>
                      ) : null}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
