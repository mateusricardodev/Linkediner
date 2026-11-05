import type { ExtractJobPayload } from '../domain/extraction-rules';

/** Obtém o texto de um arquivo. Lança erro se o arquivo não puder ser lido. */
export interface TextExtractor {
  extract(mimeType: string, bytes: Uint8Array): Promise<string>;
}

/** Enfileira a extração. O payload leva só IDs. */
export interface ExtractionQueue {
  enqueue(payload: ExtractJobPayload): Promise<void>;
}
