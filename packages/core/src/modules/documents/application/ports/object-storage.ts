/** Storage de arquivos compatível com S3 (R2, S3, SeaweedFS). O bucket é sempre privado. */
export interface ObjectStorage {
  /** URL temporária para o navegador enviar o arquivo direto ao storage, com tipo e tamanho assinados. */
  presignUpload(
    key: string,
    opts: { contentType: string; contentLength: number; expiresInSeconds: number },
  ): Promise<string>;
  /** URL temporária de leitura (download pelo próprio usuário). */
  presignDownload(
    key: string,
    opts: { expiresInSeconds: number; fileName: string },
  ): Promise<string>;
  head(key: string): Promise<{ sizeBytes: number; contentType: string | undefined } | null>;
  getBytes(key: string): Promise<Uint8Array>;
  putBytes(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Apaga todos os objetos sob um prefixo (ex.: tudo de um usuário na exclusão de conta). */
  deletePrefix(prefix: string): Promise<number>;
}
