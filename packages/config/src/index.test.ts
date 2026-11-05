import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './index';

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };

describe('loadConfig', () => {
  it('aplica valores padrão em desenvolvimento', () => {
    const config = loadConfig(base);
    expect(config.NODE_ENV).toBe('development');
    expect(config.API_PORT).toBe(4000);
    expect(config.AI_PROVIDER).toBe('fake');
  });

  it('falha sem DATABASE_URL e não expõe valores', () => {
    expect(() => loadConfig({ GEMINI_API_KEY: 'segredo-super-secreto' })).toThrow(ConfigError);
    try {
      loadConfig({ GEMINI_API_KEY: 'segredo-super-secreto' });
    } catch (e) {
      expect(String(e)).toContain('DATABASE_URL');
      expect(String(e)).not.toContain('segredo-super-secreto');
    }
  });

  it('exige plano pago de IA em produção (ADR 0004)', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'k',
      LOG_PSEUDONYM_SECRET: 'x'.repeat(32),
    };
    expect(() => loadConfig({ ...prod, AI_TIER: 'free' })).toThrow(/AI_TIER/);
    expect(loadConfig({ ...prod, AI_TIER: 'paid' }).AI_TIER).toBe('paid');
  });

  it('proíbe o provedor fake em produção', () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', LOG_PSEUDONYM_SECRET: 'x'.repeat(32) }),
    ).toThrow(/AI_PROVIDER/);
  });

  it('exige segredo de pseudonimização em staging', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'staging' })).toThrow(/LOG_PSEUDONYM_SECRET/);
  });
});
