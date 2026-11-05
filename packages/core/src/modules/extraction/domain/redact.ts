export const REDACTED_MARK = '[REMOVIDO]';

const PATTERNS: RegExp[] = [
  // E-mail
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu,
  // CPF
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
  // Telefone: exige DDI, DDD ou separador, para não apagar anos e outros números do currículo.
  /(?:\+\d{1,3}[\s.-]?)(?:\(?\d{2,3}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}\b/g,
  /\(\d{2,3}\)[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g,
  /\b\d{2}[\s.-]\d{4,5}[\s.-]\d{4}\b/g,
];

/** Rótulos cujo valor é dado sensível: o restante da linha é removido. */
const SENSITIVE_LABELS = [
  'data de nascimento',
  'nascimento',
  'nascid[oa] em',
  'date of birth',
  'dob',
  'idade',
  'age',
  'sexo',
  'g[eê]nero',
  'gender',
  'estado civil',
  'marital status',
  'ra[cç]a',
  'cor',
  'etnia',
  'race',
  'ethnicity',
  'religi[aã]o',
  'religion',
  'defici[eê]ncia',
  'pcd',
  'disability',
  'orienta[cç][aã]o sexual',
  'cpf',
  'rg',
  'endere[cç]o',
  'address',
];
const LABEL_LINE = new RegExp(
  `(^|\\n)([ \\t]*(?:${SENSITIVE_LABELS.join('|')})[ \\t]*:)[^\\n]*`,
  'giu',
);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Remove dados sensíveis antes de enviar o texto à IA (docs/arquitetura/05-ia-e-documentos.md):
 * contato, documentos, nome do titular e atributos como idade, gênero ou raça.
 * Roda antes da chamada: o que sai daqui é o que o provedor recebe e o que a validação usa.
 */
export function redactSensitiveData(text: string, ownerName?: string | null): string {
  let result = text;
  for (const pattern of PATTERNS) result = result.replace(pattern, REDACTED_MARK);
  result = result.replace(LABEL_LINE, `$1$2 ${REDACTED_MARK}`);
  const name = ownerName?.trim();
  if (name && name.includes(' ')) {
    const flexibleSpaces = name.split(/\s+/).map(escapeRegExp).join('\\s+');
    result = result.replace(new RegExp(flexibleSpaces, 'giu'), REDACTED_MARK);
  }
  return result;
}
