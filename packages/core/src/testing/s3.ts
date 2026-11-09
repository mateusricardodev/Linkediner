import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { S3ObjectStorage } from '../modules/documents/infrastructure/s3-object-storage';

/**
 * Para o container sem derrubar a suíte. Com a máquina carregada, o Docker pode recusar a remoção
 * porque o container ainda está parando (HTTP 409). Os testes já terminaram: o que sobrar, o Ryuk do
 * Testcontainers remove ao fim da execução.
 */
async function stopQuietly(container: { stop(options?: { timeout?: number }): Promise<unknown> }) {
  try {
    await container.stop({ timeout: 10_000 });
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    const message = error instanceof Error ? error.message : '';
    if (
      status !== 409 &&
      !/container is running|removal of container .* is already in progress/i.test(message)
    ) {
      throw error;
    }
  }
}

/** Sobe um S3 local (SeaweedFS) em container para testes de integração. */
export async function startTestS3(bucket = 'test-documents') {
  const container: StartedTestContainer = await new GenericContainer('chrislusf/seaweedfs:3.97')
    .withCommand(['server', '-dir=/data', '-s3', '-s3.port=8333'])
    .withExposedPorts(8333)
    .withWaitStrategy(Wait.forListeningPorts())
    .withStartupTimeout(90_000)
    .start();
  const config = {
    bucket,
    region: 'us-east-1',
    endpoint: `http://${container.getHost()}:${container.getMappedPort(8333)}`,
    accessKeyId: 'test',
    secretAccessKey: 'test-secret',
  };
  const storage = new S3ObjectStorage(config);
  // O S3 do SeaweedFS pode levar alguns segundos depois que a porta abre.
  for (let attempt = 0; ; attempt++) {
    try {
      await storage.ensureBucket();
      break;
    } catch (error) {
      if (attempt > 30) throw error;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return { storage, config, stop: () => stopQuietly(container) };
}
