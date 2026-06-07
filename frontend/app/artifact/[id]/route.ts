import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { ArtifactRegistry } from '../../../../../backend/lib/artifact-registry';

// MUST use Node.js runtime. GCP gRPC SDKs (Spanner) will crash in Edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Initialize registry (singleton pattern maintained internally)
const registry = new ArtifactRegistry(
  process.env.GCP_PROJECT_ID || 'clearspace-dev',
  process.env.SPANNER_INSTANCE_ID || 'aura-core',
  process.env.SPANNER_DATABASE_ID || 'sports-ledger',
  process.env.GCS_BUCKET_NAME || 'clearspace-artifacts'
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js App Router constraint: params must be awaited
    const { id: artifactId } = await params;

    if (!artifactId?.startsWith('art_')) {
      return NextResponse.json(
        { error: 'Invalid Artifact ID format' },
        { status: 400 }
      );
    }

    const artifact = await registry.getArtifactStream(artifactId);
    
    if (!artifact?.stream) {
      return NextResponse.json(
        { error: 'Artifact Not Found' },
        { status: 404 }
      );
    }

    // Native bridge: enforces backpressure and handles teardown on client abort
    const webStream = Readable.toWeb(artifact.stream) as ReadableStream;

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
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
