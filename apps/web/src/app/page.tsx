import { getApiStatus } from '../lib/api';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const LABEL = {
  ok: 'API conectada',
  degraded: 'API com dependências indisponíveis',
  offline: 'API offline',
} as const;

/** Página provisória da fundação. As telas do produto seguem o design aprovado no Figma. */
export default async function Home() {
  const status = await getApiStatus();
  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <div className={styles.mark} aria-hidden>
          L
        </div>
        <h1 className={styles.title}>LinkedIner</h1>
        <p className={styles.subtitle}>
          Fundação do projeto no ar. As telas do produto entram nas próximas etapas.
        </p>
        <span className={`${styles.status} ${styles[status]}`}>{LABEL[status]}</span>
      </section>
    </main>
  );
}
