'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AccountTab } from './account-tab';
import styles from './perfil.module.css';
import { ProfessionalTab } from './professional-tab';

const TABS = [
  { key: 'conta', label: 'Conta' },
  { key: 'profissional', label: 'Perfil profissional' },
] as const;

type Tab = (typeof TABS)[number]['key'];

function ProfileTabs() {
  const param = useSearchParams().get('tab');
  // Como no Linkelyzer, o perfil abre na conta. Valor desconhecido também cai nela.
  const tab: Tab = param === 'profissional' ? 'profissional' : 'conta';

  return (
    <>
      <nav className={styles.tabs} aria-label="Seções do perfil">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/perfil?tab=${item.key}`}
            scroll={false}
            className={item.key === tab ? `${styles.tabLink} ${styles.tabActive}` : styles.tabLink}
            aria-current={item.key === tab ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {tab === 'conta' ? <AccountTab /> : <ProfessionalTab />}
    </>
  );
}

export default function ProfilePage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Perfil</h1>
        <p className={styles.subtitle}>Sua conta e o seu perfil profissional.</p>
      </header>
      <Suspense fallback={null}>
        <ProfileTabs />
      </Suspense>
    </div>
  );
}
