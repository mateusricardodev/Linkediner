import Link from 'next/link';
import { formatPeriod, SECTION_LINES } from '../../../lib/resumes';
import type { ResumeContent } from '../../../lib/types';
import styles from './curriculo.module.css';
import { ReviewItem } from './review-item';

function Lines({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <section className={styles.block}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <ul className={styles.plainLines}>
        {lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

/** O conteúdo de um currículo: o geral ou o adaptado a uma vaga. */
export function ResumeContentView({
  content,
  path,
  onChanged,
  readOnly = false,
  createsFacts = true,
  tips,
}: {
  content: ResumeContent;
  path: (itemId: string) => string;
  onChanged: () => void;
  readOnly?: boolean;
  createsFacts?: boolean;
  /** Melhorias pontuais da conferência ATS, por frase. */
  tips?: ReadonlyMap<string, string[]>;
}) {
  const itemProps = { path, onChanged, readOnly, createsFacts };
  const hasGenerated = content.summary.length > 0 || content.experiences.length > 0;
  return (
    <>
      {content.summary.length > 0 ? (
        <section className={styles.block}>
          <h2 className={styles.sectionTitle}>Resumo</h2>
          <ul className={styles.list}>
            {content.summary.map((item) => (
              <ReviewItem key={item.id} item={item} tips={tips?.get(item.id)} {...itemProps} />
            ))}
          </ul>
        </section>
      ) : null}

      {content.experiences.length > 0 ? (
        <section className={styles.block}>
          <h2 className={styles.sectionTitle}>Experiências</h2>
          {content.experiences.map((experience) => (
            <div key={experience.factId} className={styles.experience}>
              <div className={styles.experienceHead}>
                <h3 className={styles.experienceTitle}>
                  {[experience.title, experience.company].filter(Boolean).join(' em ')}
                </h3>
                <p className={styles.rowMeta}>
                  {[formatPeriod(experience.startDate, experience.endDate), experience.location]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {experience.bullets.length > 0 ? (
                <ul className={styles.list}>
                  {experience.bullets.map((item) => (
                    <ReviewItem
                      key={item.id}
                      item={item}
                      tips={tips?.get(item.id)}
                      {...itemProps}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {!hasGenerated ? (
        <p className={styles.empty}>A geração não produziu frases para este currículo.</p>
      ) : null}

      <Lines
        title="Competências"
        lines={content.skills.length ? [content.skills.join(', ')] : []}
      />
      <Lines title="Formação" lines={content.education.map(SECTION_LINES.education)} />
      <Lines
        title="Certificações"
        lines={content.certifications.map(SECTION_LINES.certifications)}
      />
      <Lines title="Projetos" lines={content.projects.map(SECTION_LINES.projects)} />
      <Lines title="Idiomas" lines={content.languages.map(SECTION_LINES.languages)} />

      <p className={styles.footnote}>
        Competências, formação e datas vêm direto do seu perfil. Para mudar, corrija em{' '}
        <Link href="/perfil">Perfil</Link> e gere de novo.
      </p>
    </>
  );
}
