import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './index';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  AUTH_SECRET: 'a'.repeat(32),
  DATA_MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
};

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

  it('exige ID e segredo de OAuth juntos', () => {
    expect(() => loadConfig({ ...base, GITHUB_CLIENT_ID: 'id' })).toThrow(/GITHUB_CLIENT_SECRET/);
    expect(
      loadConfig({ ...base, GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 's' }).GITHUB_CLIENT_ID,
    ).toBe('id');
  });

  it('exige AUTH_SECRET com pelo menos 32 caracteres', () => {
    expect(() => loadConfig({ ...base, AUTH_SECRET: 'curto' })).toThrow(/AUTH_SECRET/);
  });

  it('exige chave mestra de 32 bytes, sem mostrar o valor', () => {
    const { DATA_MASTER_KEY: _omitida, ...semChave } = base;
    expect(() => loadConfig(semChave)).toThrow(/DATA_MASTER_KEY/);
    const curta = Buffer.alloc(16, 7).toString('base64');
    expect(() => loadConfig({ ...base, DATA_MASTER_KEY: curta })).toThrow(/DATA_MASTER_KEY/);
    try {
      loadConfig({ ...base, DATA_MASTER_KEY: curta });
    } catch (e) {
      expect(String(e)).not.toContain(curta);
    }
  });

  it('recusa guardar as chaves no bucket de documentos, que expira objetos', () => {
    expect(() =>
      loadConfig({ ...base, STORAGE_BUCKET: 'mesmo', STORAGE_KEYS_BUCKET: 'mesmo' }),
    ).toThrow(/STORAGE_KEYS_BUCKET/);
  });

  it('exige plano pago de IA em produção (ADR 0004)', () => {
    const prod = {
      API_PUBLIC_URL: 'https://api.linkediner.dev',
      ...base,
      NODE_ENV: 'production',
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'k',
      AI_MODEL_EXTRACT: 'modelo-de-teste',
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
