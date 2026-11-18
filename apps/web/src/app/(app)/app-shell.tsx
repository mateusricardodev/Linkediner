'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Briefcase,
  ClipboardCheck,
  FileText,
  House,
  LogOut,
  Search,
  Settings,
  User,
} from 'lucide-react';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CommandPalette } from '../../components/command-palette';
import { Button, Notice, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import type { Me } from '../../lib/types';
import { useResource } from '../../lib/use-resource';
import styles from './app-shell.module.css';
import { PlanUsage } from './plan-usage';

const MeContext = createContext<Me | null>(null);

/** Quem está logado. Só existe dentro da área logada, depois da conferência da sessão. */
export function useMe(): Me {
  const me = use(MeContext);
  if (!me) throw new Error('useMe fora da área logada.');
  return me;
}

const NAV = [
  {
    href: '/inicio',
    label: 'Início',
    Icon: House,
  },
  {
    href: '/perfil',
    label: 'Perfil',
    Icon: User,
  },
  {
    href: '/vagas',
    label: 'Vagas',
    Icon: Briefcase,
  },
  {
    href: '/candidaturas',
    label: 'Candidaturas',
    Icon: ClipboardCheck,
  },
  {
    href: '/curriculo',
    label: 'Currículo',
    Icon: FileText,
  },
  {
    href: '/conta',
    label: 'Conta',
    Icon: Settings,
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me, error, reload } = useResource(() => api<Me>('/v1/me'));
  const [leaving, setLeaving] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const [palette, setPalette] = useState({ open: false, session: 0 });
  const [modifier, setModifier] = useState('Ctrl');

  const unauthenticated = error?.status === 401;
  const missingConsents = (me?.consents.missingRequired.length ?? 0) > 0;

  useEffect(() => {
    const next = encodeURIComponent(pathname);
    if (unauthenticated) router.replace(`/entrar?next=${next}`);
    else if (missingConsents) router.replace(`/consentimentos?next=${next}`);
  }, [unauthenticated, missingConsents, pathname, router]);

  // No celular, o menu rola: a página atual precisa ficar à vista.
  useEffect(() => {
    document
      .querySelector('nav [aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname, me]);

  // A pílula do menu desliza até o item clicado. A rota confirma depois, e ela se ajusta à página atual.
  const place = useCallback((target: Element | null) => {
    const nav = navRef.current;
    const bar = indicatorRef.current;
    if (!nav || !bar) return;
    const link =
      (target?.closest('a') as HTMLElement | null) ??
      nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!link) {
      bar.style.opacity = '0';
      return;
    }
    bar.style.setProperty('--y', `${link.offsetTop}px`);
    bar.style.opacity = '1';
  }, []);

  // A primeira posição é sem animação: a pílula só desliza a partir daí.
  useLayoutEffect(() => {
    place(null);
    const frame = requestAnimationFrame(() => {
      if (indicatorRef.current) indicatorRef.current.dataset.ready = '';
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, place]);

  useEffect(() => {
    setModifier(/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl');
  }, []);

  const closePalette = useCallback(() => setPalette((p) => ({ ...p, open: false })), []);
  const togglePalette = useCallback(
    () =>
      setPalette((p) => (p.open ? { ...p, open: false } : { open: true, session: p.session + 1 })),
    [],
  );

  // Ctrl+K (⌘K no Mac) abre e fecha a central, de qualquer tela da área logada.
  // "/" também abre, mas só fora de campos de texto: ninguém digita uma barra para buscar.
  const ready = Boolean(me) && !missingConsents;
  useEffect(() => {
    if (!ready) return;
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    const onKey = (event: KeyboardEvent) => {
      const isK = event.key.toLowerCase() === 'k' || event.code === 'KeyK';
      if ((event.ctrlKey || event.metaKey) && isK) {
        event.preventDefault();
        togglePalette();
      } else if (
        event.key === '/' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !typing(event.target)
      ) {
        event.preventDefault();
        setPalette((p) => (p.open ? p : { open: true, session: p.session + 1 }));
      }
    };
    // Na captura, para nada na página interceptar o atalho antes.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [ready, togglePalette]);

  async function signOut() {
    setLeaving(true);
    try {
      await api('/v1/auth/sign-out', { method: 'POST', body: {} });
    } finally {
      router.replace('/');
    }
  }

  if (error && !unauthenticated) {
    return (
      <main className={styles.blocked}>
        <Notice tone="danger">{error.message}</Notice>
        <Button variant="secondary" onClick={() => void reload()}>
          Tentar de novo
        </Button>
      </main>
    );
  }
  // Dados e telas da área logada só aparecem depois de confirmar a sessão e os consentimentos.
  // Antes disso, só a estrutura fica à vista, inativa, com o spinner por cima.
  const loading = !me || missingConsents;

  const shell = (
    <div className={styles.shell} inert={loading} aria-busy={loading}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden>
            L
          </span>
          LinkedIner
        </div>
        <div className={styles.menu}>
          <button
            type="button"
            className={styles.searchButton}
            aria-keyshortcuts="Control+K Meta+K /"
            onClick={togglePalette}
          >
            <Search size={16} strokeWidth={1.9} aria-hidden />
            <span className={styles.searchLabel}>Buscar</span>
            <kbd className={styles.kbd}>{modifier} K</kbd>
          </button>
          <nav
            ref={navRef}
            className={styles.nav}
            aria-label="Principal"
            onClick={(event) => place(event.target as Element)}
          >
            <span ref={indicatorRef} className={styles.indicator} aria-hidden />
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? `${styles.link} ${styles.active}` : styles.link}
                  aria-current={active ? 'page' : undefined}
                >
                  <item.Icon size={20} strokeWidth={1.75} aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        {me && !loading ? (
          <>
            <PlanUsage />
            <div className={styles.account}>
              <span className={styles.accountName}>{me.user.name ?? me.user.email}</span>
              <Button
                icon={LogOut}
                variant="plain"
                disabled={leaving}
                onClick={() => void signOut()}
              >
                Sair
              </Button>
            </div>
          </>
        ) : null}
      </aside>
      <main className={styles.content}>{me && !loading ? children : null}</main>
      {me && !loading ? (
        <CommandPalette
          open={palette.open}
          session={palette.session}
          onClose={closePalette}
          pages={NAV}
          onSignOut={() => void signOut()}
        />
      ) : null}
    </div>
  );

  if (me && !loading) return <MeContext value={me}>{shell}</MeContext>;
  return (
    <>
      {shell}
      <Spinner />
    </>
  );
}
