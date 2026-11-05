// Gera src/generated/tokens.css a partir de tokens/*.json (fonte da verdade).
// Tema claro em :root; tema escuro via [data-theme="dark"] e prefers-color-scheme.
import StyleDictionary from 'style-dictionary';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';

const tmp = '.tokens-tmp/';
const build = async (theme, selector, filter) => {
  const sd = new StyleDictionary({
    source: ['tokens/base.json', `tokens/${theme}.json`],
    log: { verbosity: 'silent', warnings: 'disabled' },
    platforms: {
      css: {
        transformGroup: 'css',
        buildPath: tmp,
        files: [
          {
            destination: `${theme}.css`,
            format: 'css/variables',
            filter,
            options: { selector, outputReferences: false },
          },
        ],
      },
    },
  });
  await sd.buildAllPlatforms();
  return readFile(tmp + `${theme}.css`, 'utf8');
};
const isSemanticColor = (t) => t.path[0] === 'color';
const light = await build('light', ':root', undefined);
const dark = await build('dark', ':root[data-theme="dark"]', isSemanticColor);
const darkBody = dark.slice(dark.indexOf('{') + 1, dark.lastIndexOf('}'));
const out = `/* Gerado por scripts/build-tokens.mjs. Não edite à mão: altere packages/ui/tokens/*.json. */\n${light.replace(/\/\*\*[\s\S]*?\*\/\n/, '')}\n${dark.replace(/\/\*\*[\s\S]*?\*\/\n/, '')}\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {${darkBody}}\n}\n`;
await mkdir('src/generated', { recursive: true });
await writeFile('src/generated/tokens.css', out);
await rm(tmp, { recursive: true, force: true });
console.log('tokens.css gerado');
