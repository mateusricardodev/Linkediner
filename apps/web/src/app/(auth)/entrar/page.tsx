import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '../auth-form';
import styles from '../auth.module.css';

export const metadata: Metadata = { title: 'Entrar · LinkedIner' };

export default function SignInPage() {
  return (
    <main className={styles.page}>
      <Suspense>
        <AuthForm mode="sign-in" />
      </Suspense>
    </main>
  );
}
