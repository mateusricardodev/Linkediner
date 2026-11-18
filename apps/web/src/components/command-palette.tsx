'use client';

import {
  Briefcase,
  ClipboardCheck,
  FilePlus,
  FileUp,
  LogOut,
  Plus,
  Search,
  Target,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { Application, Job } from '../lib/types';
import { useResource } from '../lib/use-resource';
import styles from './command-palette.module.css';

export interface PalettePage {
  href: string;
  label: string;
  Icon: LucideIcon;
}

interface Item {
  key: string;
  label: string;
  detail?: string;
  keywords?: string;
  Icon: LucideIcon;
  run: () => void;
}

interface Group {
  title: string;
  items: Item[];
  /** Só aparece quando a pessoa digita: listas longas não entram na abertura. */
  searchOnly?: boolean;
}

const SEARCH_LIMIT = 5;

/** Sem acento e sem caixa: "curriculo" encontra "Currículo". */
const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function PaletteBody({
  pages,
  onClose,
  onSignOut,
}: {
  pages: PalettePage[];
  onClose: () => void;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  // Só busca quando a central abre. Se falhar, ela segue útil com páginas e ações.
  const jobs = useResource(() => api<Job[]>('/v1/jobs'));
  const applications = useResource(() => api<Application[]>('/v1/applications'));
  const go = (href: string) => () => router.push(href);

  const groups: Group[] = [
    {
      title: 'Ir para',
      items: pages.map(({ href, label, Icon }) => ({
        key: href,
        label,
        Icon,
        run: go(href),
      })),
    },
    {
      title: 'Ações',
      items: [
        {
          key: 'importar-vaga',
          label: 'Importar uma vaga',
          keywords: 'colar texto analisar',
          Icon: Plus,
          run: go('/vagas#importar'),
        },
        {
          key: 'enviar-documento',
          label: 'Enviar um documento',
          keywords: 'currículo curriculo pdf linkedin upload',
          Icon: FileUp,
          run: go('/perfil#documentos'),
        },
        {
          key: 'gerar-curriculo',
          label: 'Gerar um currículo',
          keywords: 'novo criar',
          Icon: FilePlus,
          run: go('/curriculo'),
        },
        {
          key: 'novo-objetivo',
          label: 'Novo objetivo de carreira',
          keywords: 'meta cargo',
          Icon: Target,
          run: go('/perfil#objetivos'),
        },
        { key: 'sair', label: 'Sair', keywords: 'logout', Icon: LogOut, run: onSignOut },
      ],
    },
    {
      title: 'Vagas',
      searchOnly: true,
      items: [...(jobs.data ?? [])].reverse().map((job) => ({
        key: `job-${job.id}`,
        label: job.title ?? 'Vaga sem título',
        detail: [job.company, job.location].filter(Boolean).join(' · '),
        Icon: Briefcase,
        run: go(`/vagas/${job.id}`),
      })),
    },
    {
      title: 'Candidaturas',
      searchOnly: true,
      items: (applications.data ?? []).map((application) => ({
        key: `application-${application.id}`,
        label: application.job.title ?? 'Vaga sem título',
        detail: application.job.company ?? undefined,
        Icon: ClipboardCheck,
        run: go(`/candidaturas/${application.id}`),
      })),
    },
  ];

  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  const matches = (item: Item) =>
    tokens.every((token) =>
      normalize(`${item.label} ${item.detail ?? ''} ${item.keywords ?? ''}`).includes(token),
    );
  const visible = groups
    .filter((group) => tokens.length > 0 || !group.searchOnly)
    .map((group) => ({
      ...group,
      items: group.items.filter(matches).slice(0, group.searchOnly ? SEARCH_LIMIT : undefined),
    }))
    .filter((group) => group.items.length > 0);
  const flat = visible.flatMap((group) => group.items);
  const current = Math.min(active, Math.max(flat.length - 1, 0));
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => {
    document.getElementById(optionId(current))?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  function run(item: Item | undefined) {
    if (!item) return;
    onClose();
    item.run();
  }

  let index = -1;
  return (
    <>
      <div className={styles.header}>
        <Search size={18} strokeWidth={1.9} className={styles.searchIcon} aria-hidden />
        <input
          autoFocus
          role="combobox"
          aria-label="Buscar vaga, candidatura ou página"
          aria-expanded
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={flat.length > 0 ? optionId(current) : undefined}
          className={styles.input}
          placeholder="Buscar vaga, candidatura ou página…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (flat.length === 0) return;
              const step = event.key === 'ArrowDown' ? 1 : -1;
              const last = flat.length - 1;
              setActive((value) => (Math.min(value, last) + step + flat.length) % flat.length);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              run(flat[current]);
            }
          }}
        />
        <button type="button" className={styles.close} aria-label="Fechar" onClick={onClose}>
          <X size={16} strokeWidth={1.9} aria-hidden />
        </button>
      </div>

      <div id={`${id}-list`} role="listbox" aria-label="Resultados" className={styles.list}>
        {visible.map((group) => (
          <div key={group.title} role="group" aria-labelledby={`${id}-${group.title}`}>
            <div id={`${id}-${group.title}`} className={styles.groupLabel}>
              {group.title}
            </div>
            {group.items.map((item) => {
              index += 1;
              const position = index;
              return (
                <div
                  key={item.key}
                  id={optionId(position)}
                  role="option"
                  aria-selected={position === current}
                  className={styles.option}
                  onMouseMove={() => setActive(position)}
                  onClick={() => run(item)}
                >
                  <span className={styles.iconBox} aria-hidden>
                    <item.Icon size={16} strokeWidth={1.9} />
                  </span>
                  <span className={styles.label}>{item.label}</span>
                  {item.detail ? <span className={styles.detail}>{item.detail}</span> : null}
                </div>
              );
            })}
          </div>
        ))}
        {flat.length === 0 ? (
          <p className={styles.empty}>
            Nada encontrado para “{query.trim()}”. Tente o nome da vaga ou da empresa.
          </p>
        ) : null}
      </div>
      <span className="visually-hidden" role="status">
        {flat.length === 0 ? 'Nenhum resultado' : `${flat.length} resultados`}
      </span>

      <div className={styles.footer} aria-hidden>
        <span>
          <kbd className={styles.kbd}>↑</kbd> <kbd className={styles.kbd}>↓</kbd> navegar
        </span>
        <span>
          <kbd className={styles.kbd}>Enter</kbd> abrir
        </span>
        <span>
          <kbd className={styles.kbd}>Esc</kbd> fechar
        </span>
      </div>
    </>
  );
}

/** Central de comandos: busca e atalhos num só lugar. Abre com Ctrl+K (⌘K no Mac). */
export function CommandPalette({
  open,
  session,
  onClose,
  pages,
  onSignOut,
}: {
  open: boolean;
  /** Muda a cada abertura, para a busca começar sempre vazia. */
  session: number;
  onClose: () => void;
  pages: PalettePage[];
  onSignOut: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // O <dialog> cuida de prender o foco, de fechar com Esc e de devolver o foco a quem abriu.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label="Central de comandos"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open ? (
        <PaletteBody key={session} pages={pages} onClose={onClose} onSignOut={onSignOut} />
      ) : null}
    </dialog>
  );
}
