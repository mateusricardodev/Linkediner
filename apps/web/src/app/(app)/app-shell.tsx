'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Briefcase, ClipboardCheck, FileText, House, LogOut, Settings, User } from 'lucide-react';
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
