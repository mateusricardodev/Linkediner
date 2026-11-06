import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '../auth-form';
import styles from '../auth.module.css';

export const metadata: Metadata = { title: 'Criar conta · LinkedIner' };

export default function SignUpPage() {
  return (
    <main className={styles.page}>
      <Suspense>
        <AuthForm mode="sign-up" />
      </Suspense>
    </main>
  );
}
