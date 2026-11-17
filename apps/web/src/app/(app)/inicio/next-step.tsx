import { ButtonLink } from '../../../components/ui';
import { canAnalyze } from '../../../lib/documents';
import type { Dashboard, DocumentRecord, ProfileFact, Recommendations } from '../../../lib/types';
import styles from './inicio.module.css';

interface Step {
  title: string;
  text: string;
  action?: { label: string; href: string };
}

interface State {
  documents: DocumentRecord[];
  facts: ProfileFact[];
  dashboard: Dashboard;
  recommendations: Recommendations;
  aiAllowed: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Uma única ação, a mais útil agora: a ordem segue o caminho de quem está começando. */
export function pickStep({
  documents,
  facts,
  dashboard,
  recommendations,
  aiAllowed,
}: State): Step | null {
  const sent = documents.filter((d) => d.status !== 'pending_upload');
  const toReview = facts.filter((f) => f.verification === 'extracted').length;
  const waiting = dashboard.needsAttention;

  if (sent.length === 0) {
    return {
      title: 'Envie o seu currículo',
      text: 'É a base de tudo: com ele calculamos o score do perfil e comparamos você com as vagas.',
      action: { label: 'Enviar currículo', href: '/perfil#documentos' },
    };
  }
  if (!aiAllowed && sent.some(canAnalyze)) {
    return {
      title: 'Autorize a análise por IA',
      text: 'Seus arquivos já estão guardados, mas só são lidos com a sua autorização.',
      action: { label: 'Autorizar análise', href: '/perfil#documentos' },
    };
  }
  if (sent.some((d) => d.status === 'processing')) {
    return {
      title: 'Estamos analisando o seu currículo',
      text: 'Pode levar alguns minutos. Você pode sair desta página: o resultado fica no seu perfil.',
    };
  }
  if (sent.some((d) => d.status === 'failed')) {
    return {
      title: 'Um documento não pôde ser analisado',
      text: 'Veja o motivo e tente de novo, ou envie outra versão do arquivo.',
      action: { label: 'Ver documento', href: '/perfil#documentos' },
    };
  }
  if (toReview > 0) {
    return {
      title: `Revise ${plural(toReview, 'item encontrado', 'itens encontrados')}`,
      text: 'Confira se está certo e corrija o que faltar. Você decide o que fica no seu perfil.',
      action: { label: 'Revisar agora', href: '/perfil#fatos' },
    };
  }
  if (waiting.length > 0) {
    const first = waiting[0]!;
    return {
      title: `${plural(waiting.length, 'candidatura espera', 'candidaturas esperam')} por você`,
      text:
        waiting.length === 1 ? (first.job.title ?? 'Vaga sem título') : 'Veja qual é a próxima.',
      action: {
        label: 'Continuar',
        href: waiting.length === 1 ? `/candidaturas/${first.id}` : '/candidaturas',
      },
    };
  }
  if (recommendations.items.length === 0) {
    return {
      title: 'Traga uma vaga para comparar',
      text: 'Cole o texto de uma vaga e veja, requisito por requisito, o que o seu perfil comprova.',
      action: { label: 'Importar vaga', href: '/vagas' },
    };
  }
  return null;
}

export function NextStep({ step }: { step: Step }) {
  return (
    <section aria-labelledby="proximo-passo" className={styles.nextStep}>
      <div className={styles.nextStepText}>
        <span className={styles.nextStepLabel}>Próximo passo</span>
        <h2 id="proximo-passo" className={styles.nextStepTitle}>
          {step.title}
        </h2>
        <p className={styles.nextStepBody}>{step.text}</p>
      </div>
      {step.action ? <ButtonLink href={step.action.href}>{step.action.label}</ButtonLink> : null}
    </section>
  );
}
