import { describe, expect, it } from 'vitest';
import { buildRawText, contentHash, htmlToText, isRelevantPosting, matchesGoal } from './discovery';

const posting = (
  title: string,
  location = 'São Paulo, Brazil',
  remotePolicy: string | null = null,
) => ({
  title,
  location,
  remoteHint: false,
  remotePolicy,
});
const goal = (o: Partial<Parameters<typeof matchesGoal>[1]> = {}) => ({
  title: 'Objetivo',
  targetRoles: [] as string[],
  locations: [] as string[],
  remoteOnly: false,
  ...o,
});

describe('htmlToText', () => {
  it('lê o HTML escapado do Greenhouse e mantém a estrutura', () => {
    expect(
      htmlToText(
        '&lt;div&gt;&lt;p&gt;Sobre a vaga&lt;/p&gt;&lt;ul&gt;&lt;li&gt;React &amp;amp; TypeScript&lt;/li&gt;&lt;li&gt;Go&lt;/li&gt;&lt;/ul&gt;&lt;/div&gt;',
      ),
    ).toBe('Sobre a vaga\n• React & TypeScript\n• Go');
  });

  it('não deixa script nem marcação passar', () => {
    const text = htmlToText(
      '<script>alert(1)</script><style>a{}</style><p onclick="x()">Vaga</p><img src=x>',
    );
    expect(text).toBe('Vaga');
  });

  it('entende entidades numéricas e ignora as desconhecidas', () => {
    expect(htmlToText('caf&#233; &#xE9; &naoexiste;')).toBe('café é &naoexiste;');
  });
});

describe('buildRawText', () => {
  it('começa com o que a fonte informa, para a análise conferir', () => {
    expect(buildRawText({ title: 'Dev', location: 'Recife', body: 'Texto' }, 'Acme')).toBe(
      'Dev\nAcme\nRecife\n\nTexto',
    );
  });

  it('corta texto gigante em vez de recusar', () => {
    expect(
      buildRawText({ title: 'Dev', location: 'R', body: 'x'.repeat(40_000) }, 'A').length,
    ).toBe(30_000);
  });
});

describe('contentHash', () => {
  it('não muda por maiúscula ou espaço, e muda com o conteúdo', () => {
    expect(contentHash('Vaga  React')).toBe(contentHash('vaga react'));
    expect(contentHash('Vaga React')).not.toBe(contentHash('Vaga Go'));
  });
});

describe('isRelevantPosting', () => {
  const relevant = (title: string, location: string, remoteHint = false) =>
    isRelevantPosting({ title, location, remoteHint });

  it('aceita tecnologia no Brasil', () => {
    expect(relevant('Engenheira de Software Sênior', 'São Paulo, SP')).toBe(true);
    expect(relevant('Senior Backend Engineer', 'Brazil')).toBe(true);
    expect(relevant('Analista de Dados', 'Belo Horizonte, MG; São Paulo, SP')).toBe(true);
  });

  it('recusa quem não é de tecnologia', () => {
    expect(relevant('Advogado Sênior', 'São Paulo, Brazil')).toBe(false);
    expect(relevant('Account Executive', 'Brazil')).toBe(false);
  });

  it('remoto só conta na América Latina', () => {
    expect(relevant('Software Engineer', 'Remote, United States', true)).toBe(false);
    expect(relevant('Software Engineer', 'LATAM', true)).toBe(true);
    expect(relevant('Software Engineer', 'Remote - Latin America')).toBe(true);
    expect(relevant('Software Engineer', 'Latin America')).toBe(false);
  });

  it('não confunde sigla com palavra', () => {
    expect(relevant('Software Engineer', 'Spain')).toBe(false);
    expect(relevant('Software Engineer', 'Prague')).toBe(false);
  });
});

describe('matchesGoal', () => {
  it('acha o cargo em qualquer grafia', () => {
    const frontend = goal({ targetRoles: ['Frontend'] });
    expect(matchesGoal(posting('Front-End Engineer'), frontend)).toBe(true);
    expect(matchesGoal(posting('Front End Engineer'), frontend)).toBe(true);
    expect(matchesGoal(posting('Engenheira Frontend Sênior'), frontend)).toBe(true);
    expect(matchesGoal(posting('Backend Engineer'), frontend)).toBe(false);
  });

  it('entende português e inglês', () => {
    const data = goal({ targetRoles: ['Engenheiro de Dados'] });
    expect(matchesGoal(posting('Senior Data Engineer'), data)).toBe(true);
    expect(matchesGoal(posting('Engenheira de Dados'), data)).toBe(true);
    expect(matchesGoal(posting('Engenheira de Software'), data)).toBe(false);
    expect(matchesGoal(posting('Analista de Dados'), data)).toBe(false);
  });

  it('basta um dos cargos', () => {
    const roles = goal({ targetRoles: ['Frontend', 'Fullstack'] });
    expect(matchesGoal(posting('Full-stack Developer'), roles)).toBe(true);
  });

  it('sem cargos, usa o nome do objetivo sem nível nem formato', () => {
    expect(matchesGoal(posting('Backend Engineer'), goal({ title: 'Backend sênior remoto' }))).toBe(
      true,
    );
    expect(
      matchesGoal(posting('Frontend Engineer'), goal({ title: 'Backend sênior remoto' })),
    ).toBe(false);
  });

  it('nome que só diz nível não filtra o cargo', () => {
    expect(matchesGoal(posting('QA Engineer'), goal({ title: 'Sênior remoto' }))).toBe(true);
  });

  describe('só remoto', () => {
    const remoteOnly = goal({ remoteOnly: true });

    it('confia na análise quando ela existe', () => {
      expect(matchesGoal(posting('Dev', 'São Paulo', 'remote'), remoteOnly)).toBe(true);
      expect(matchesGoal(posting('Dev', 'Remoto - Brasil', 'hybrid'), remoteOnly)).toBe(false);
      expect(matchesGoal(posting('Dev', 'São Paulo', 'onsite'), remoteOnly)).toBe(false);
    });

    it('sem análise, usa o que a fonte diz', () => {
      expect(matchesGoal(posting('Dev', 'Remoto - Brasil'), remoteOnly)).toBe(true);
      expect(matchesGoal(posting('Dev', 'São Paulo'), remoteOnly)).toBe(false);
      expect(matchesGoal({ ...posting('Dev', 'Brazil'), remoteHint: true }, remoteOnly)).toBe(true);
    });
  });

  describe('locais', () => {
    const recife = goal({ locations: ['Recife'] });

    it('filtra pelo local, sem depender de acento', () => {
      expect(matchesGoal(posting('Dev', 'Recife, PE'), recife)).toBe(true);
      expect(matchesGoal(posting('Dev', 'São Paulo, SP'), recife)).toBe(false);
      expect(matchesGoal(posting('Dev', 'SAO PAULO'), goal({ locations: ['São Paulo'] }))).toBe(
        true,
      );
    });

    it('vaga remota vale em qualquer local', () => {
      expect(matchesGoal(posting('Dev', 'São Paulo', 'remote'), recife)).toBe(true);
    });
  });
});
