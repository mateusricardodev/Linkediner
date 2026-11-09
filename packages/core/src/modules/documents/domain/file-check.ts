/**
 * Conferência do arquivo do currículo: como um sistema de recrutamento (ATS) leria o PDF ou o DOCX
 * que a pessoa já usa. Sem IA e sem guardar o texto: só os sinais medidos e o resultado (ADR 0028).
 */
export const FILE_CHECK_VERSION = 'v1';

/** O que o leitor do arquivo mede. Nada aqui é conteúdo do documento. */
export interface FileSignals {
  format: 'pdf' | 'docx';
  pageCount: number | null;
  /** Caracteres visíveis, sem espaços. */
  visibleChars: number;
  /** Texto que não aparece: em geral, a camada de OCR de um documento escaneado. */
  invisibleChars: number;
  /** Páginas com pouco texto e quase toda coberta por imagem. */
  imageOnlyPages: number;
  imageCount: number;
  /** Fração das linhas longas que começam no meio da página: indício de colunas lado a lado. */
  sideBySideRatio: number;
  tableCount: number;
  hasEmail: boolean;
  hasPhone: boolean;
  hasLinkedin: boolean;
  /** Caracteres de fontes de ícones ou trocados: viram lixo no ATS. */
  unreadableSymbols: number;
  sections: { experience: boolean; education: boolean; skills: boolean };
}

export type FileCheckId =
  'readable_text' | 'single_column' | 'contact' | 'images' | 'symbols' | 'sections' | 'length';

export interface FileCheck {
  id: FileCheckId;
  ok: boolean;
  label: string;
  /** Presente quando falha: o que fazer, em uma frase. */
  recommendation: string | null;
}

export interface FileCheckReport {
  version: string;
  passed: number;
  total: number;
  checks: FileCheck[];
}

const MIN_READABLE_CHARS = 300;
/** Acima disso, uma parte relevante das linhas está em outra coluna. */
const SIDE_BY_SIDE_LIMIT = 0.2;
const MAX_PAGES = 2;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function evaluateFileCheck(signals: FileSignals): FileCheckReport {
  const scanned =
    signals.visibleChars < MIN_READABLE_CHARS ||
    signals.imageOnlyPages > 0 ||
    signals.invisibleChars > signals.visibleChars;
  const columns = signals.sideBySideRatio > SIDE_BY_SIDE_LIMIT || signals.tableCount > 0;
  const missingSections = [
    signals.sections.experience ? null : 'Experiência',
    signals.sections.education ? null : 'Formação',
    signals.sections.skills ? null : 'Competências',
  ].filter((name): name is string => name !== null);

  const check = (id: FileCheckId, ok: boolean, label: string, recommendation: string) => ({
    id,
    ok,
    label,
    recommendation: ok ? null : recommendation,
  });

  const checks: FileCheck[] = [
    check(
      'readable_text',
      !scanned,
      'O texto pode ser lido, não é imagem',
      signals.imageOnlyPages > 0
        ? `${plural(signals.imageOnlyPages, 'página parece', 'páginas parecem')} uma imagem. Exporte o currículo direto do editor (Word, Google Docs) como PDF, em vez de escanear ou salvar como imagem.`
        : 'Quase não há texto que um sistema consiga ler. Exporte o currículo direto do editor como PDF, em vez de escanear ou salvar como imagem.',
    ),
    check(
      'single_column',
      !columns,
      'Uma coluna, sem tabelas',
      signals.tableCount > 0
        ? 'O arquivo usa tabelas. Muitos ATS leem as células fora de ordem: troque por texto corrido, uma seção embaixo da outra.'
        : 'O texto parece estar em colunas lado a lado. Muitos ATS misturam as linhas das colunas: use uma coluna só.',
    ),
    check(
      'contact',
      signals.hasEmail && (signals.hasPhone || signals.hasLinkedin),
      'Contato encontrado no texto',
      signals.hasEmail
        ? 'Não encontramos telefone nem link do LinkedIn como texto. Escreva-os no topo, e não em ícones ou imagens.'
        : 'Não encontramos o e-mail como texto. Escreva e-mail e telefone no topo, e não em ícones ou imagens.',
    ),
    check(
      'images',
      signals.imageCount === 0,
      'Nenhuma informação presa em imagem',
      `O arquivo tem ${plural(signals.imageCount, 'imagem', 'imagens')}. O ATS não lê o que está nelas: se alguma traz informação, como ícones de contato, gráficos de habilidades ou um nome em logotipo, escreva isso como texto.`,
    ),
    check(
      'symbols',
      signals.unreadableSymbols === 0,
      'Sem símbolos que o ATS não lê',
      'Há símbolos de fontes de ícones, que viram caracteres estranhos no ATS. Troque por palavras, como "E-mail:" e "Telefone:".',
    ),
    check(
      'sections',
      missingSections.length === 0,
      'Seções com nomes que o ATS reconhece',
      `Não encontramos ${missingSections.join(', ')} com esse nome. Use títulos comuns: o ATS usa esses nomes para separar o currículo.`,
    ),
  ];
  if (signals.pageCount !== null) {
    checks.push(
      check(
        'length',
        signals.pageCount <= MAX_PAGES,
        `Até ${MAX_PAGES} páginas`,
        `O arquivo tem ${signals.pageCount} páginas. Para tecnologia, 1 ou 2 bastam: corte o que é antigo ou não tem relação com o cargo.`,
      ),
    );
  }

  return {
    version: FILE_CHECK_VERSION,
    passed: checks.filter((c) => c.ok).length,
    total: checks.length,
    checks,
  };
}

/** Sinais tirados do texto, iguais para PDF e DOCX. O texto não sai daqui. */
export function textSignals(
  text: string,
): Pick<FileSignals, 'hasEmail' | 'hasPhone' | 'hasLinkedin' | 'unreadableSymbols' | 'sections'> {
  const normalized = text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  const heading = (pattern: RegExp) => pattern.test(normalized);
  return {
    hasEmail: /[\w.+-]+@[\w-]+\.[\w.-]+/.test(text),
    hasPhone:
      /(\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b|\+\d{1,3}[\s.-]?\d[\d\s.-]{7,}\d/.test(
        text,
      ),
    hasLinkedin: /linkedin\.com\/in\//i.test(text),
    // Área de uso privado (fontes de ícones) e o caractere de substituição.
    unreadableSymbols: (text.match(/[-�]/gu) ?? []).length,
    sections: {
      experience: heading(
        /\b(experiencias?( profissional| profissionais)?|historico profissional|experience|work history|employment)\b/,
      ),
      education: heading(
        /\b(formacao( academica)?|educacao|escolaridade|education|academic background)\b/,
      ),
      skills: heading(
        /\b(competencias|habilidades|conhecimentos|tecnologias|skills|tech stack|stack)\b/,
      ),
    },
  };
}
