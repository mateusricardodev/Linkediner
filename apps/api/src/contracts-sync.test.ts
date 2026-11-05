import { describe, expect, it } from 'vitest';
import { ConsentPurpose } from '@linkediner/contracts';
import { CONSENT_PURPOSES } from '@linkediner/core/privacy';

describe('contratos sincronizados com o domínio', () => {
  it('finalidades de consentimento da API são as mesmas do domínio', () => {
    expect([...ConsentPurpose.options]).toEqual([...CONSENT_PURPOSES]);
  });
});
