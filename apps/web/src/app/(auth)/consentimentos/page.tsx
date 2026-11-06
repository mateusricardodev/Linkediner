import type { Metadata } from 'next';
import { Suspense } from 'react';
import styles from '../auth.module.css';
import { ConsentForm } from './consent-form';

export const metadata: Metadata = { title: 'Autorizações · LinkedIner' };

export default function ConsentPage() {
  return (
    <main className={styles.page}>
      <Suspense>
        <ConsentForm />
      </Suspense>
    </main>
  );
}
