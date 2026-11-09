import type { AtsReport } from '../../../lib/types';
import styles from './curriculo.module.css';

/**
 * Conferência pelo padrão dos sistemas de recrutamento. O que falta vem primeiro, sempre com o que
 * fazer, e as dicas de cada frase aparecem junto dela.
 */
export function AtsPanel({ report }: { report: AtsReport }) {
  const failing = report.checks.filter((c) => !c.ok);
  const passing = report.checks.filter((c) => c.ok);
  const firstTip = report.tips[0];
  const ready = failing.length === 0 && report.tips.length === 0;

  return (
    <section className={styles.ats} aria-labelledby="ats-titulo">
      <div className={styles.atsHead}>
        <div>
          <h2 id="ats-titulo" className={styles.atsTitle}>
            Conferência ATS
          </h2>
          <p className={styles.footnote}>
            Como os sistemas de recrutamento leem o seu currículo. Não indica chance de contratação.
          </p>
        </div>
        <p className={styles.atsScore}>
          {report.passed}
          <span> de {report.total}</span>
        </p>
      </div>
      <div
        className={styles.atsBar}
        role="progressbar"
        aria-label="Itens da conferência atendidos"
        aria-valuemin={0}
        aria-valuemax={report.total}
        aria-valuenow={report.passed}
      >
        <span style={{ width: `${(report.passed / Math.max(report.total, 1)) * 100}%` }} />
      </div>

      {ready ? (
        <p className={styles.atsReady}>
          Tudo certo: o currículo segue o padrão que os sistemas de recrutamento leem melhor.
        </p>
      ) : (
        <>
          <p className={styles.atsLabel}>Próximas melhorias</p>
          <ul className={styles.atsList}>
            {failing.map((check) => (
              <li key={check.id} data-ok="false">
                <span className={styles.atsCheckLabel}>{check.label}</span>
                <span className={styles.atsRecommendation}>{check.recommendation}</span>
              </li>
            ))}
            {firstTip ? (
              <li data-ok="false">
                <span className={styles.atsCheckLabel}>
                  {report.tips.length === 1
                    ? '1 ajuste pontual nas frases'
                    : `${report.tips.length} ajustes pontuais nas frases`}
                </span>
                <span className={styles.atsRecommendation}>
                  Cada um aparece embaixo da frase.{' '}
                  <a href={`#frase-${firstTip.itemId}`}>Ir para o primeiro</a>
                </span>
              </li>
            ) : null}
          </ul>
        </>
      )}

      {passing.length > 0 ? (
        <details className={styles.atsPassed}>
          <summary>
            {passing.length === 1 ? '1 item atendido' : `${passing.length} itens atendidos`}
          </summary>
          <ul className={styles.atsList}>
            {passing.map((check) => (
              <li key={check.id} data-ok="true">
                <span className={styles.atsCheckLabel}>{check.label}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
