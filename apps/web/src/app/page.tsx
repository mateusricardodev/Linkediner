import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, ButtonLink, ScoreRing } from '../components/ui';
import styles from './landing.module.css';

export const metadata: Metadata = {
  title: 'LinkedIner · Currículo, vagas e candidaturas para quem é de tecnologia',
  description:
    'Envie seu currículo, veja o que tira pontos do seu perfil, gere uma versão pronta para os sistemas de recrutamento e encontre vagas que combinam com você.',
};

const SIGN_UP = '/criar-conta';

const trust = [
  'Não pedimos sua senha do LinkedIn',
  'Nada é inventado: o que não está no currículo vira sugestão',
  'Nenhuma candidatura sai sem a sua aprovação',
  'Seus documentos não treinam IA e podem ser excluídos quando quiser',
];

const features = [
  {
    id: 'analise',
    eyebrow: 'Análise do perfil',
    title: 'Veja o que está tirando pontos do seu currículo',
    text: 'Lemos o seu currículo e o PDF do LinkedIn, separamos experiências, competências e resultados, e calculamos um score de 0 a 100. Cada ponto tem um motivo, e cada lacuna vem com o que fazer.',
    bullets: [
      'Score explicável, com pontos fortes e lacunas',
      'Recomendações concretas, como incluir resultados medidos',
      'Idade, gênero e outros dados sensíveis não entram na conta',
    ],
    preview: 'recommendations',
  },
  {
    id: 'curriculo',
    eyebrow: 'Currículo para ATS',
    title: 'Um currículo que os filtros de recrutamento conseguem ler',
    text: 'Reescrevemos seus tópicos com verbos de ação e destaque para resultados, sempre a partir do que você já fez. Você revisa frase por frase e exporta em PDF ou DOCX, em uma coluna e com texto selecionável.',
    bullets: [
      'Cada frase aponta de onde veio no seu currículo',
      'O que não dá para comprovar fica marcado para você confirmar',
      'Exportação em PDF e DOCX no formato que os ATS leem melhor',
    ],
    preview: 'resume',
  },
  {
    id: 'vagas',
    eyebrow: 'Vagas compatíveis',
    title: 'Saiba o quanto cada vaga combina com você',
    text: 'Cole o texto ou o link de uma vaga de qualquer site e veja o que combina e o que falta. Nos planos pagos, também buscamos vagas novas para o seu objetivo direto no site das empresas.',
    bullets: [
      'Compatibilidade com os requisitos, explicada item por item',
      'Suas avaliações ajustam a ordem das próximas vagas',
      'Vagas recém-publicadas no site das empresas, nos planos pagos',
    ],
    preview: 'jobs',
  },
  {
    id: 'candidaturas',
    eyebrow: 'Candidaturas',
    title: 'Material por vaga e tudo organizado em um lugar',
    text: 'Para cada vaga, gere um currículo adaptado, uma carta de apresentação e respostas para o formulário. Depois acompanhe cada candidatura, do envio à resposta.',
    bullets: [
      'Currículo adaptado, carta e respostas, conferidos com os seus fatos',
      'Pergunta sem base no seu perfil fica para você responder',
      'Painel com o que precisa da sua atenção',
    ],
    preview: 'applications',
  },
] as const;

const steps = [
  {
    title: 'Envie seu currículo',
    text: 'PDF ou DOCX, e se quiser o PDF do seu perfil do LinkedIn.',
  },
  {
    title: 'Veja seu score',
    text: 'Pontos fortes, lacunas e o que fazer para melhorar cada uma.',
  },
  {
    title: 'Gere o currículo ATS',
    text: 'Revise as frases, confirme as sugestões e exporte.',
  },
  {
    title: 'Candidate-se e acompanhe',
    text: 'Compare com a vaga, gere o material e acompanhe o retorno.',
  },
];

const plans = [
  {
    name: 'Gratuito',
    note: 'Para conhecer',
    highlight: false,
    items: [
      '3 análises de currículo por mês',
      '1 currículo melhorado por mês',
      '10 vagas importadas por mês',
      '3 candidaturas assistidas por mês',
      'Exportação com marca d’água',
    ],
  },
  {
    name: 'Pro',
    note: 'Para quem está buscando agora',
    highlight: true,
    items: [
      '20 análises de currículo por mês',
      'Currículos melhorados sem limite prático',
      '30 currículos adaptados, cartas e respostas por mês',
      '300 vagas importadas por mês',
      '60 candidaturas assistidas por mês',
      'Vagas encontradas automaticamente para o seu objetivo',
      'Exportação sem marca d’água',
    ],
  },
  {
    name: 'Avançado',
    note: 'Para quem se candidata em volume',
    highlight: false,
    items: [
      '60 análises de currículo por mês',
      'Currículos melhorados sem limite prático',
      '100 currículos adaptados, cartas e respostas por mês',
      '1.000 vagas importadas por mês',
      '200 candidaturas assistidas por mês',
      'Vagas encontradas automaticamente para o seu objetivo',
      'Exportação sem marca d’água',
    ],
  },
];

const faq = [
  {
    q: 'Preciso entrar com a minha conta do LinkedIn?',
    a: 'Não. Você envia o seu currículo e, se quiser, o PDF que o próprio LinkedIn gera em “Mais” > “Salvar como PDF”. Não pedimos a sua senha nem acessamos a sua conta.',
  },
  {
    q: 'A IA pode inventar experiências no meu currículo?',
    a: 'Cada frase gerada precisa apontar para algo que está nos seus documentos. Números, empresas e tecnologias que não aparecem neles viram sugestões marcadas, e só entram no currículo se você confirmar.',
  },
  {
    q: 'O score indica a minha chance de ser contratado?',
    a: 'Não. Ele mede a qualidade e a preparação do perfil, como resultados medidos, datas e competências. A compatibilidade com uma vaga também não indica chance de contratação.',
  },
  {
    q: 'O LinkedIner se candidata às vagas por mim?',
    a: 'Nada é enviado sem a sua aprovação. Preparamos o material e o passo a passo, e você revisa e aprova cada candidatura.',
  },
  {
    q: 'O que acontece com os meus documentos?',
    a: 'Os arquivos ficam guardados por até 30 dias e não são usados para treinar modelos de IA. Você pode excluir os documentos ou a conta inteira quando quiser.',
  },
  {
    q: 'É de graça?',
    a: 'O plano gratuito permite analisar o currículo, gerar uma versão melhorada e acompanhar algumas candidaturas por mês, sem cartão de crédito.',
  },
];

function ScorePreview() {
  return (
    <div className={styles.card}>
      <div className={styles.scoreTop}>
        <ScoreRing value={82} size={104} />
        <div>
          <p className={styles.cardTitle}>Pronto para candidaturas</p>
          <p className={styles.cardNote}>Qualidade e preparação do perfil.</p>
        </div>
      </div>
      <hr className={styles.separator} />
      <p className={styles.label}>Pontos fortes</p>
      <ul className={styles.dots}>
        <li data-tone="success">6 experiências com descrição e data</li>
        <li data-tone="success">GitHub e portfólio no perfil</li>
      </ul>
      <p className={styles.label}>Lacunas</p>
      <ul className={styles.dots}>
        <li data-tone="warning">Sem resultados medidos nas 2 últimas experiências</li>
        <li data-tone="warning">Idiomas não informados</li>
      </ul>
    </div>
  );
}

/** As recomendações e os pontos vêm da rubrica do score (ADR 0013). */
function RecommendationsPreview() {
  const items = [
    {
      gain: 15,
      title: 'Inclua resultados medidos',
      text: 'Como "reduzi o tempo de build em 40%". Use só números reais.',
    },
    {
      gain: 5,
      title: 'Informe seus idiomas',
      text: 'E o nível de cada um. Muitas vagas pedem inglês.',
    },
    {
      gain: 5,
      title: 'Mostre um projeto',
      text: 'Um projeto que você construiu ou de que participou.',
    },
  ];
  return (
    <div className={`${styles.card} ${styles.flush}`}>
      <p className={styles.cardHeader}>O que fazer agora</p>
      {items.map((item) => (
        <div key={item.title} className={styles.recommendation}>
          <span className={styles.gain}>+{item.gain}</span>
          <div>
            <p className={styles.jobTitle}>{item.title}</p>
            <p className={styles.muted}>{item.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ResumePreview() {
  return (
    <div className={styles.card}>
      <p className={styles.label}>Experiência</p>
      <p className={styles.role}>
        <span>Desenvolvedora Frontend · Empresa Exemplo</span>
        <span className={styles.muted}>2021 — hoje</span>
      </p>
      <p className={styles.bullet}>
        • Liderei a migração do app web para React e TypeScript, com 40 componentes no design
        system.
      </p>
      <div className={styles.suggestion}>
        <Badge tone="warning">Sugestão para confirmar</Badge>
        <p className={styles.bullet}>• Reduzi o tempo de build em 40% com cache.</p>
        <p className={styles.cardNote}>
          Esse número não está no seu currículo. Só entra se você confirmar.
        </p>
      </div>
    </div>
  );
}

function JobsPreview() {
  const jobs = [
    { initial: 'A', title: 'Senior Frontend Engineer', meta: 'Empresa A · Remoto', score: 86 },
    { initial: 'B', title: 'Full Stack Engineer', meta: 'Empresa B · São Paulo', score: 78 },
    { initial: 'C', title: 'Backend Engineer, Node.js', meta: 'Empresa C · Híbrido', score: 71 },
  ];
  return (
    <div className={`${styles.card} ${styles.flush}`}>
      {jobs.map((job) => (
        <div key={job.title} className={styles.jobRow}>
          <span className={styles.avatar} aria-hidden>
            {job.initial}
          </span>
          <span className={styles.jobText}>
            <span className={styles.jobTitle}>{job.title}</span>
            <span className={styles.muted}>{job.meta}</span>
          </span>
          <span className={styles.match}>
            {job.score}%<span className={styles.muted}>compatível</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function ApplicationsPreview() {
  const rows = [
    { title: 'Senior Frontend Engineer', tone: 'warning', state: 'Aguardando aprovação' },
    { title: 'Product Engineer', tone: 'info', state: 'Enviada' },
    { title: 'Full Stack Engineer', tone: 'success', state: 'Entrevista' },
  ] as const;
  return (
    <div className={`${styles.card} ${styles.flush}`}>
      {rows.map((row) => (
        <div key={row.title} className={styles.jobRow}>
          <span className={styles.jobText}>
            <span className={styles.jobTitle}>{row.title}</span>
            <span className={styles.muted}>Currículo adaptado e carta prontos</span>
          </span>
          <Badge tone={row.tone}>{row.state}</Badge>
        </div>
      ))}
    </div>
  );
}

const previews = {
  recommendations: RecommendationsPreview,
  resume: ResumePreview,
  jobs: JobsPreview,
  applications: ApplicationsPreview,
};

/** Página pública de apresentação. Quem já tem conta segue por "Entrar". */
export default function Landing() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="LinkedIner, página inicial">
            <span className={styles.mark} aria-hidden>
              L
            </span>
            LinkedIner
          </Link>
          <nav className={styles.nav} aria-label="Seções">
            <a href="#como-funciona">Como funciona</a>
            <a href="#planos">Planos</a>
            <a href="#perguntas">Perguntas</a>
          </nav>
          <div className={styles.headerActions}>
            <Link href="/entrar" className={styles.signIn}>
              Entrar
            </Link>
            <ButtonLink href={SIGN_UP}>Começar grátis</ButtonLink>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>Para profissionais de tecnologia</p>
            <h1 className={styles.heroTitle}>
              Seu currículo pronto para os filtros de recrutamento, sem inventar nada.
            </h1>
            <p className={styles.lead}>
              Envie seu currículo e veja o que está tirando pontos do seu perfil. Gere uma versão
              para ATS a partir do que você já fez, compare com as vagas e acompanhe cada
              candidatura.
            </p>
            <div className={styles.ctas}>
              <ButtonLink href={SIGN_UP}>Analisar meu currículo grátis</ButtonLink>
              <ButtonLink href="#como-funciona" variant="secondary">
                Ver como funciona
              </ButtonLink>
            </div>
            <p className={styles.small}>Plano gratuito, sem cartão de crédito.</p>
          </div>
          <div className={styles.heroPreview}>
            <ScorePreview />
            <p className={styles.caption}>Exemplo com dados fictícios.</p>
          </div>
        </section>

        <ul className={styles.trust}>
          {trust.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        {features.map((feature, index) => {
          const Preview = previews[feature.preview];
          return (
            <section
              key={feature.id}
              id={feature.id}
              className={`${styles.feature} ${index % 2 ? styles.reverse : ''}`}
            >
              <div className={styles.featureText}>
                <p className={styles.eyebrow}>{feature.eyebrow}</p>
                <h2 className={styles.sectionTitle}>{feature.title}</h2>
                <p className={styles.lead}>{feature.text}</p>
                <ul className={styles.checks}>
                  {feature.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.featurePreview}>
                <Preview />
              </div>
            </section>
          );
        })}

        <section id="como-funciona" className={styles.band}>
          <div className={styles.bandInner}>
            <h2 className={styles.sectionTitle}>Do currículo à candidatura em quatro passos</h2>
            <ol className={styles.steps}>
              {steps.map((step, index) => (
                <li key={step.title} className={styles.step}>
                  <span className={styles.stepNumber}>{index + 1}</span>
                  <p className={styles.stepTitle}>{step.title}</p>
                  <p className={styles.muted}>{step.text}</p>
                </li>
              ))}
            </ol>
            <div>
              <ButtonLink href={SIGN_UP}>Começar grátis</ButtonLink>
            </div>
          </div>
        </section>

        <section id="planos" className={styles.section}>
          <h2 className={styles.sectionTitle}>Planos</h2>
          <p className={styles.lead}>Comece no gratuito e mude quando precisar. Preços em breve.</p>
          <div className={styles.plans}>
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`${styles.plan} ${plan.highlight ? styles.planHighlight : ''}`}
              >
                <div className={styles.planHead}>
                  <h3 className={styles.planName}>{plan.name}</h3>
                  {plan.highlight ? <Badge tone="info">Recomendado</Badge> : null}
                </div>
                <p className={styles.muted}>{plan.note}</p>
                <ul className={styles.checks}>
                  {plan.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section id="perguntas" className={styles.section}>
          <h2 className={styles.sectionTitle}>Perguntas frequentes</h2>
          <div className={styles.faq}>
            {faq.map((item) => (
              <details key={item.q} className={styles.faqItem}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.closing}>
          <h2 className={styles.sectionTitle}>Veja o que está tirando pontos do seu currículo</h2>
          <p className={styles.lead}>Leva poucos minutos e não precisa de cartão de crédito.</p>
          <ButtonLink href={SIGN_UP}>Analisar meu currículo grátis</ButtonLink>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} LinkedIner</span>
        <nav className={styles.footerNav} aria-label="Rodapé">
          <Link href="/entrar">Entrar</Link>
          <Link href={SIGN_UP}>Criar conta</Link>
        </nav>
      </footer>
    </div>
  );
}
