import type { FileCheck } from '../../../lib/types';
import styles from './perfil.module.css';

/**
 * Como um sistema de recrutamento leria o arquivo enviado. O que falta vem aberto, com o que fazer;
 * o que está certo fica recolhido.
 */
export function FileCheckPanel({ report }: { report: FileCheck }) {
  const failing = report.checks.filter((c) => !c.ok);
  const passing = report.checks.filter((c) => c.ok);
  return (
    <div className={styles.fileCheck}>
      <p className={styles.fileCheckHead}>
        <span className={styles.fileCheckTitle}>Leitura pelos sistemas de recrutamento (ATS)</span>
        <span className={styles.fileCheckScore}>
          {report.passed} de {report.total}
        </span>
      </p>
      {failing.length === 0 ? (
        <p className={styles.fileCheckOk}>
          O arquivo segue o formato que os sistemas de recrutamento leem melhor.
        </p>
      ) : (
        <ul className={styles.fileCheckList}>
          {failing.map((check) => (
            <li key={check.id} data-ok="false">
              <span className={styles.fileCheckLabel}>{check.label}</span>
              <span className={styles.fileCheckText}>{check.recommendation}</span>
            </li>
          ))}
        </ul>
      )}
      {passing.length > 0 && failing.length > 0 ? (
        <details className={styles.fileCheckPassed}>
          <summary>
            {passing.length === 1 ? '1 item certo' : `${passing.length} itens certos`}
          </summary>
          <ul className={styles.fileCheckList}>
            {passing.map((check) => (
              <li key={check.id} data-ok="true">
                <span className={styles.fileCheckLabel}>{check.label}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
