'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { Button, Notice } from '../../components/ui';
import { api } from '../../lib/api';
import type { Me } from '../../lib/types';
import { useResource } from '../../lib/use-resource';
import styles from './app-shell.module.css';

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
    icon: 'M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3.5v-5.5h3V20H17a1 1 0 0 0 1-1v-9',
  },
];

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

  async function signOut() {
    setLeaving(true);
    try {
      await api('/v1/auth/sign-out', { method: 'POST', body: {} });
    } finally {
      router.replace('/entrar');
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
          <nav className={styles.nav} aria-label="Principal">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
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
            })}
          </nav>
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
