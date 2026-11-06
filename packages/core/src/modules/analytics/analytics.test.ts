import { describe, expect, it, vi } from 'vitest';
import { ProductEvents, TrackingAuditLog } from './application/product-events';
import { eventsFromAudit } from './domain/events';

const USER = 'u1';

describe('eventos a partir da auditoria', () => {
  it('a maioria das ações não vira evento', () => {
    expect(eventsFromAudit({ actorType: 'user', action: 'session.created' })).toEqual([]);
    expect(eventsFromAudit({ actorType: 'user', action: 'account.purged' })).toEqual([]);
  });

  it('só propriedades da lista saem da auditoria', () => {
    const [event] = eventsFromAudit({
      actorType: 'system',
      action: 'material.generated',
      metadata: { kind: 'cover_letter', grounded: 3, email: 'pessoa@example.com' },
    });
    expect(event).toEqual({ name: 'material_generated', properties: { kind: 'cover_letter' } });
  });

  it('o envio manual também conclui a pendência', () => {
    const names = eventsFromAudit({ actorType: 'user', action: 'application.sent' }).map(
      (e) => e.name,
    );
    expect(names).toEqual(['application_sent', 'manual_task_completed']);
  });

  it('só o resultado de entrevista conta como entrevista', () => {
    const names = (outcome: string) =>
      eventsFromAudit({
        actorType: 'user',
        action: 'application.outcome',
        metadata: { outcome },
      }).map((e) => e.name);
    expect(names('interview_received')).toEqual([
      'application_outcome_reported',
      'interview_reported',
    ]);
    expect(names('rejected')).toEqual(['application_outcome_reported']);
  });
});

describe('registro dos eventos', () => {
  it('uma falha nas métricas não derruba o fluxo', async () => {
    const onError = vi.fn();
    const events = new ProductEvents(
      {
        insert: async () => {
          throw new Error('banco fora do ar');
        },
      },
      onError,
    );
    await expect(events.track(USER, [{ name: 'job_viewed' }])).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('a auditoria grava primeiro e continua obrigatória', async () => {
    const order: string[] = [];
    const log = new TrackingAuditLog(
      {
        record: async () => {
          order.push('auditoria');
        },
      },
      {
        track: async () => {
          order.push('evento');
        },
      },
    );
    await log.record({ actorType: 'user', actorId: USER, action: 'job.imported' });
    expect(order).toEqual(['auditoria', 'evento']);

    const track = vi.fn();
    const failing = new TrackingAuditLog(
      {
        record: async () => {
          throw new Error('auditoria fora do ar');
        },
      },
      { track },
    );
    await expect(
      failing.record({ actorType: 'user', actorId: USER, action: 'job.imported' }),
    ).rejects.toThrow();
    expect(track).not.toHaveBeenCalled();
  });

  it('sem ator, não há evento', async () => {
    const track = vi.fn();
    const log = new TrackingAuditLog({ record: async () => {} }, { track });
    await log.record({ actorType: 'system', action: 'job.imported' });
    expect(track).not.toHaveBeenCalled();
  });
});
