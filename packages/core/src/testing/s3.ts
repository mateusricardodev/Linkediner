import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { S3ObjectStorage } from '../modules/documents/infrastructure/s3-object-storage';

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
  return { storage, config, stop: () => container.stop() };
}
