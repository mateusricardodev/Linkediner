import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { AppConfig } from '@linkediner/config';
import type { Logger } from '@linkediner/observability';
import type { Auth } from '@linkediner/core/identity';
import { registerAuth } from './plugins/auth';
import { registerErrorHandler } from './plugins/error-handler';
import { registerOriginCheck } from './plugins/origin-check';
import { healthRoutes, type HealthDeps } from './routes/health';
import { meRoutes, type MeDeps } from './routes/me';
import { profileRoutes } from './routes/profile';
import type { ExtractionRequests } from '@linkediner/core/extraction';
import type { FactService, ProfileScoreService, ProfileService } from '@linkediner/core/profile';
import type { DocumentService } from '@linkediner/core/documents';
import { documentRoutes } from './routes/documents';

export interface ServerDeps {
  config: Pick<AppConfig, 'NODE_ENV' | 'WEB_ORIGIN'>;
  logger: Logger;
  health: HealthDeps;
  /** Autenticação e rotas de conta. Opcional para permitir testes da base sem banco. */
  account?: {
    auth: Auth;
    profile: ProfileService;
    facts: FactService;
    scores: ProfileScoreService;
    documents: DocumentService;
    extraction: ExtractionRequests;
  } & MeDeps;
}

export async function buildServer(deps: ServerDeps) {
  const app = Fastify({
    loggerInstance: deps.logger,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming)
        ? incoming
        : randomUUID();
    },
    requestIdHeader: false,
    trustProxy: deps.config.NODE_ENV !== 'development',
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  await app.register(helmet);
  await app.register(cors, { origin: deps.config.WEB_ORIGIN, credentials: true });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'LinkedIner API',
        version: '0.1.0',
        description: 'API do copiloto de carreira LinkedIner.',
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  if (deps.config.NODE_ENV !== 'production') {
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  await app.register(healthRoutes(deps.health));

  if (deps.account) {
    registerOriginCheck(app, deps.config.WEB_ORIGIN);
    await registerAuth(app, deps.account.auth);
    await app.register(meRoutes(deps.account));
    await app.register(profileRoutes(deps.account));
    await app.register(documentRoutes(deps.account));
  }

  return app;
}
