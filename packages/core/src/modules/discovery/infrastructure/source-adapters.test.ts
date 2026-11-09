import { describe, expect, it, vi } from 'vitest';
import {
  AshbyAdapter,
  GitHubIssuesAdapter,
  GreenhouseAdapter,
  LeverAdapter,
  SmartRecruitersAdapter,
} from './source-adapters';

const respondWith = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('GreenhouseAdapter', () => {
  const JOB = {
    id: 123,
    title: ' Senior Engineer ',
    absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/123',
    location: { name: 'São Paulo' },
    first_published: '2026-11-05T10:00:00-03:00',
    updated_at: '2026-11-06T10:00:00-03:00',
    content: '&lt;p&gt;Texto da vaga&lt;/p&gt;',
    data_compliance: [],
  };

  it('traduz a resposta, sem depender de campos extras', async () => {
    const fetcher = respondWith({ jobs: [JOB], meta: { total: 1 } });
    const [job] = await new GreenhouseAdapter(fetcher).listPostings('acme');
    expect(job).toEqual({
      externalId: '123',
      title: 'Senior Engineer',
      location: 'São Paulo',
      remoteHint: false,
      applyUrl: JOB.absolute_url,
      postedAt: new Date('2026-11-05T13:00:00.000Z'),
      body: 'Texto da vaga',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true',
      expect.anything(),
    );
  });

  it('sem data de publicação, usa a de atualização', async () => {
    const [job] = await new GreenhouseAdapter(
      respondWith({ jobs: [{ ...JOB, first_published: null }] }),
    ).listPostings('acme');
    expect(job?.postedAt).toEqual(new Date('2026-11-06T13:00:00.000Z'));
  });

  it('falha de verdade quando a fonte recusa ou muda o formato', async () => {
    await expect(new GreenhouseAdapter(respondWith({}, 404)).listPostings('acme')).rejects.toThrow(
      'source_status_404',
    );
    await expect(
      new GreenhouseAdapter(respondWith({ vagas: [] })).listPostings('acme'),
    ).rejects.toThrow();
  });

  it('recusa link que não seja HTTPS', async () => {
    await expect(
      new GreenhouseAdapter(
        respondWith({ jobs: [{ ...JOB, absolute_url: 'javascript:alert(1)' }] }),
      ).listPostings('acme'),
    ).rejects.toThrow();
  });

  it('não monta endereço com nome estranho', async () => {
    const fetcher = respondWith({ jobs: [] });
    await expect(new GreenhouseAdapter(fetcher).listPostings('../admin')).rejects.toThrow(
      'source_invalid_token',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('LeverAdapter', () => {
  it('junta a descrição e as listas, e lê o modelo de trabalho', async () => {
    const [job] = await new LeverAdapter(
      respondWith([
        {
          id: 'abc',
          text: 'Backend Engineer',
          hostedUrl: 'https://jobs.lever.co/acme/abc',
          createdAt: 1_762_300_000_000,
          workplaceType: 'remote',
          categories: { location: 'Brazil' },
          descriptionPlain: 'Descrição',
          lists: [{ text: 'Requisitos', content: '<li>Go</li>' }],
          additionalPlain: 'Mais',
        },
      ]),
    ).listPostings('acme');
    expect(job).toMatchObject({
      externalId: 'abc',
      location: 'Brazil',
      remoteHint: true,
      postedAt: new Date(1_762_300_000_000),
      body: 'Descrição\n\nRequisitos\n\n• Go\n\nMais',
    });
  });

  it('tira o código interno do título', async () => {
    const [job] = await new LeverAdapter(
      respondWith([
        {
          id: 'a',
          text: '[Job -  32563]  Senior Engineer',
          hostedUrl: 'https://jobs.lever.co/a/a',
        },
      ]),
    ).listPostings('acme');
    expect(job?.title).toBe('Senior Engineer');
  });

  it('aceita vaga sem data nem local', async () => {
    const [job] = await new LeverAdapter(
      respondWith([{ id: 'a', text: 'Dev', hostedUrl: 'https://jobs.lever.co/a/a' }]),
    ).listPostings('acme');
    expect(job).toMatchObject({ postedAt: null, location: '', remoteHint: false, body: '' });
  });
});

describe('AshbyAdapter', () => {
  const JOB = {
    id: 'abc-1',
    title: 'Senior Backend Engineer',
    location: 'São Paulo',
    secondaryLocations: [{ location: 'Remote - Brazil' }],
    address: { postalAddress: { addressCountry: 'Brazil' } },
    isListed: true,
    isRemote: false,
    workplaceType: 'Hybrid',
    publishedAt: '2026-11-05T10:00:00.000Z',
    jobUrl: 'https://jobs.ashbyhq.com/acme/abc-1',
    descriptionPlain: ' Texto da vaga ',
  };

  it('junta os locais e acrescenta o país, que o filtro de região precisa', async () => {
    const fetcher = respondWith({ jobs: [JOB], apiVersion: '1' });
    const [job] = await new AshbyAdapter(fetcher).listPostings('acme');
    expect(job).toEqual({
      externalId: 'abc-1',
      title: 'Senior Backend Engineer',
      location: 'São Paulo | Remote - Brazil',
      remoteHint: false,
      applyUrl: JOB.jobUrl,
      postedAt: new Date('2026-11-05T10:00:00.000Z'),
      body: 'Texto da vaga',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.ashbyhq.com/posting-api/job-board/acme',
      expect.anything(),
    );
  });

  it('deixa de fora vaga não listada e lê o modelo remoto', async () => {
    const jobs = await new AshbyAdapter(
      respondWith({
        jobs: [
          { ...JOB, id: 'oculta', isListed: false },
          { ...JOB, id: 'remota', workplaceType: 'Remote', secondaryLocations: [], address: null },
        ],
      }),
    ).listPostings('acme');
    expect(jobs.map((j) => [j.externalId, j.remoteHint, j.location])).toEqual([
      ['remota', true, 'São Paulo'],
    ]);
  });
});

describe('SmartRecruitersAdapter', () => {
  const listing = (content: unknown[], totalFound = content.length) => ({ totalFound, content });
  const DETAIL = {
    postingUrl: 'https://jobs.smartrecruiters.com/Acme/1-dev',
    jobAd: {
      sections: {
        companyDescription: { text: '<p>Sobre a empresa</p>' },
        jobDescription: { text: '<p>Descrição</p>' },
        qualifications: { text: '<ul><li>Java</li></ul>' },
        additionalInformation: { text: '' },
      },
    },
  };

  it('busca a descrição só das vagas que passam no filtro do catálogo', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const body = url.includes('/postings?')
        ? listing([
            {
              id: '1',
              name: 'Desenvolvedor Java',
              releasedDate: '2026-11-08T10:00:00.000Z',
              location: { fullLocation: 'Blumenau, , Brazil', remote: true },
            },
            { id: '2', name: 'Analista Contábil', location: { fullLocation: 'São Paulo, Brazil' } },
          ])
        : DETAIL;
      return new Response(JSON.stringify(body));
    }) as unknown as typeof fetch;

    const jobs = await new SmartRecruitersAdapter(fetcher).listPostings('Acme');
    expect(jobs).toEqual([
      {
        externalId: '1',
        title: 'Desenvolvedor Java',
        location: 'Blumenau, Brazil',
        remoteHint: true,
        applyUrl: DETAIL.postingUrl,
        postedAt: new Date('2026-11-08T10:00:00.000Z'),
        body: 'Descrição\n\n• Java',
      },
    ]);
    // Uma chamada para a lista e uma para a única vaga relevante: a contábil não é buscada.
    expect(vi.mocked(fetcher).mock.calls.map(([url]) => url)).toEqual([
      'https://api.smartrecruiters.com/v1/companies/Acme/postings?country=br&limit=100&offset=0',
      'https://api.smartrecruiters.com/v1/companies/Acme/postings/1',
    ]);
  });

  it('pagina até o total, com teto', async () => {
    const page = Array.from({ length: 100 }, (_, i) => ({ id: `x${i}`, name: 'Contador' }));
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify(listing(page, 10_000))),
    ) as unknown as typeof fetch;
    await expect(new SmartRecruitersAdapter(fetcher).listPostings('Acme')).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
});

describe('GitHubIssuesAdapter', () => {
  const NOW = new Date('2026-11-09T12:00:00.000Z');
  const issue = (o: Record<string, unknown> = {}) => ({
    number: 10,
    title: '[Remoto] Desenvolvedor(a) Backend Pleno - Empresa Exemplo',
    html_url: 'https://github.com/acme/vagas/issues/10',
    created_at: '2026-11-08T12:00:00Z',
    body: '## Descrição\n\nVaga **fictícia**. Envie para [o recrutador](mailto:rh@example.com).',
    labels: [{ name: 'PJ' }, { name: 'Remoto' }],
    ...o,
  });
  const adapter = (issues: unknown[]) => new GitHubIssuesAdapter(respondWith(issues), () => NOW);

  it('cada issue aberta vira uma vaga, com empresa e local tirados do título', async () => {
    const fetcher = respondWith([issue()]);
    const [job] = await new GitHubIssuesAdapter(fetcher, () => NOW).listPostings('acme/vagas');
    expect(job).toEqual({
      externalId: '10',
      title: 'Desenvolvedor(a) Backend Pleno',
      company: 'Empresa Exemplo',
      location: 'Remoto, Brasil',
      remoteHint: true,
      applyUrl: 'https://github.com/acme/vagas/issues/10',
      postedAt: new Date('2026-11-08T12:00:00Z'),
      body: 'Descrição\n\nVaga fictícia. Envie para o recrutador.',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.github.com/repos/acme/vagas/issues?state=open&sort=created&direction=desc&per_page=100',
      expect.anything(),
    );
  });

  it('deixa de fora pull request, vaga antiga e vaga marcada como esquecida', async () => {
    const jobs = await adapter([
      issue({ number: 1, pull_request: { url: 'x' } }),
      issue({ number: 2, created_at: '2026-06-01T00:00:00Z' }),
      issue({ number: 3, labels: [{ name: 'stale' }] }),
      issue({ number: 4 }),
    ]).listPostings('acme/vagas');
    expect(jobs.map((j) => j.externalId)).toEqual(['4']);
  });

  it('sem empresa no título, não inventa uma', async () => {
    const [job] = await adapter([
      issue({ title: '[Joinville/SC] Back-end ou Full Stack Developer (Node.js + React)' }),
    ]).listPostings('acme/vagas');
    expect(job).toMatchObject({
      company: 'Empresa não informada',
      location: 'Joinville/SC, Brasil',
    });
  });

  it('recusa repositório com nome estranho', async () => {
    await expect(adapter([]).listPostings('../../etc')).rejects.toThrow('source_invalid_token');
    await expect(adapter([]).listPostings('acme')).rejects.toThrow('source_invalid_token');
  });
});
