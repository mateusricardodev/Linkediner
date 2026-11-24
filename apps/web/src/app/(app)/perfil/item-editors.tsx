'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { Badge, Button, Field, TextAreaField } from '../../../components/ui';
import { CURRENT_END, emptyItem, isCurrentEnd, type FormItem } from '../../../lib/profile-form';
import type { ProfileFact } from '../../../lib/types';
import styles from './perfil.module.css';

type FactType = ProfileFact['type'];

interface FieldSpec {
  key: string;
  label: string;
  required?: boolean;
  long?: boolean;
  placeholder?: string;
  max?: number;
}

/** Linhas do formulário de cada tipo: um campo ocupa a linha toda, dois dividem. */
const LAYOUTS: Partial<Record<FactType, FieldSpec[][]>> = {
  experience: [
    [{ key: 'title', label: 'Cargo', required: true }],
    [
      { key: 'company', label: 'Empresa', required: true },
      { key: 'location', label: 'Localização', placeholder: 'Ex.: São Paulo, SP · Remoto' },
    ],
    [
      { key: 'startDate', label: 'Início', placeholder: 'Ex.: mar 2024' },
      { key: 'endDate', label: 'Fim', placeholder: 'Ex.: dez 2025' },
    ],
    [{ key: 'description', label: 'Descrição', long: true, max: 5000 }],
  ],
  education: [
    [{ key: 'institution', label: 'Instituição', required: true }],
    [
      { key: 'degree', label: 'Grau/Curso', placeholder: 'Ex.: Bacharelado' },
      { key: 'field', label: 'Área de estudo', placeholder: 'Ex.: Ciência da Computação' },
    ],
    [
      { key: 'startDate', label: 'Início', placeholder: 'Ex.: 2020' },
      { key: 'endDate', label: 'Conclusão', placeholder: 'Ex.: 2024' },
    ],
  ],
  certification: [
    [{ key: 'name', label: 'Nome da certificação', required: true }],
    [
      { key: 'issuer', label: 'Emissor', placeholder: 'Ex.: Alura' },
      { key: 'issuedAt', label: 'Data', placeholder: 'Ex.: 2026' },
    ],
  ],
  project: [
    [{ key: 'name', label: 'Nome do projeto', required: true }],
    [{ key: 'url', label: 'Link (opcional)', placeholder: 'https://' }],
    [{ key: 'description', label: 'Descrição', long: true, max: 5000 }],
  ],
  achievement: [
    [{ key: 'description', label: 'Conquista', required: true, long: true, max: 5000 }],
  ],
};

const join = (parts: (string | undefined)[], separator: string) =>
  parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(separator);

/** Título da linha fechada: o que a pessoa reconhece de relance. */
function itemTitle(item: FormItem): { title: string; meta: string } {
  const v = item.values;
  switch (item.type) {
    case 'experience':
      return {
        title: join([v.title, v.company], ' @ ') || 'Nova experiência',
        meta: join([v.startDate, v.endDate], ' – '),
      };
    case 'education':
      return {
        title: join([v.degree, v.institution], ' · ') || 'Nova formação',
        meta: join([v.startDate, v.endDate], ' – '),
      };
    case 'certification':
      return {
        title: join([v.name, v.issuer], ' · ') || 'Nova certificação',
        meta: v.issuedAt ?? '',
      };
    case 'project':
      return { title: v.name?.trim() || 'Novo projeto', meta: '' };
    default: {
      const text = v.description?.trim() ?? '';
      return {
        title: text.length > 90 ? `${text.slice(0, 90)}…` : text || 'Nova conquista',
        meta: '',
      };
    }
  }
}

interface ListProps {
  items: FormItem[];
  onChange: (key: string, values: Record<string, string>) => void;
  onConfirm: (key: string) => void;
  onRemove: (key: string) => void;
  onAdd: (item: FormItem) => void;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function SuggestionNote({ item, onConfirm }: { item: FormItem; onConfirm: () => void }) {
  if (item.verification !== 'suggested') return null;
  return (
    <div className={styles.suggestionNote}>
      <span>
        {item.confirm
          ? 'Vai ser confirmado quando você salvar.'
          : 'Sugestão a partir das suas correções. Só entra no perfil se você confirmar.'}
      </span>
      {item.confirm ? null : (
        <Button variant="plain" onClick={onConfirm}>
          Confirmar
        </Button>
      )}
    </div>
  );
}

/**
 * Lista em acordeão: com mais de um item, todos começam fechados e a página fica curta.
 * Item novo já abre, para a pessoa digitar.
 */
export function AccordionList({
  type,
  addLabel,
  ...props
}: ListProps & { type: FactType; addLabel: string }) {
  const [open, setOpen] = useState<Set<string>>(() =>
    props.items.length === 1 ? new Set([props.items[0]!.key]) : new Set(),
  );
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const layout = LAYOUTS[type] ?? [];

  return (
    <div className={styles.itemList}>
      {props.items.map((item) => {
        const isOpen = open.has(item.key);
        const { title, meta } = itemTitle(item);
        const panelId = `painel-${item.key}`;
        const current = type === 'experience' && isCurrentEnd(item.values.endDate ?? '');
        return (
          <div key={item.key} className={styles.item}>
            <button
              type="button"
              className={styles.itemHead}
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(item.key)}
            >
              <span className={styles.itemTitle}>
                <span>{title}</span>
                {meta ? <span className={styles.itemMeta}>{meta}</span> : null}
              </span>
              {item.verification === 'suggested' && !item.confirm ? (
                <Badge tone="warning">Sugestão</Badge>
              ) : null}
              <Chevron open={isOpen} />
            </button>
            {isOpen ? (
              <div id={panelId} className={styles.itemBody}>
                <SuggestionNote item={item} onConfirm={() => props.onConfirm(item.key)} />
                {layout.map((row) => (
                  <div
                    key={row.map((f) => f.key).join('-')}
                    className={row.length > 1 ? styles.fieldRow : undefined}
                  >
                    {row.map((field) => {
                      const value = item.values[field.key] ?? '';
                      const set = (next: string) =>
                        props.onChange(item.key, { ...item.values, [field.key]: next });
                      const label = field.required ? `${field.label} *` : field.label;
                      if (field.long) {
                        return (
                          <div key={field.key} className={styles.longField}>
                            <TextAreaField
                              label={label}
                              rows={5}
                              maxLength={field.max}
                              value={value}
                              onChange={(event) => set(event.target.value)}
                            />
                            {field.max ? (
                              <p className={styles.counter}>
                                {value.length}/{field.max}
                              </p>
                            ) : null}
                          </div>
                        );
                      }
                      const disabled = field.key === 'endDate' && current;
                      return (
                        <Field
                          key={field.key}
                          label={label}
                          placeholder={field.placeholder}
                          maxLength={300}
                          value={disabled ? 'Atual' : value}
                          disabled={disabled}
                          onChange={(event) => set(event.target.value)}
                        />
                      );
                    })}
                  </div>
                ))}
                {type === 'experience' ? (
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={current}
                      onChange={(event) =>
                        props.onChange(item.key, {
                          ...item.values,
                          endDate: event.target.checked ? CURRENT_END : '',
                        })
                      }
                    />
                    Trabalho atual
                  </label>
                ) : null}
                <div className={styles.itemFoot}>
                  <Button
                    variant="plain"
                    className={styles.removeButton}
                    onClick={() => props.onRemove(item.key)}
                  >
                    Remover
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      <div>
        <Button
          variant="plain"
          onClick={() => {
            const item = emptyItem(type);
            setOpen((current) => new Set(current).add(item.key));
            props.onAdd(item);
          }}
        >
          + {addLabel}
        </Button>
      </div>
    </div>
  );
}

/** Skills em etiquetas: Enter ou vírgula adiciona, o × tira. */
export function SkillsEditor(props: ListProps) {
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const names = new Set(props.items.map((i) => (i.values.name ?? '').trim().toLowerCase()));

  function add(raw: string) {
    for (const part of raw.split(',')) {
      const name = part.trim();
      if (!name || names.has(name.toLowerCase())) continue;
      names.add(name.toLowerCase());
      props.onAdd(emptyItem('skill', { name }));
    }
    setDraft('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add(draft);
    }
  }

  return (
    <div className={styles.itemList}>
      {props.items.length > 0 ? (
        <ul className={styles.chips}>
          {props.items.map((item) => {
            const suggested = item.verification === 'suggested' && !item.confirm;
            return (
              <li
                key={item.key}
                className={suggested ? `${styles.chip} ${styles.chipSuggested}` : styles.chip}
              >
                <span>{item.values.name}</span>
                {suggested ? (
                  <button
                    type="button"
                    className={styles.chipAction}
                    aria-label={`Confirmar a sugestão ${item.values.name}`}
                    title="Sugestão: confirmar"
                    onClick={() => props.onConfirm(item.key)}
                  >
                    ✓
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.chipAction}
                  aria-label={`Remover ${item.values.name}`}
                  onClick={() => props.onRemove(item.key)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className={styles.addRow}>
        <label htmlFor={inputId} className="visually-hidden">
          Nova skill
        </label>
        <input
          id={inputId}
          className={styles.addInput}
          placeholder="Ex.: Python, Power BI, Gestão de projetos"
          maxLength={300}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
        />
        <Button variant="secondary" disabled={!draft.trim()} onClick={() => add(draft)}>
          + Adicionar
        </Button>
      </div>
      <p className={styles.footnote}>
        Pressione Enter ou vírgula para adicionar · {props.items.length}{' '}
        {props.items.length === 1 ? 'skill' : 'skills'}
      </p>
    </div>
  );
}

const LEVELS = ['Básico', 'Intermediário', 'Avançado', 'Fluente', 'Nativo'];

function LevelSelect({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  // Nível que veio do documento com outro nome continua aparecendo como está.
  const options = value && !LEVELS.includes(value) ? [value, ...LEVELS] : LEVELS;
  return (
    <select
      className={styles.levelSelect}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Nível não informado</option>
      {options.map((level) => (
        <option key={level} value={level}>
          {level}
        </option>
      ))}
    </select>
  );
}

/** Idiomas numa linha cada: nome, nível e remover. */
export function LanguagesEditor(props: ListProps) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');
  const inputId = useId();

  function add() {
    if (!name.trim()) return;
    props.onAdd(emptyItem('language', { name: name.trim(), level }));
    setName('');
    setLevel('');
  }

  return (
    <div className={styles.itemList}>
      {props.items.map((item) => (
        <div key={item.key} className={styles.languageRow}>
          <span className={styles.languageName}>
            {item.values.name}
            {item.verification === 'suggested' && !item.confirm ? (
              <Button variant="plain" onClick={() => props.onConfirm(item.key)}>
                Confirmar sugestão
              </Button>
            ) : null}
          </span>
          <LevelSelect
            label={`Nível de ${item.values.name}`}
            value={item.values.level ?? ''}
            onChange={(value) => props.onChange(item.key, { ...item.values, level: value })}
          />
          <button
            type="button"
            className={styles.chipAction}
            aria-label={`Remover ${item.values.name}`}
            onClick={() => props.onRemove(item.key)}
          >
            ×
          </button>
        </div>
      ))}
      <div className={styles.addRow}>
        <label htmlFor={inputId} className="visually-hidden">
          Novo idioma
        </label>
        <input
          id={inputId}
          className={styles.addInput}
          placeholder="Ex.: Inglês"
          maxLength={300}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <LevelSelect label="Nível do novo idioma" value={level} onChange={setLevel} />
        <Button variant="secondary" disabled={!name.trim()} onClick={add}>
          + Adicionar
        </Button>
      </div>
    </div>
  );
}
