import { describe, expect, it, vi } from 'vitest';
import { waitUntilReady } from './wait-until-ready';

function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    sleep: async (ms: number) => {
      time += ms;
    },
  };
}

describe('waitUntilReady', () => {
  it('repete até a tarefa dar certo', async () => {
    const clock = fakeClock();
    const onRetry = vi.fn();
    let calls = 0;
    const result = await waitUntilReady(
      async () => {
        calls++;
        if (calls < 3) throw new Error('ainda não');
        return 'pronto';
      },
      { timeoutMs: 10_000, intervalMs: 1_000, onRetry, ...clock },
    );
    expect(result).toBe('pronto');
    expect(calls).toBe(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('desiste com o último erro quando o prazo acaba', async () => {
    const clock = fakeClock();
    let calls = 0;
    await expect(
      waitUntilReady(
        async () => {
          calls++;
          throw new Error(`falha ${calls}`);
        },
        { timeoutMs: 3_000, intervalMs: 1_000, ...clock },
      ),
    ).rejects.toThrow('falha 4');
    expect(calls).toBe(4);
  });
});
