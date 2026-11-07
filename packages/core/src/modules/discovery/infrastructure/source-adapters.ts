import { z } from 'zod';
import type { JobSourceAdapter } from '../application/ports';
import { htmlToText, type ExternalPosting } from '../domain/discovery';

type Fetch = typeof fetch;

const TIMEOUT_MS = 30_000;
/** O nome vem dos nossos dados: mesmo assim, nada além disso entra no endereço. */
const TOKEN = /^[a-z0-9-]{1,80}$/i;

async function getJson(fetcher: Fetch, url: string): Promise<unknown> {
  const response = await fetcher(url, {
    headers: { accept: 'application/json', 'user-agent': 'LinkedIner/0.1' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`source_status_${response.status}`);
  return response.json();
}

function assertToken(token: string) {
  if (!TOKEN.test(token)) throw new Error('source_invalid_token');
}

/** Algumas empresas põem o código interno no título: "[Job - 32581] Senior Engineer". */
const cleanTitle = (title: string) =>
  title
    .replace(/^\s*\[\s*job\s*-?\s*\d+\s*\]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const safeDate = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Só link HTTPS vai para a tela. */
const httpsUrl = z.url().refine((url) => url.startsWith('https://'));

const GreenhouseResponse = z.object({
  jobs: z.array(
    z.looseObject({
      id: z.number(),
      title: z.string().min(1),
      absolute_url: httpsUrl,
      location: z.looseObject({ name: z.string().nullish() }).nullish(),
      first_published: z.string().nullish(),
      updated_at: z.string().nullish(),
      content: z.string().nullish(),
    }),
  ),
});

/** Listagem pública, por empresa, sem chave (https://docs.greenhouse.io/job-board.html). */
export class GreenhouseAdapter implements JobSourceAdapter {
  readonly key = 'greenhouse';

  constructor(private readonly fetcher: Fetch = fetch) {}

  async listPostings(token: string): Promise<ExternalPosting[]> {
    assertToken(token);
    const data = GreenhouseResponse.parse(
      await getJson(
        this.fetcher,
        `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`,
      ),
    );
    return data.jobs.map((job) => {
      const location = job.location?.name?.trim() ?? '';
      return {
        externalId: String(job.id),
        title: cleanTitle(job.title),
        location,
        remoteHint: false,
        applyUrl: job.absolute_url,
        postedAt: safeDate(job.first_published ?? job.updated_at),
        body: htmlToText(job.content ?? ''),
      };
    });
  }
}

const LeverResponse = z.array(
  z.looseObject({
    id: z.string().min(1),
    text: z.string().min(1),
    hostedUrl: httpsUrl,
    createdAt: z.number().nullish(),
    workplaceType: z.string().nullish(),
    categories: z.looseObject({ location: z.string().nullish() }).nullish(),
    descriptionPlain: z.string().nullish(),
    additionalPlain: z.string().nullish(),
    lists: z
      .array(z.looseObject({ text: z.string().nullish(), content: z.string().nullish() }))
      .nullish(),
  }),
);

/** Listagem pública, por empresa, sem chave (https://github.com/lever/postings-api). */
export class LeverAdapter implements JobSourceAdapter {
  readonly key = 'lever';

  constructor(private readonly fetcher: Fetch = fetch) {}

  async listPostings(token: string): Promise<ExternalPosting[]> {
    assertToken(token);
    const data = LeverResponse.parse(
      await getJson(this.fetcher, `https://api.lever.co/v0/postings/${token}?mode=json`),
    );
    return data.map((job) => ({
      externalId: job.id,
      title: cleanTitle(job.text),
      location: job.categories?.location?.trim() ?? '',
      remoteHint: job.workplaceType?.toLowerCase() === 'remote',
      applyUrl: job.hostedUrl,
      postedAt: safeDate(job.createdAt),
      body: [
        job.descriptionPlain,
        ...(job.lists ?? []).flatMap((list) => [list.text, htmlToText(list.content ?? '')]),
        job.additionalPlain,
      ]
        .filter(Boolean)
        .join('\n\n')
        .trim(),
    }));
  }
}
