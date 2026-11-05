import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FakeAiProvider, type VersionedPrompt } from '../../..';

const prompt: VersionedPrompt = { id: 'test.echo', version: 1, system: 'sys', render: () => 'x' };
const schema = z.object({ skills: z.array(z.string()) });

describe('FakeAiProvider', () => {
  it('devolve a resposta configurada validada pelo esquema e registra a versão do prompt', async () => {
    const ai = new FakeAiProvider().respond('extract_profile', () => ({ skills: ['TypeScript'] }));
    const res = await ai.generateStructured({
      task: 'extract_profile',
      prompt,
      promptInput: {},
      schema,
    });
    expect(res.data.skills).toEqual(['TypeScript']);
    expect(res.usage).toMatchObject({ provider: 'fake', promptId: 'test.echo', promptVersion: 1 });
  });

  it('rejeita resposta fora do esquema', async () => {
    const ai = new FakeAiProvider().respond('extract_profile', () => ({ skills: 'não é lista' }));
    await expect(
      ai.generateStructured({ task: 'extract_profile', prompt, promptInput: {}, schema }),
    ).rejects.toThrow(/fora do esquema/);
  });

  it('gera embeddings determinísticos', async () => {
    const ai = new FakeAiProvider(4);
    const a = await ai.embed(['react']);
    const b = await ai.embed(['react']);
    expect(a.vectors).toEqual(b.vectors);
    expect(a.dims).toBe(4);
  });
});
