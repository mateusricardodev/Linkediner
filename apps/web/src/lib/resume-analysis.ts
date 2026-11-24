import type { ResumeAnalysisSection } from './types';

export const RESUME_SECTION_LABELS: Record<ResumeAnalysisSection['key'], string> = {
  ats: 'Leitura pelo ATS',
  summary: 'Resumo profissional',
  experience: 'Experiência',
  results: 'Resultados e impacto',
  skills: 'Competências',
  education: 'Formação e certificações',
  keywords: 'Otimização de palavras-chave',
};

/** Dica fixa de cada parte, para quem não sabe por que ela importa. */
export const RESUME_SECTION_HINTS: Partial<Record<ResumeAnalysisSection['key'], string>> = {
  ats: 'Os sistemas de recrutamento (ATS) leem o arquivo antes de uma pessoa: se ele não for lido, o resto não chega.',
  summary: 'O resumo é a primeira coisa lida: diga o cargo que você busca e o que você entrega.',
  experience:
    'Tópicos que começam com um verbo de ação e citam a tecnologia são lidos mais rápido.',
  results:
    'Resultados com números mostram o efeito do seu trabalho. Use só os que você pode comprovar.',
  keywords:
    'O ATS compara o currículo com a vaga por termos: eles precisam aparecer no resumo e nas experiências.',
};

const FAILURES: Record<string, string> = {
  document_missing: 'O arquivo foi apagado antes da análise. Envie de novo.',
  unreadable: 'Não conseguimos ler o arquivo. Salve de novo em PDF ou DOCX e envie.',
  no_text: 'O arquivo não tem texto que dê para ler. Ele pode ser uma imagem escaneada.',
  consent_revoked: 'A análise por IA foi desligada antes de terminar.',
  processing_error: 'A análise não terminou por um problema nosso. Tente de novo.',
};

export const resumeFailureMessage = (code: string | null) =>
  FAILURES[code ?? ''] ?? FAILURES.processing_error!;
