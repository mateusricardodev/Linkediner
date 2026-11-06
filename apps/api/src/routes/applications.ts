import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ApplicationDetail,
  ApplicationDto,
  ApplicationMaterialDto,
  ApplicationOutcomeBody,
  ApplicationState,
  AttachResumeBody,
  CreateApplicationBody,
  DashboardResponse,
  DecideMaterialItemBody,
  ExportResumeQuery,
  ProblemDetails,
  RequestMaterialBody,
} from '@linkediner/contracts';
import type {
  Application,
  ApplicationMaterial,
  ApplicationService,
  MaterialService,
} from '@linkediner/core/applications';
import type { ConsentService } from '@linkediner/core/privacy';
import type { ResumeExportService } from '@linkediner/core/resumes/export';
import { actorOf, requireActor } from '../plugins/auth';
import { requireConsents } from '../plugins/require-consents';

export interface ApplicationDeps {
  applications: ApplicationService;
  materials: MaterialService;
  resumeExport: ResumeExportService;
  consents: Pick<ConsentService, 'status'>;
}

const toDto = (a: Application) => ({
  ...a,
  submittedAt: a.submittedAt?.toISOString() ?? null,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

const errors = {
  400: ProblemDetails,
  401: ProblemDetails,
  403: ProblemDetails,
  404: ProblemDetails,
  409: ProblemDetails,
};
const Params = z.object({ id: z.uuid() });
const MaterialParams = Params.extend({ materialId: z.uuid() });
// O conteúdo é um JSON validado pelo esquema de resposta.
const toMaterialDto = (m: ApplicationMaterial) => m as z.infer<typeof ApplicationMaterialDto>;

/** Candidaturas e dashboard (M-12). Nada é enviado sem a aprovação da pessoa. */
export const applicationRoutes =
  (deps: ApplicationDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [requireActor, requireConsents(deps.consents)];
    const tags = ['candidaturas'];

    app.get(
      '/v1/dashboard',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Resumo das candidaturas: pendências, enviadas, falhas e bloqueios',
          response: { 200: DashboardResponse, ...errors },
        },
      },
      async (req) => {
        const dashboard = await deps.applications.dashboard(actorOf(req).userId);
        return { ...dashboard, needsAttention: dashboard.needsAttention.map(toDto) };
      },
    );

    app.post(
      '/v1/applications',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Salva uma vaga como candidatura. Nada é enviado',
          body: CreateApplicationBody,
          response: { 201: ApplicationDto, ...errors },
        },
      },
      async (req, reply) =>
        reply
          .status(201)
          .send(toDto(await deps.applications.create(actorOf(req).userId, req.body.jobId))),
    );

    app.get(
      '/v1/applications',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Lista as candidaturas',
          querystring: z.object({ state: ApplicationState.optional() }),
          response: { 200: z.array(ApplicationDto), ...errors },
        },
      },
      async (req) => {
        const all = await deps.applications.list(actorOf(req).userId);
        return all.filter((a) => !req.query.state || a.state === req.query.state).map(toDto);
      },
    );

    app.get(
      '/v1/applications/:id',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Detalhe, histórico e pendências',
          params: Params,
          response: { 200: ApplicationDetail, ...errors },
        },
      },
      async (req) => {
        const detail = await deps.applications.get(actorOf(req).userId, req.params.id);
        return {
          application: toDto(detail.application),
          events: detail.events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
          manualTasks: detail.manualTasks.map((t) => ({
            ...t,
            resolvedAt: t.resolvedAt?.toISOString() ?? null,
          })),
        };
      },
    );

    app.put(
      '/v1/applications/:id/resume',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Escolhe o currículo aprovado e leva a candidatura à revisão',
          params: Params,
          body: AttachResumeBody,
          response: { 200: ApplicationDto, ...errors },
        },
      },
      async (req) =>
        toDto(
          await deps.applications.attachResume(
            actorOf(req).userId,
            req.params.id,
            req.body.resumeId,
          ),
        ),
    );

    const action = (
      path: string,
      summary: string,
      run: (userId: string, id: string) => Promise<Application>,
    ) =>
      app.post(
        `/v1/applications/:id/${path}`,
        {
          preHandler,
          schema: { tags, summary, params: Params, response: { 200: ApplicationDto, ...errors } },
        },
        async (req) => toDto(await run(actorOf(req).userId, req.params.id)),
      );

    action('submit-for-approval', 'Conclui a revisão e pede aprovação', (u, i) =>
      deps.applications.submitForApproval(u, i),
    );
    action('request-changes', 'Volta para a revisão', (u, i) =>
      deps.applications.requestChanges(u, i),
    );
    action('approve', 'Aprova a candidatura e congela o material', (u, i) =>
      deps.applications.approve(u, i),
    );
    action('manual-complete', 'Informa que a candidatura foi enviada manualmente', (u, i) =>
      deps.applications.completeManually(u, i),
    );
    action('close', 'Desiste da candidatura', (u, i) => deps.applications.close(u, i));

    app.post(
      '/v1/applications/:id/outcome',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Informa o resultado: entrevista, rejeição ou encerramento',
          params: Params,
          body: ApplicationOutcomeBody,
          response: { 200: ApplicationDto, ...errors },
        },
      },
      async (req) =>
        toDto(
          await deps.applications.reportOutcome(
            actorOf(req).userId,
            req.params.id,
            req.body.outcome,
          ),
        ),
    );

    app.post(
      '/v1/applications/:id/materials',
      {
        preHandler,
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
        schema: {
          tags,
          summary: 'Gera o currículo adaptado à vaga, a carta ou as respostas de formulário',
          params: Params,
          body: RequestMaterialBody,
          response: { 202: ApplicationMaterialDto, ...errors },
        },
      },
      async (req, reply) =>
        reply.status(202).send(
          toMaterialDto(
            await deps.materials.request(actorOf(req).userId, req.params.id, {
              kind: req.body.kind,
              questions: req.body.questions,
            }),
          ),
        ),
    );

    app.get(
      '/v1/applications/:id/materials',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Material gerado para esta candidatura',
          params: Params,
          response: { 200: z.array(ApplicationMaterialDto), ...errors },
        },
      },
      async (req) =>
        (await deps.materials.list(actorOf(req).userId, req.params.id)).map(toMaterialDto),
    );

    app.patch(
      '/v1/applications/:id/materials/:materialId/items/:itemId',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Confirma, corrige ou remove uma frase do material. Só em revisão',
          params: MaterialParams.extend({ itemId: z.uuid() }),
          body: DecideMaterialItemBody,
          response: { 200: ApplicationMaterialDto, ...errors },
        },
      },
      async (req) => {
        const { body, params } = req;
        const decision =
          body.action === 'remove'
            ? ({ action: 'remove' } as const)
            : ({ action: 'confirm', ...(body.text ? { text: body.text } : {}) } as const);
        return toMaterialDto(
          await deps.materials.decideItem(
            actorOf(req).userId,
            params.id,
            params.materialId,
            params.itemId,
            decision,
          ),
        );
      },
    );

    app.delete(
      '/v1/applications/:id/materials/:materialId',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Apaga um material. Só em revisão',
          params: MaterialParams,
          response: { 204: z.null(), ...errors },
        },
      },
      async (req, reply) => {
        await deps.materials.delete(actorOf(req).userId, req.params.id, req.params.materialId);
        return reply.status(204).send(null);
      },
    );

    app.get(
      '/v1/applications/:id/resume',
      {
        preHandler,
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
          tags,
          summary: 'Baixa o currículo exatamente como foi aprovado nesta candidatura',
          params: Params,
          querystring: ExportResumeQuery,
          response: errors,
        },
      },
      async (req, reply) => {
        const { userId } = actorOf(req);
        const material = await deps.applications.approvedMaterial(userId, req.params.id);
        const file = await deps.resumeExport.exportContent(userId, material, req.query.format, {
          entityType: 'application',
          entityId: req.params.id,
        });
        return (
          reply
            .type(file.contentType)
            .header('content-disposition', `attachment; filename="${file.fileName}"`)
            // O corpo é binário: não passa pelos esquemas JSON da rota.
            .send(Buffer.from(file.bytes) as never)
        );
      },
    );
  };
