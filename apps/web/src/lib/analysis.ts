import type { BadgeTone } from '../components/ui';

/** O que as análises (LinkedIn e currículo) têm em comum, para a mesma tela servir às duas. */
export interface AnalysisAction {
  id: string;
  text: string;
}

export interface AnalysisSectionBase {
  key: string;
  score: number;
  analysis: string;
  breakdown: { criterion: string; points: number; max: number }[];
  tip: string | null;
  actions: AnalysisAction[];
}

export interface AnalysisBase<S extends AnalysisSectionBase = AnalysisSectionBase> {
  id: string;
  status: 'processing' | 'ready' | 'failed';
  failureCode: string | null;
  targetRole: string | null;
  documentId: string | null;
  doneActions: string[];
  createdAt: string;
  result: {
    score: number;
    strengths: string[];
    improvements: string[];
    missingKeywords: string[];
    competitivePosition: string;
    sections: S[];
  } | null;
}

export function scoreTone(score: number): BadgeTone {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}

export function scoreLabel(score: number): string {
  if (score >= 90) return 'Excelente, nível de topo';
  if (score >= 80) return 'Muito bom';
  if (score >= 60) return 'Bom, com ajustes que fazem diferença';
  if (score >= 40) return 'Precisa de atenção';
  return 'Precisa de bastante trabalho';
}

/** Ações por seção, com o que já foi feito: alimenta o painel de próximos passos. */
export function actionProgress(analysis: AnalysisBase, labels: Record<string, string>) {
  const done = new Set(analysis.doneActions);
  const sections = (analysis.result?.sections ?? [])
    .filter((section) => section.actions.length > 0)
    .map((section) => ({
      key: section.key,
      label: labels[section.key] ?? section.key,
      actions: section.actions.map((action) => ({ ...action, done: done.has(action.id) })),
    }));
  const total = sections.reduce((n, s) => n + s.actions.length, 0);
  const completed = sections.reduce((n, s) => n + s.actions.filter((a) => a.done).length, 0);
  return { sections, total, completed };
}
