import { z } from 'zod';
import type { JobSourceAdapter } from '../application/ports';
import {
  htmlToText,
  isRelevantPosting,
  markdownToText,
  parseCommunityTitle,
  type ExternalPosting,
} from '../domain/discovery';

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

const AshbyResponse = z.object({
  jobs: z.array(
    z.looseObject({
      id: z.string().min(1),
      title: z.string().min(1),
      location: z.string().nullish(),
      secondaryLocations: z.array(z.looseObject({ location: z.string().nullish() })).nullish(),
      address: z
        .looseObject({
          postalAddress: z.looseObject({ addressCountry: z.string().nullish() }).nullish(),
        })
        .nullish(),
      isListed: z.boolean().nullish(),
      isRemote: z.boolean().nullish(),
      workplaceType: z.string().nullish(),
      publishedAt: z.string().nullish(),
      jobUrl: httpsUrl,
      descriptionPlain: z.string().nullish(),
    }),
  ),
});

/** Listagem pública, por empresa, sem chave (https://developers.ashbyhq.com/docs/public-job-posting-api). */
export class AshbyAdapter implements JobSourceAdapter {
  readonly key = 'ashby';

  constructor(private readonly fetcher: Fetch = fetch) {}

  async listPostings(token: string): Promise<ExternalPosting[]> {
    assertToken(token);
    const data = AshbyResponse.parse(
      await getJson(this.fetcher, `https://api.ashbyhq.com/posting-api/job-board/${token}`),
    );
    return data.jobs
      .filter((job) => job.isListed !== false)
      .map((job) => {
        const places = [job.location, ...(job.secondaryLocations ?? []).map((s) => s.location)]
          .map((place) => place?.trim() ?? '')
          .filter(Boolean);
        const country = job.address?.postalAddress?.addressCountry?.trim();
        // "São Paulo" sozinho não diz o país: o filtro de região precisa dele.
        if (country && !places.some((p) => p.includes(country))) places.push(country);
        return {
          externalId: job.id,
          title: cleanTitle(job.title),
          location: places.join(' | '),
          remoteHint: job.isRemote === true || job.workplaceType?.toLowerCase() === 'remote',
          applyUrl: job.jobUrl,
          postedAt: safeDate(job.publishedAt),
          body: job.descriptionPlain?.trim() ?? '',
        };
      });
  }
}

const SmartRecruitersLocation = z
  .looseObject({
    city: z.string().nullish(),
    region: z.string().nullish(),
    country: z.string().nullish(),
    fullLocation: z.string().nullish(),
    remote: z.boolean().nullish(),
  })
  .nullish();

const SmartRecruitersList = z.object({
  totalFound: z.number(),
  content: z.array(
    z.looseObject({
      id: z.string().min(1),
      name: z.string().min(1),
      releasedDate: z.string().nullish(),
      location: SmartRecruitersLocation,
    }),
  ),
});

const section = z.looseObject({ text: z.string().nullish() }).nullish();
const SmartRecruitersPosting = z.looseObject({
  postingUrl: httpsUrl,
  jobAd: z
    .looseObject({
      sections: z
        .looseObject({
          jobDescription: section,
          qualifications: section,
          additionalInformation: section,
        })
        .nullish(),
    })
    .nullish(),
});

const SMARTRECRUITERS_PAGE = 100;
/** Teto de páginas por empresa: com o filtro de país, nenhuma passa disso hoje. */
const SMARTRECRUITERS_MAX_PAGES = 5;
const POSTING_ID = /^[0-9a-z-]{1,80}$/i;

/** "Blumenau, , Brazil" vira "Blumenau, Brazil". */
const tidyPlace = (place: string) =>
  place
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');

/**
 * Listagem pública, por empresa, sem chave (https://developers.smartrecruiters.com/docs/posting-api).
 * A lista não traz a descrição: ela é buscada uma a uma, e só para as vagas que passam no filtro do
 * catálogo. Assim, uma empresa com centenas de vagas não vira centenas de chamadas a cada rodada.
 */
export class SmartRecruitersAdapter implements JobSourceAdapter {
  readonly key = 'smartrecruiters';

  constructor(private readonly fetcher: Fetch = fetch) {}

  async listPostings(token: string): Promise<ExternalPosting[]> {
    assertToken(token);
    const base = `https://api.smartrecruiters.com/v1/companies/${token}/postings`;
    const listed: z.infer<typeof SmartRecruitersList>['content'] = [];
    for (let page = 0; page < SMARTRECRUITERS_MAX_PAGES; page++) {
      const offset = page * SMARTRECRUITERS_PAGE;
      const data = SmartRecruitersList.parse(
        await getJson(
          this.fetcher,
          `${base}?country=br&limit=${SMARTRECRUITERS_PAGE}&offset=${offset}`,
        ),
      );
      listed.push(...data.content);
      if (listed.length >= data.totalFound || data.content.length < SMARTRECRUITERS_PAGE) break;
    }

    const postings: ExternalPosting[] = [];
    for (const job of listed) {
      const place = job.location;
      const summary = {
        title: cleanTitle(job.name),
        location: tidyPlace(
          place?.fullLocation ?? [place?.city, place?.region, place?.country].join(', '),
        ),
        remoteHint: place?.remote === true,
      };
      if (!isRelevantPosting(summary) || !POSTING_ID.test(job.id)) continue;
      const detail = SmartRecruitersPosting.parse(await getJson(this.fetcher, `${base}/${job.id}`));
      const sections = detail.jobAd?.sections;
      postings.push({
        externalId: job.id,
        ...summary,
        applyUrl: detail.postingUrl,
        postedAt: safeDate(job.releasedDate),
        body: [sections?.jobDescription, sections?.qualifications, sections?.additionalInformation]
          .map((s) => htmlToText(s?.text ?? ''))
          .filter(Boolean)
          .join('\n\n'),
      });
    }
    return postings;
  }
}

/**
 * Local das vagas remotas dos portais. Quando a abrangência não cita o Brasil nem a América Latina
 * ("Anywhere", "Worldwide"), o texto diz que o Brasil está incluído: é o que o filtro do catálogo
 * procura, e a pessoa entende de onde pode trabalhar.
 */
function remoteLocation(scope: string): string {
  const tidy = scope
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/\b(brazil|brasil|latam|latin america|south america)\b/i.test(tidy)) return `Remoto, ${tidy}`;
  return tidy ? `Remoto, inclui Brasil (${tidy})` : 'Remoto, inclui Brasil';
}

const HimalayasResponse = z.object({
  jobs: z.array(
    z.looseObject({
      guid: z.string().min(1),
      title: z.string().min(1),
      companyName: z.string().min(1),
      locationRestrictions: z.array(z.string()).nullish(),
      pubDate: z.number().nullish(),
      expiryDate: z.number().nullish(),
      applicationLink: httpsUrl,
      description: z.string().nullish(),
    }),
  ),
});

const HIMALAYAS_PAGE = 20;
const HIMALAYAS_MAX_PAGES = 5;

/**
 * Portal de vagas remotas com API gratuita (https://himalayas.app/api). Os termos permitem mostrar
 * as vagas em outro app, desde que a candidatura use o `applicationLink` e o Himalayas apareça como
 * fonte. O token é a palavra buscada ("developer"). Só entram vagas que aceitam quem está no Brasil:
 * vaga sem restrição de país fica de fora, porque muitas são, na prática, só para os EUA.
 */
export class HimalayasAdapter implements JobSourceAdapter {
  readonly key = 'himalayas';

  constructor(
    private readonly fetcher: Fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listPostings(token: string): Promise<ExternalPosting[]> {
    assertToken(token);
    const query = encodeURIComponent(token.replace(/-/g, ' '));
    const postings = new Map<string, ExternalPosting>();
    for (let page = 1; page <= HIMALAYAS_MAX_PAGES; page++) {
      const data = HimalayasResponse.parse(
        await getJson(
          this.fetcher,
          `https://himalayas.app/jobs/api/search?q=${query}&country=Brazil&sort=recent&page=${page}`,
        ),
      );
      for (const job of data.jobs) {
        const countries = job.locationRestrictions ?? [];
        if (!countries.includes('Brazil')) continue;
        if (job.expiryDate && job.expiryDate * 1000 < this.now().getTime()) continue;
        postings.set(job.guid, {
          externalId: job.guid,
          title: cleanTitle(job.title),
          company: job.companyName.trim(),
          location: countries.length === 1 ? 'Remoto, Brasil' : 'Remoto, inclui Brasil',
          remoteHint: true,
          applyUrl: job.applicationLink,
          postedAt: job.pubDate ? safeDate(job.pubDate * 1000) : null,
          body: htmlToText(job.description ?? ''),
        });
      }
      if (data.jobs.length < HIMALAYAS_PAGE) break;
    }
    return [...postings.values()];
  }
}

const JobicyResponse = z.object({
  jobs: z
    .array(
      z.looseObject({
        id: z.number(),
        url: httpsUrl,
        jobTitle: z.string().min(1),
        companyName: z.string().min(1),
        jobGeo: z.string().nullish(),
        jobDescription: z.string().nullish(),
        pubDate: z.string().nullish(),
      }),
    )
    .default([]),
});

/**
 * Portal de vagas remotas com API gratuita (https://jobicy.com/jobs-rss-feed). Os termos pedem o
 * crédito com link e a candidatura pelo endereço da própria vaga. O token é a região da busca
 * ("brazil"), e a API já devolve só vagas abertas a ela.
 */
export class JobicyAdapter implements JobSourceAdapter {
  readonly key = 'jobicy';

  constructor(private readonly fetcher: Fetch = fetch) {}

  async listPostings(token: string): Promise<ExternalPosting[]> {
    assertToken(token);
    const data = JobicyResponse.parse(
      await getJson(this.fetcher, `https://jobicy.com/api/v2/remote-jobs?count=100&geo=${token}`),
    );
    return data.jobs.map((job) => ({
      externalId: String(job.id),
      title: cleanTitle(job.jobTitle),
      company: job.companyName.trim(),
      location: remoteLocation(job.jobGeo ?? ''),
      remoteHint: true,
      applyUrl: job.url,
      postedAt: safeDate(job.pubDate),
      body: htmlToText(job.jobDescription ?? ''),
    }));
  }
}

/** "dono/repositório", só com os caracteres que o GitHub aceita. */
const REPOSITORY = /^[a-z0-9-]{1,39}\/[a-z0-9._-]{1,100}$/i;

const GitHubIssues = z.array(
  z.looseObject({
    number: z.number(),
    title: z.string().min(1),
    html_url: httpsUrl,
    created_at: z.string(),
    body: z.string().nullish(),
    pull_request: z.unknown().optional(),
    labels: z.array(z.looseObject({ name: z.string().nullish() })).default([]),
  }),
);

/** Vaga aberta há mais tempo que isso costuma estar esquecida, mesmo sem ser fechada. */
const COMMUNITY_MAX_AGE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const FORGOTTEN = /\b(stale|fechada|closed|expirada|preenchida)\b/i;

/**
 * Repositórios de comunidades brasileiras em que empresas publicam vagas como issues, como o
 * backend-br/vagas. Cada issue aberta é uma vaga: o título traz local, cargo e empresa.
 */
export class GitHubIssuesAdapter implements JobSourceAdapter {
  readonly key = 'github';

  constructor(
    private readonly fetcher: Fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listPostings(token: string): Promise<ExternalPosting[]> {
    if (!REPOSITORY.test(token)) throw new Error('source_invalid_token');
    const issues = GitHubIssues.parse(
      await getJson(
        this.fetcher,
        `https://api.github.com/repos/${token}/issues?state=open&sort=created&direction=desc&per_page=100`,
      ),
    );
    const oldest = this.now().getTime() - COMMUNITY_MAX_AGE_DAYS * DAY_MS;
    return issues.flatMap((issue) => {
      const labels = issue.labels.map((l) => l.name ?? '');
      const createdAt = safeDate(issue.created_at);
      if (issue.pull_request !== undefined || labels.some((l) => FORGOTTEN.test(l))) return [];
      if (!createdAt || createdAt.getTime() < oldest) return [];
      const parsed = parseCommunityTitle(issue.title, labels);
      if (!parsed.title) return [];
      return [
        {
          externalId: String(issue.number),
          title: parsed.title,
          company: parsed.company ?? 'Empresa não informada',
          location: parsed.location,
          remoteHint: parsed.remote,
          applyUrl: issue.html_url,
          postedAt: createdAt,
          body: markdownToText(issue.body ?? ''),
        },
      ];
    });
  }
}
