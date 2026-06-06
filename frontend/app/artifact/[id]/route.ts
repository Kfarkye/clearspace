import { NextRequest, NextResponse } from 'next/server';
import { ArtifactRegistry } from '../../../../../backend/lib/artifact-registry';

// MUST use Node.js runtime. GCP gRPC SDKs (Spanner) will crash in Next.js Edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Initialize registry (uses singletons internally)
const registry = new ArtifactRegistry(
  process.env.GCP_PROJECT_ID || 'clearspace-dev',
  process.env.SPANNER_INSTANCE_ID || 'aura-core',
  process.env.SPANNER_DATABASE_ID || 'sports-ledger',
  process.env.GCS_BUCKET_NAME || 'clearspace-artifacts'
);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const artifactId = params.id;
    if (!artifactId || !artifactId.startsWith('art_')) {
      return new NextResponse('Invalid Artifact ID', { status: 400 });
    }

    const artifact = await registry.getArtifactStream(artifactId);
    
    if (!artifact) {
      return new NextResponse('Artifact Not Found', { status: 404 });
    }

    // Convert Node.js Readable stream to Web ReadableStream for Next.js response
    const webStream = new ReadableStream({
      start(controller) {
        artifact.stream.on('data', (chunk) => controller.enqueue(chunk));
        artifact.stream.on('end', () => controller.close());
        artifact.stream.on('error', (err) => controller.error(err));
      }
    });

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': artifact.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff'
      },
    });
  } catch (error) {
    console.error('[AURA] Artifact Hydration Fault:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
