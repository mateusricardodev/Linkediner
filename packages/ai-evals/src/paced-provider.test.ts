import { describe, expect, it, vi } from 'vitest';
import type { AiProvider, GenerateStructuredRequest } from '@linkediner/core/ai';
import { AppError } from '@linkediner/core/shared';
import { PacedProvider } from './paced-provider';

const failure = (providerStatus: number) =>
  new AppError('DEPENDENCY_UNAVAILABLE', 'falhou', { providerStatus });
const req = {} as GenerateStructuredRequest<unknown>;

function setup(generateStructured: AiProvider['generateStructured']) {
  let clock = 0;
  const sleeps: number[] = [];
  const provider = new PacedProvider(
    { id: 'teste', generateStructured, embed: vi.fn() },
    {
      minIntervalMs: 4000,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    },
  );
  return { provider, sleeps };
}

describe('PacedProvider', () => {
  it('espaça as chamadas', async () => {
    const { provider, sleeps } = setup(vi.fn().mockResolvedValue({}));
    await provider.generateStructured(req);
    await provider.generateStructured(req);
    expect(sleeps).toEqual([4000]);
  });

  it.each([429, 503])('repete o erro temporário %i e conta no relatório', async (status) => {
    const call = vi.fn().mockRejectedValueOnce(failure(status)).mockResolvedValue({ ok: true });
    const { provider } = setup(call);
    await expect(provider.generateStructured(req)).resolves.toEqual({ ok: true });
    expect(call).toHaveBeenCalledTimes(2);
    expect(provider.retries).toBe(1);
  });

  it('não repete um defeito, como esquema recusado', async () => {
    const call = vi.fn().mockRejectedValue(failure(400));
    const { provider } = setup(call);
    await expect(provider.generateStructured(req)).rejects.toThrow('falhou');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('desiste depois de algumas tentativas', async () => {
    const call = vi.fn().mockRejectedValue(failure(429));
    const { provider } = setup(call);
    await expect(provider.generateStructured(req)).rejects.toThrow('falhou');
    expect(call).toHaveBeenCalledTimes(4);
  });
});
