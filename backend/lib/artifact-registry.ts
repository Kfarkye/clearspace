import { Spanner } from '@google-cloud/spanner';
import { Storage } from '@google-cloud/storage';
import { randomUUID, createHash } from 'crypto';
import { Readable } from 'stream';

// Singleton instances to prevent connection exhaustion in serverless environments
let spannerInstance: Spanner;
let storageInstance: Storage;

export interface ArtifactMetadata {
  id: string;
  type: 'html' | 'code' | 'json';
  checksum: string;
  createdAt: Date;
  bucketUri: string;
}

export class ArtifactRegistry {
  private database: any;
  private bucketName: string;
  private storage: Storage;

  constructor(projectId: string, instanceId: string, databaseId: string, bucketName: string) {
    if (!spannerInstance) spannerInstance = new Spanner({ projectId });
    if (!storageInstance) storageInstance = new Storage({ projectId });
    
    this.storage = storageInstance;
    this.database = spannerInstance.instance(instanceId).database(databaseId);
    this.bucketName = bucketName;
  }

  public async publishArtifact(content: string, type: ArtifactMetadata['type']): Promise<string> {
    const artifactId = `art_${randomUUID().replace(/-/g, '')}`;
    const fileName = `artifacts/${artifactId}.${type}`;
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(fileName);
    const checksum = createHash('sha256').update(content).digest('hex');

    try {
      await file.save(content, {
        resumable: false,
        metadata: { contentType: this.getContentType(type) },
      });

      const table = this.database.table('ArtifactRegistry');
      await table.insert({
        ArtifactId: artifactId,
        Type: type,
        Checksum: checksum,
        CreatedAt: Spanner.commitTimestamp(),
        BucketUri: `gs://${this.bucketName}/${fileName}`,
      });

      return artifactId;
    } catch (error) {
      await file.delete({ ignoreNotFound: true }).catch(() => {});
      throw new Error(`[AURA] Artifact persistence failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  public async getArtifactStream(artifactId: string): Promise<{ stream: Readable, contentType: string } | null> {
    try {
      // Strong consistency required for read-after-write guarantees on newly generated artifacts
      const [rows] = await this.database.run({
        sql: `SELECT BucketUri, Type FROM ArtifactRegistry WHERE ArtifactId = @artifactId`,
        params: { artifactId },
        json: true,
      });

      if (!rows.length) return null;

      const bucketUri = rows[0].BucketUri;
      const type = rows[0].Type;
      const fileName = bucketUri.replace(`gs://${this.bucketName}/`, '');
      
      const file = this.storage.bucket(this.bucketName).file(fileName);
      const [exists] = await file.exists();
      if (!exists) return null;

      return {
        stream: file.createReadStream(),
        contentType: this.getContentType(type)
      };
    } catch (error) {
      return null;
    }
  }

  private getContentType(type: ArtifactMetadata['type']): string {
    const types = {
      html: 'text/html; charset=utf-8',
      code: 'text/plain; charset=utf-8',
      json: 'application/json; charset=utf-8'
    };
    return types[type] || 'text/plain; charset=utf-8';
  }
}
