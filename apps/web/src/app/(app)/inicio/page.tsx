'use client';

import Link from 'next/link';
import { APPLICATION_STATE_LABELS } from '../../../components/application-state';
import { Badge, ButtonLink, Notice, ScoreRing, Skeleton } from '../../../components/ui';
import { api } from '../../../lib/api';
import { CHECKLIST } from '../../../lib/linkedin-checklist';
import type { Dashboard, Profile, ProfileScore, Recommendations } from '../../../lib/types';
import { useResource } from '../../../lib/use-resource';
import { useMe } from '../app-shell';
import styles from './inicio.module.css';
import { ScoreTrend } from './score-trend';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Os três caminhos principais, sempre à mão no topo. */
const SHORTCUTS = [
  {
    href: '/perfil#documentos',
    title: 'Analisar currículo',
    text: 'Veja o score e como os sistemas de recrutamento leem o seu arquivo.',
    action: 'Analisar',
    icon: 'M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v4h4M9 13l2 2 4-4',
  },
  {
    href: '/curriculo',
    title: 'Gerar currículo',
    text: 'Em português ou inglês, geral ou pensado para uma vaga salva.',
    action: 'Gerar',
    icon: 'M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v4h4M12 11v6M9 14h6',
  },
  {
    href: '/vagas',
    title: 'Ver vagas',
    text: 'Compare o seu perfil com cada vaga, requisito por requisito.',
    action: 'Ver vagas',
    icon: 'M4 8h16v11H4zM9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M4 13h16',
  },
];

function Rows({ count = 3 }: { count?: number }) {
  return (
    <div className={styles.list} aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.row}>
          <Skeleton width="60%" height={20} />
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const me = useMe();
  const dashboard = useResource(() => api<Dashboard>('/v1/dashboard'));
  const recommendations = useResource(() => api<Recommendations>('/v1/jobs/recommendations'));
  const score = useResource(() => api<ProfileScore>('/v1/profile/score'));
  const profile = useResource(() => api<Profile>('/v1/profile'));
  const checklistDone = profile.data?.linkedinChecklist.length ?? 0;
  const firstName = me.user.name?.split(' ')[0];
  const gaps = score.data?.factors.filter((f) => f.kind === 'gap').slice(0, 3) ?? [];
  const positives = score.data?.factors.filter((f) => f.kind === 'positive').slice(0, 2) ?? [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{firstName ? `Olá, ${firstName}` : 'Início'}</h1>
        {dashboard.data ? (
          <p className={styles.summary}>
            {plural(dashboard.data.total, 'candidatura', 'candidaturas')} ·{' '}
            {plural(dashboard.data.sent, 'enviada', 'enviadas')} ·{' '}
            {plural(dashboard.data.interviews, 'entrevista', 'entrevistas')}
          </p>
        ) : null}
      </header>

      <nav className={styles.shortcuts} aria-label="Atalhos">
        {SHORTCUTS.map((item) => (
          <Link key={item.href} href={item.href} className={styles.shortcut}>
            <span className={styles.shortcutIcon} aria-hidden>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={item.icon} />
              </svg>
            </span>
            <span className={styles.shortcutTitle}>{item.title}</span>
            <span className={styles.shortcutText}>{item.text}</span>
            <span className={styles.shortcutAction}>{item.action} →</span>
          </Link>
        ))}
      </nav>

      <div className={styles.columns}>
        <div className={styles.main}>
          <section aria-labelledby="atencao">
            <h2 id="atencao" className={styles.sectionTitle}>
              Precisa da sua atenção
            </h2>
            {dashboard.error ? (
              <Notice tone="danger">{dashboard.error.message}</Notice>
            ) : !dashboard.data ? (
              <Rows count={2} />
            ) : dashboard.data.needsAttention.length === 0 ? (
              <div className={styles.empty}>
                <p>Nenhuma candidatura esperando por você.</p>
                <ButtonLink variant="secondary" href="/vagas">
                  Encontrar uma vaga
                </ButtonLink>
              </div>
            ) : (
              <ul className={styles.list}>
                {dashboard.data.needsAttention.map((application) => {
                  const state = APPLICATION_STATE_LABELS[application.state];
                  return (
                    <li key={application.id} className={styles.row}>
                      <div className={styles.rowText}>
                        <Link href={`/candidaturas/${application.id}`} className={styles.rowLink}>
                          {application.job.title ?? 'Vaga sem título'}
                        </Link>
                        <span className={styles.rowMeta}>
                          {application.job.company ?? 'Empresa não informada'}
                        </span>
                      </div>
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="vagas">
            <h2 id="vagas" className={styles.sectionTitle}>
              Vagas recomendadas
            </h2>
            {recommendations.error ? (
              <Notice tone="danger">{recommendations.error.message}</Notice>
            ) : !recommendations.data ? (
              <Rows />
            ) : recommendations.data.items.length === 0 ? (
              <div className={styles.empty}>
                <p>Importe uma vaga para ver o quanto ela combina com o seu perfil.</p>
                <ButtonLink variant="secondary" href="/vagas">
                  Importar vaga
                </ButtonLink>
              </div>
            ) : (
              <>
                <ul className={styles.list}>
                  {recommendations.data.items.slice(0, 5).map(({ job, score: match }) => (
                    <li key={job.id} className={styles.row}>
                      <div className={styles.rowText}>
                        <Link href={`/vagas/${job.id}`} className={styles.rowLink}>
                          {job.title ?? 'Vaga sem título'}
                        </Link>
                        <span className={styles.rowMeta}>
                          {[job.company, job.location].filter(Boolean).join(' · ') ||
                            'Empresa não informada'}
                        </span>
                      </div>
                      {match === null ? (
                        <span className={styles.noMatch}>Sem dados suficientes</span>
                      ) : (
                        <span className={styles.match}>
                          {match}%<span className={styles.matchLabel}>compatível</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className={styles.disclaimer}>{recommendations.data.disclaimer}</p>
              </>
            )}
          </section>
        </div>

        <aside aria-labelledby="perfil" className={styles.aside}>
          <h2 id="perfil" className={styles.sectionTitle}>
            Seu perfil
          </h2>
          <div className={styles.profile}>
            {score.error ? (
              <Notice tone="danger">{score.error.message}</Notice>
            ) : !score.data ? (
              <Skeleton height={200} />
            ) : (
              <>
                <div className={styles.ringBox}>
                  <ScoreRing value={score.data.score} />
                  <span className="visually-hidden">
                    Score do perfil: {score.data.score} de 100
                  </span>
                </div>
                {positives.length > 0 ? (
                  <div>
                    <h3 className={styles.factorTitle}>O que ajuda</h3>
                    <ul className={styles.factors}>
                      {positives.map((f) => (
                        <li key={f.criterion}>{f.label}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {gaps.length > 0 ? (
                  <div>
                    <h3 className={styles.factorTitle}>O que melhorar</h3>
                    <ul className={styles.factors}>
                      {gaps.map((f) => (
                        <li key={f.criterion}>{f.recommendation ?? f.label}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <ScoreTrend history={score.data.history} />
                <ButtonLink variant="secondary" full href="/perfil">
                  Documentos e fatos
                </ButtonLink>
                <p className={styles.disclaimer}>{score.data.disclaimer}</p>
              </>
            )}
          </div>
          {profile.data && checklistDone < CHECKLIST.length ? (
            <Link href="/perfil#linkedin" className={styles.linkedinCard}>
              <span className={styles.linkedinTitle}>Ajustes no LinkedIn</span>
              <span className={styles.linkedinText}>
                {checklistDone === 0
                  ? `${CHECKLIST.length} mudanças rápidas que ajudam recrutadores a encontrar você.`
                  : `${checklistDone} de ${CHECKLIST.length} feitos. Faltam ${CHECKLIST.length - checklistDone}.`}
              </span>
              <span className={styles.shortcutAction}>Ver os ajustes →</span>
            </Link>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
