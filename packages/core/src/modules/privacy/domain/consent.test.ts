import { describe, expect, it } from 'vitest';
import { computeConsentStatus, CURRENT_CONSENT_VERSIONS, type ConsentRecord } from './consent';

const at = (s: string) => new Date(`2026-11-05T${s}Z`);
const rec = (
  p: ConsentRecord['purpose'],
  granted: boolean,
  time: string,
  version = CURRENT_CONSENT_VERSIONS[p],
): ConsentRecord => ({
  purpose: p,
  granted,
  version,
  createdAt: at(time),
});

describe('computeConsentStatus', () => {
  it('sem histórico: nada concedido e termos/privacidade pendentes', () => {
    const s = computeConsentStatus([]);
    expect(s.missingRequired).toEqual(['terms', 'privacy']);
    expect(s.granted.model_training).toBe(false);
  });

  it('a decisão mais recente prevalece (revogação)', () => {
    const s = computeConsentStatus([
      rec('ai_processing', true, '10:00:00'),
      rec('ai_processing', false, '11:00:00'),
    ]);
    expect(s.granted.ai_processing).toBe(false);
  });

  it('aceite em versão antiga não vale para a versão vigente', () => {
    const s = computeConsentStatus([
      rec('terms', true, '10:00:00', '2025-01-v0'),
      rec('privacy', true, '10:00:00'),
    ]);
    expect(s.missingRequired).toEqual(['terms']);
  });

  it('com termos e privacidade aceitos, nada obrigatório falta', () => {
    const s = computeConsentStatus([
      rec('terms', true, '10:00:00'),
      rec('privacy', true, '10:00:01'),
    ]);
    expect(s.missingRequired).toEqual([]);
    expect(s.granted.marketing).toBe(false);
  });
});
