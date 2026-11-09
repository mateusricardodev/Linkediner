import { describe, expect, it } from 'vitest';
import { analyzeAts, MAX_BULLET_LENGTH, type AtsInput } from './ats';
import type { ResumeContent, ResumeItem } from './resume';

// Currículo fictício, sem dados de ninguém.
let next = 0;
const item = (text: string, status: ResumeItem['status'] = 'grounded'): ResumeItem => ({
  id: `item-${++next}`,
  text,
  factIds: ['f'],
  status,
  reason: null,
});

const complete = (): ResumeContent => ({
  summary: [item('Desenvolvedora backend com foco em sistemas de pagamento.')],
  experiences: [
    {
      factId: 'e1',
      company: 'Empresa Exemplo',
      title: 'Desenvolvedora Backend',
      startDate: '2021-03',
      endDate: null,
      location: null,
      bullets: [
        item('Reduzi o tempo de resposta da API em 40% com cache.'),
        item('Liderei a migração de 12 serviços para Kubernetes.'),
      ],
    },
  ],
  skills: ['Go', 'PostgreSQL', 'Kubernetes', 'Docker', 'Kafka', 'AWS'],
  education: [{ degree: 'Bacharelado', field: 'Computação' }],
  certifications: [],
  projects: [],
  languages: [{ name: 'Inglês', level: 'Avançado' }],
});

const input = (o: Partial<AtsInput> = {}): AtsInput => ({
  content: complete(),
  headline: 'Desenvolvedora Backend',
  linkKinds: ['linkedin', 'github'],
  jobRequirements: [],
  ...o,
});

const failed = (o: Partial<AtsInput> = {}) =>
  analyzeAts(input(o))
    .checks.filter((c) => !c.ok)
    .map((c) => c.id);

describe('conferência ATS', () => {
  it('currículo completo passa em tudo e não tem dica', () => {
    const report = analyzeAts(input());
    expect(report.passed).toBe(report.total);
    expect(report.tips).toEqual([]);
    expect(report.checks.every((c) => c.recommendation === null)).toBe(true);
  });

  it('cada lacuna do documento vira uma recomendação', () => {
    const content = complete();
    content.experiences[0]!.startDate = null;
    content.skills = ['Go'];
    content.languages = [];
    expect(failed({ content, headline: null, linkKinds: [] })).toEqual([
      'headline',
      'linkedin',
      'experience_dates',
      'skills',
      'languages',
    ]);
    const dates = analyzeAts(input({ content })).checks.find((c) => c.id === 'experience_dates');
    expect(dates?.recommendation).toMatch(/Desenvolvedora Backend/);
  });

  it('frase removida não conta: nem para passar, nem para receber dica', () => {
    const content = complete();
    content.experiences[0]!.bullets[1]!.status = 'removed';
    content.experiences[0]!.bullets[1]!.text = 'eu fiz várias coisas 🚀';
    expect(failed({ content })).toEqual(['experience_bullets', 'measurable_results']);
    expect(analyzeAts(input({ content })).tips).toEqual([]);
  });

  it('dicas pontuais apontam a frase exata', () => {
    const content = complete();
    const [first, second] = content.experiences[0]!.bullets;
    first!.text = 'Responsável pela manutenção do sistema de pagamentos.';
    second!.text = `Criei ✓ ${'um serviço novo com o meu time '.repeat(8)}`;
    const tips = analyzeAts(input({ content })).tips;
    expect(tips.filter((t) => t.itemId === first!.id).map((t) => t.code)).toEqual([
      'weak_start',
      'no_metric',
    ]);
    expect(tips.filter((t) => t.itemId === second!.id).map((t) => t.code)).toEqual([
      'too_long',
      'first_person',
      'symbols',
    ]);
    expect(second!.text.length).toBeGreaterThan(MAX_BULLET_LENGTH);
  });

  it('aceita verbos de ação em português e em inglês, e o resumo não precisa de verbo', () => {
    const content = complete();
    content.experiences[0]!.bullets = [
      item('Implementei filas com 3 consumidores.'),
      item('Led a team of 4 engineers.'),
      item('Improved build time by 30%.'),
      item('Construí um painel para 200 lojas.'),
      item('Desenvolvimento de 5 APIs internas.'),
      // Participar não é fraco: diz o tamanho real da participação.
      item('Participei da migração de 8 serviços para Docker.'),
      // Pretéritos irregulares também são verbos de ação.
      item('Mantive 4 APIs de pagamento.'),
      item('Fiz a revisão de 30 pull requests por semana.'),
      item('Propus um novo fluxo de deploy com 2 etapas.'),
    ];
    const tips = analyzeAts(input({ content })).tips;
    expect(tips.map((t) => [t.code, t.itemId])).toEqual([
      ['action_verb', content.experiences[0]!.bullets[4]!.id],
    ]);
  });

  it('aponta os termos técnicos das vagas salvas que faltam, do mais pedido para o menos', () => {
    const report = analyzeAts(
      input({
        jobRequirements: [
          ['Experiência com GraphQL', 'Go ou Python', 'AWS'],
          ['GraphQL e Terraform', 'Comunicação clara'],
          ['Terraform', 'Kafka'],
        ],
      }),
    );
    const keywords = report.checks.find((c) => c.id === 'job_keywords');
    expect(keywords?.ok).toBe(false);
    // Go, AWS e Kafka já estão no currículo. "Comunicação" não é um termo técnico.
    expect(keywords?.recommendation).toMatch(/pedem GraphQL, Terraform, Python, e isso/);
  });

  it('sem vagas salvas, não há conferência de termos', () => {
    expect(analyzeAts(input()).checks.map((c) => c.id)).not.toContain('job_keywords');
  });
});
