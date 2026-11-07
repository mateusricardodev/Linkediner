import { describe, expect, it, vi } from 'vitest';
import { GreenhouseAdapter, LeverAdapter } from './source-adapters';

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
