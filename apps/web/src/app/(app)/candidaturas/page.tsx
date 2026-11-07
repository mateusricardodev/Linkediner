'use client';

import Link from 'next/link';
import { APPLICATION_STATE_LABELS } from '../../../components/application-state';
import { Badge, Notice, Skeleton } from '../../../components/ui';
import { api } from '../../../lib/api';
import { groupApplications } from '../../../lib/applications';
import type { Application } from '../../../lib/types';
import { usePollWhile } from '../../../lib/use-poll';
import { useResource } from '../../../lib/use-resource';
import styles from '../vagas/vagas.module.css';

export default function ApplicationsPage() {
  const { data, error, reload } = useResource(() => api<Application[]>('/v1/applications'));
  usePollWhile(data?.some((a) => a.state === 'analyzing') ?? false, reload, data);
  const groups = groupApplications(data ?? []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Candidaturas</h1>
        <p className={styles.subtitle}>
          Você revisa e aprova cada candidatura. O LinkedIner não envia nada sozinho: o envio é
          feito por você, na página da vaga.
        </p>
      </header>

      {error && !data ? (
        <Notice tone="danger">{error.message}</Notice>
      ) : !data ? (
        <Skeleton height={88} />
      ) : groups.length === 0 ? (
        <p className={styles.empty}>
          Nenhuma candidatura ainda. Abra uma das suas <Link href="/vagas">vagas</Link> para
          preparar a primeira.
        </p>
      ) : (
        groups.map(({ title, items }) => (
          <section key={title} className={styles.section}>
            <h2 className={styles.sectionTitle}>{title}</h2>
            <ul className={styles.list}>
              {items.map((application) => {
                const state = APPLICATION_STATE_LABELS[application.state];
                return (
                  <li key={application.id}>
                    <Link href={`/candidaturas/${application.id}`} className={styles.jobLink}>
                      <span className={styles.rowText}>
                        <span className={styles.rowTitle}>
                          {application.job.title ?? 'Vaga sem título'}
                        </span>
                        <span className={styles.rowMeta}>
                          {application.job.company ?? 'Empresa não informada'}
                        </span>
                      </span>
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
