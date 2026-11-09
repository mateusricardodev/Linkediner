import Link from 'next/link';
import type { ReactNode } from 'react';
import { LEGAL } from '../lib/legal';
import styles from './legal-page.module.css';

/** Página de texto legal: leitura confortável, sumário e as mesmas marcas da página inicial. */
export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: ReactNode;
  sections: { id: string; title: string; body: ReactNode }[];
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            <span className={styles.mark} aria-hidden>
              L
            </span>
            LinkedIner
          </Link>
          <nav className={styles.nav} aria-label="Documentos">
            <Link href="/termos">Termos de Uso</Link>
            <Link href="/privacidade">Privacidade</Link>
          </nav>
        </div>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.meta}>
          Versão {LEGAL.version}, atualizada em {LEGAL.updatedAt}.
        </p>
        <div className={styles.intro}>{intro}</div>

        <nav className={styles.toc} aria-label="Nesta página">
          <p className={styles.tocTitle}>Nesta página</p>
          <ol>
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((section, index) => (
          <section key={section.id} id={section.id} className={styles.section}>
            <h2>
              {index + 1}. {section.title}
            </h2>
            {section.body}
          </section>
        ))}
      </main>

      <footer className={styles.footer}>
        <span>
          © {new Date().getFullYear()} {LEGAL.controller}
        </span>
        <nav className={styles.footerNav} aria-label="Rodapé">
          <Link href="/">Página inicial</Link>
          <Link href="/entrar">Entrar</Link>
        </nav>
      </footer>
    </div>
  );
}
