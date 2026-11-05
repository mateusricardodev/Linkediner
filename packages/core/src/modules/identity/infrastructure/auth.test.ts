import { describe, expect, it } from 'vitest';
import { socialProvidersFrom, stripProviderTokens } from './auth';

describe('stripProviderTokens', () => {
  it('remove todos os tokens do provedor e mantém a identidade', () => {
    const out = stripProviderTokens({
      providerId: 'github',
      accountId: '123',
      accessToken: 'gho_x',
      refreshToken: 'r',
      idToken: 'jwt',
      accessTokenExpiresAt: new Date(),
      refreshTokenExpiresAt: new Date(),
    });
    expect(out).toMatchObject({ providerId: 'github', accountId: '123' });
    expect(out.accessToken).toBeNull();
    expect(out.refreshToken).toBeNull();
    expect(out.idToken).toBeNull();
  });
});

describe('socialProvidersFrom', () => {
  it('ativa só os provedores com ID e segredo', () => {
    const p = socialProvidersFrom({
      NODE_ENV: 'test',
      AUTH_SECRET: 'x'.repeat(32),
      API_PUBLIC_URL: 'http://localhost:4000',
      WEB_ORIGIN: 'http://localhost:3000',
      GITHUB_CLIENT_ID: 'id',
      GITHUB_CLIENT_SECRET: 'secret',
    });
    expect(Object.keys(p)).toEqual(['github']);
  });
});
