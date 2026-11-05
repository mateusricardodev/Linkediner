/**
 * Fronteiras do monólito modular (ADR 0002). Rodado no CI com `pnpm arch`.
 */
module.exports = {
  forbidden: [
    {
      name: 'dominio-sem-infraestrutura',
      comment:
        'O domínio é TypeScript puro: não importa infraestrutura, banco, frameworks ou SDKs.',
      severity: 'error',
      from: { path: '^packages/core/src/modules/[^/]+/domain/' },
      to: {
        path: [
          '/infrastructure/',
          '^packages/db/',
          'node_modules/(fastify|pg|pg-boss|drizzle-orm|@google)',
        ],
      },
    },
    {
      name: 'aplicacao-sem-infraestrutura',
      comment: 'Casos de uso dependem de portas (interfaces), não de adaptadores.',
      severity: 'error',
      from: { path: '^packages/core/src/modules/[^/]+/application/' },
      to: { path: ['/infrastructure/', '^packages/db/'] },
    },
    {
      name: 'modulo-usa-apenas-api-publica',
      comment: 'Um módulo só importa outro pelo index.ts (API pública).',
      severity: 'error',
      from: { path: '^packages/core/src/modules/([^/]+)/' },
      to: {
        path: '^packages/core/src/modules/([^/]+)/.+',
        pathNot: ['^packages/core/src/modules/$1/', '^packages/core/src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'web-sem-backend',
      comment: 'O frontend não acessa banco, núcleo de domínio nem worker: só a API.',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: {
        path: [
          '^packages/(core|db|config|observability)/',
          '^@linkediner/(core|db|config|observability)',
          '^apps/(api|worker)/',
        ],
      },
    },
    {
      name: 'apps-independentes',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/([^/]+)/', pathNot: '^apps/$1/' },
    },
    { name: 'sem-ciclos', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['node_modules', '\\.next', 'dist', 'generated'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'default'] },
  },
};
