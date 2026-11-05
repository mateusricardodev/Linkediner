import type { Job, JobFields, NewJob } from '../../domain/job';

/** Toda operação usa o contexto do usuário dono (RLS). */
export interface JobRepository {
  /** Devolve a vaga criada, ou null se o usuário já tiver importado o mesmo texto. */
  insert(userId: string, job: NewJob): Promise<Job | null>;
  findByHash(userId: string, dedupeHash: string): Promise<Job | null>;
  find(userId: string, id: string): Promise<Job | null>;
  list(userId: string): Promise<Job[]>;
  saveFields(userId: string, id: string, fields: JobFields): Promise<void>;
  markStructuring(userId: string, id: string): Promise<void>;
  markFailed(userId: string, id: string, failureCode: string): Promise<void>;
  delete(userId: string, id: string): Promise<boolean>;
}

/** Enfileira a estruturação. O payload leva só IDs. */
export interface JobQueue {
  enqueue(payload: { userId: string; jobId: string }): Promise<void>;
}
