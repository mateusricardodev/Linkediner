import { describe, expect, it } from 'vitest';
import {
  APPLICATION_STATES,
  assertTransition,
  buildDashboard,
  canTransition,
  TRANSITIONS,
  type Application,
  type ApplicationState,
} from './application';

/** Estados alcançáveis a partir do início sem passar por `blocked`. */
function reachable(start: ApplicationState, blocked: ApplicationState): Set<ApplicationState> {
  const seen = new Set<ApplicationState>([start]);
  const queue = [start];
  while (queue.length) {
    const state = queue.pop()!;
    for (const next of Object.keys(TRANSITIONS[state]) as ApplicationState[]) {
      if (next !== blocked && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

describe('máquina de estados', () => {
  it('tem os 14 estados, e todos têm uma entrada na tabela', () => {
    expect(APPLICATION_STATES).toHaveLength(14);
    for (const state of APPLICATION_STATES) expect(TRANSITIONS[state]).toBeDefined();
  });

  it('nenhum caminho chega ao envio sem passar pela aprovação', () => {
    for (const start of ['recommended', 'saved'] as const) {
      const withoutApproval = reachable(start, 'approved');
      for (const state of ['sending', 'sent', 'manual_action_required'] as const) {
        expect(withoutApproval.has(state)).toBe(false);
      }
    }
  });

  it('só a própria pessoa aprova', () => {
    expect(canTransition('awaiting_approval', 'approved', 'user')).toBe(true);
    expect(canTransition('awaiting_approval', 'approved', 'system')).toBe(false);
    expect(canTransition('awaiting_approval', 'approved', 'source')).toBe(false);
    for (const state of APPLICATION_STATES) {
      if (state !== 'awaiting_approval')
        expect(canTransition(state, 'approved', 'user')).toBe(false);
    }
  });

  it('o sistema só envia a partir de aprovada, ou ao tentar de novo depois de uma falha', () => {
    const entradas = APPLICATION_STATES.filter((s) => TRANSITIONS[s].sending);
    expect(entradas).toEqual(['approved', 'failed']);
    expect(canTransition('approved', 'sending', 'user')).toBe(false);
  });

  it('o sistema não encerra nem recusa uma candidatura em nome da pessoa', () => {
    for (const state of APPLICATION_STATES) {
      expect(canTransition(state, 'closed', 'system')).toBe(false);
      expect(canTransition(state, 'rejected', 'system')).toBe(false);
    }
  });

  it('encerrada é um estado final', () => {
    expect(Object.keys(TRANSITIONS.closed)).toEqual([]);
  });

  it('transição inválida traz um código estável', () => {
    expect(() => assertTransition('saved', 'sent', 'user')).toThrow(
      expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
    );
  });
});

describe('buildDashboard', () => {
  const app = (id: string, state: ApplicationState, o: Partial<Application> = {}): Application => ({
    id,
    jobId: id,
    job: { title: id, company: null, applyUrl: null },
    state,
    resumeId: null,
    submissionMode: null,
    submittedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...o,
  });

  it('conta por estado e separa o que precisa de atenção, com o mais urgente primeiro', () => {
    const dashboard = buildDashboard([
      app('a', 'in_review'),
      app('b', 'manual_action_required'),
      app('c', 'saved'),
      app('d', 'awaiting_approval'),
      app('e', 'sent', { submittedAt: new Date(1) }),
      app('f', 'interview_received', { submittedAt: new Date(1) }),
    ]);
    expect(dashboard.total).toBe(6);
    expect(dashboard.counts).toMatchObject({ saved: 1, sent: 1, in_review: 1 });
    expect(dashboard.needsAttention.map((x) => x.id)).toEqual(['b', 'd', 'a']);
    expect(dashboard.sent).toBe(2);
    expect(dashboard.interviews).toBe(1);
  });

  it('rejeição e encerramento continuam contando como candidatura enviada', () => {
    const dashboard = buildDashboard([
      app('a', 'rejected', { submittedAt: new Date(1) }),
      app('b', 'closed', { submittedAt: new Date(1) }),
      app('c', 'closed'),
    ]);
    expect(dashboard.sent).toBe(2);
  });
});
