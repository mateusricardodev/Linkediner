'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { Button, Notice } from '../../components/ui';
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

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  {
    href: '/inicio',
    label: 'Início',
    icon: 'M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3.5v-5.5h3V20H17a1 1 0 0 0 1-1v-9',
  },
  {
    href: '/analise-linkedin',
    label: 'Análise de LinkedIn',
    icon: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7',
  },
  {
    href: '/analise-curriculo',
    label: 'Análise de currículo',
    icon: 'M7 3h7l4 4v6M14 3v4h4M6 21a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1M9 12h4M9 16h2M17.5 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM21 22l-1.7-1.7',
  },
  {
    href: '/curriculo',
    label: 'Gerar currículo',
    icon: 'M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v4h4M12 11v6M9 14h6',
  },
  {
    href: '/vagas',
    label: 'Vagas',
    icon: 'M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1ZM9 8V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M3 13h18',
  },
  {
    href: '/candidaturas',
    label: 'Candidaturas',
    icon: 'M9 5H7a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1H9V5ZM9 13l2 2 4-4',
  },
];

/** O que é da pessoa fica no rodapé do menu, longe das ferramentas do dia a dia. */
const NAV_ACCOUNT: NavItem[] = [
  {
    href: '/perfil',
    label: 'Perfil',
    icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0',
  },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      className={active ? `${styles.link} ${styles.active}` : styles.link}
      aria-current={active ? 'page' : undefined}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={item.icon} />
      </svg>
      {item.label}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me, error, reload } = useResource(() => api<Me>('/v1/me'));
  const [leaving, setLeaving] = useState(false);

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
  // Nada da área logada aparece antes de confirmar a sessão e os consentimentos.
  if (!me || missingConsents) return <div className={styles.blocked} aria-busy="true" />;

  return (
    <MeContext value={me}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            <span className={styles.mark} aria-hidden>
              L
            </span>
            LinkedIner
          </div>
          <div className={styles.navArea}>
            <nav className={styles.nav} aria-label="Principal">
              {NAV.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </nav>
            <nav className={styles.navAccount} aria-label="Sua conta">
              {NAV_ACCOUNT.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </nav>
          </div>
          <PlanUsage />
          <div className={styles.account}>
            <span className={styles.accountName}>{me.user.name ?? me.user.email}</span>
            <Button variant="plain" disabled={leaving} onClick={() => void signOut()}>
              Sair
            </Button>
          </div>
        </aside>
        <main className={styles.content}>{children}</main>
      </div>
    </MeContext>
  );
}
