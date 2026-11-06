import { mkdir, writeFile } from 'node:fs/promises';
import { createAiProvider } from '@linkediner/core/ai';
import { EVAL_CASES } from './dataset';
import { evaluate } from './evaluate';

/**
 * Avalia o modelo real com os currículos sintéticos. Cada currículo faz 5 chamadas de IA.
 * Uso: pnpm --filter @linkediner/ai-evals eval [--limit=5]
 * Código de saída 1: a avaliação reprovou. 2: falta configuração.
 */
const { GEMINI_API_KEY, AI_MODEL_EXTRACT, AI_MODEL_GENERATE } = process.env;
if (!GEMINI_API_KEY || !AI_MODEL_EXTRACT) {
  console.error('Defina GEMINI_API_KEY e AI_MODEL_EXTRACT para avaliar o modelo real.');
  process.exit(2);
}

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : EVAL_CASES.length;
const cases = EVAL_CASES.slice(0, limit);

const ai = createAiProvider({
  AI_PROVIDER: 'gemini',
  GEMINI_API_KEY,
  AI_MODEL_EXTRACT,
  AI_MODEL_GENERATE,
});

console.log(
  `Avaliando ${cases.length} currículos sintéticos (${cases.length * 5} chamadas de IA).`,
);
const report = await evaluate(ai, cases);
const output = { ...report, models: { extract: AI_MODEL_EXTRACT, generate: AI_MODEL_GENERATE } };

await mkdir('reports', { recursive: true });
const file = `reports/eval-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.json`;
await writeFile(file, JSON.stringify(output, null, 2));

console.log(JSON.stringify({ ...output, failures: report.failures.length }, null, 2));
console.log(`Relatório: packages/ai-evals/${file}`);
if (report.failedChecks.length > 0) {
  console.error(`Reprovou em: ${report.failedChecks.join(', ')}`);
  process.exit(1);
}
console.log('Aprovado.');
