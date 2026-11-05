import type { ConsentPurpose, ConsentRecord } from '../../domain/consent';

export interface ConsentRepository {
  history(userId: string): Promise<ConsentRecord[]>;
  append(
    userId: string,
    record: { purpose: ConsentPurpose; version: string; granted: boolean },
  ): Promise<void>;
}
