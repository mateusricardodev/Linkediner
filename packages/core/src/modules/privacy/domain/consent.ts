/** Finalidades de consentimento (docs/arquitetura/07-seguranca-e-privacidade.md). */
export const CONSENT_PURPOSES = [
  'terms',
  'privacy',
  'ai_processing',
  'auto_apply',
  'marketing',
  'model_training',
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/** Sem estes, o usuário não usa o produto. Os demais são opcionais e separados. */
export const REQUIRED_PURPOSES: readonly ConsentPurpose[] = ['terms', 'privacy'];

/**
 * Versão vigente do texto de cada finalidade. Ao publicar um novo texto de termos ou privacidade,
 * troque a versão: quem aceitou a anterior precisa aceitar de novo.
 */
export const CURRENT_CONSENT_VERSIONS: Record<ConsentPurpose, string> = {
  // v2: primeiro texto publicado em /termos e /privacidade (apps/web/src/lib/legal.ts).
  terms: '2026-11-v2',
  privacy: '2026-11-v2',
  ai_processing: '2026-11-v1',
  auto_apply: '2026-11-v1',
  marketing: '2026-11-v1',
  model_training: '2026-11-v1',
};

export interface ConsentRecord {
  purpose: ConsentPurpose;
  version: string;
  granted: boolean;
  createdAt: Date;
}

export interface ConsentStatus {
  /** Última decisão válida (na versão vigente) por finalidade. */
  granted: Record<ConsentPurpose, boolean>;
  /** Consentimentos obrigatórios que faltam aceitar na versão vigente. */
  missingRequired: ConsentPurpose[];
}

/**
 * Calcula o estado atual a partir do histórico. A decisão mais recente prevalece, e um aceite
 * em versão antiga não vale para a versão vigente. `model_training` só é verdadeiro com aceite explícito.
 */
export function computeConsentStatus(history: readonly ConsentRecord[]): ConsentStatus {
  const latest = new Map<ConsentPurpose, ConsentRecord>();
  for (const record of history) {
    const current = latest.get(record.purpose);
    if (!current || record.createdAt > current.createdAt) latest.set(record.purpose, record);
  }
  const granted = Object.fromEntries(
    CONSENT_PURPOSES.map((p) => {
      const r = latest.get(p);
      return [p, Boolean(r && r.granted && r.version === CURRENT_CONSENT_VERSIONS[p])];
    }),
  ) as Record<ConsentPurpose, boolean>;
  return { granted, missingRequired: REQUIRED_PURPOSES.filter((p) => !granted[p]) };
}
