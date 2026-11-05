import { describe, expect, it } from 'vitest';
import {
  assertCanActivateGoal,
  normalizeLink,
  validateCareerGoal,
  validateLinks,
  validateProfilePatch,
  type CareerGoalInput,
} from './profile';

const goal = (o: Partial<CareerGoalInput> = {}): CareerGoalInput => ({
  title: 'Frontend sênior remoto',
  seniority: 'senior',
  targetRoles: ['Frontend Engineer'],
  locations: ['Brasil'],
  remoteOnly: true,
  salaryMin: null,
  currency: null,
  salaryPeriod: null,
  isActive: true,
  ...o,
});

describe('normalizeLink', () => {
  it('normaliza para https, sem barra final e host em minúsculas', () => {
    expect(normalizeLink('github', 'http://GitHub.com/mateus/').url).toBe(
      'https://github.com/mateus',
    );
    expect(normalizeLink('portfolio', 'mateus.dev').url).toBe('https://mateus.dev');
  });

  it('aceita perfil do LinkedIn e rejeita outras páginas do LinkedIn', () => {
    expect(normalizeLink('linkedin', 'https://www.linkedin.com/in/mateus-ricardo').url).toBe(
      'https://www.linkedin.com/in/mateus-ricardo',
    );
    expect(() => normalizeLink('linkedin', 'https://linkedin.com/jobs/view/123')).toThrow(
      /linkedin.com\/in/,
    );
    expect(() => normalizeLink('linkedin', 'https://linkedin.com.golpe.example/in/x')).toThrow();
  });

  it('exige github.com para link do GitHub', () => {
    expect(() => normalizeLink('github', 'https://gitlab.com/mateus')).toThrow(/GitHub/);
  });

  it('rejeita endereços locais, IPs, credenciais e protocolos estranhos', () => {
    for (const bad of [
      'http://localhost:3000',
      'https://192.168.0.1',
      'https://user:pass@site.dev',
      'javascript:alert(1)',
      'ftp://site.dev',
    ]) {
      expect(() => normalizeLink('portfolio', bad)).toThrow();
    }
  });
});

describe('validateLinks', () => {
  it('rejeita repetidos e mais de um GitHub', () => {
    expect(() =>
      validateLinks([
        { kind: 'portfolio', url: 'mateus.dev' },
        { kind: 'other', url: 'https://mateus.dev/' },
      ]),
    ).toThrow(/repetidos/);
    expect(() =>
      validateLinks([
        { kind: 'github', url: 'github.com/a' },
        { kind: 'github', url: 'github.com/b' },
      ]),
    ).toThrow(/apenas um/);
  });
});

describe('validateProfilePatch', () => {
  it('apara textos e transforma vazio em nulo', () => {
    expect(validateProfilePatch({ headline: '  Engenheiro Frontend  ', summary: '   ' })).toEqual({
      headline: 'Engenheiro Frontend',
      summary: null,
    });
  });

  it('valida anos de experiência', () => {
    expect(() => validateProfilePatch({ yearsExperience: -1 })).toThrow();
    expect(() => validateProfilePatch({ yearsExperience: 2.5 })).toThrow();
    expect(validateProfilePatch({ yearsExperience: 6 })).toEqual({ yearsExperience: 6 });
  });
});

describe('validateCareerGoal', () => {
  it('limpa listas (espaços, vazios, repetidos)', () => {
    const g = validateCareerGoal(
      goal({ targetRoles: [' Frontend ', 'Frontend', ''], locations: ['Brasil', ' Global '] }),
    );
    expect(g.targetRoles).toEqual(['Frontend']);
    expect(g.locations).toEqual(['Brasil', 'Global']);
  });

  it('exige valor, moeda e período juntos', () => {
    expect(() => validateCareerGoal(goal({ salaryMin: 15000 }))).toThrow(/valor, moeda e período/);
    expect(
      validateCareerGoal(goal({ salaryMin: 15000, currency: 'BRL', salaryPeriod: 'month' }))
        .salaryMin,
    ).toBe(15000);
  });

  it('limita objetivos ativos', () => {
    expect(() => assertCanActivateGoal(4)).not.toThrow();
    expect(() => assertCanActivateGoal(5)).toThrow(/até 5/);
  });
});
