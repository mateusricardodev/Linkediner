import { v7 } from 'uuid';

/** IDs UUID v7: únicos e ordenáveis por tempo (docs/arquitetura/03-dados.md). */
export const newId = (): string => v7();
