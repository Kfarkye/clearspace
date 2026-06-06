import React, { useEffect, useState } from 'react';

interface ArtifactLedgerCardProps {
  artifactId: string;
  type: 'html' | 'code' | 'json';
}

/**
 * AURA ARTIFACT LEDGER CARD
 * Intercepts and hydrates deterministic artifact URLs from the execution stream.
 */
export const ArtifactLedgerCard: React.FC<ArtifactLedgerCardProps> = ({ artifactId, type }) => {
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    const hydrateArtifact = async () => {
      try {
        // Fetch from the Node.js streaming route provisioned in the previous step
        const response = await fetch(`/artifact/${artifactId}`);
        if (!response.ok) throw new Error('Hydration fault');
        
        const data = await response.text();
        setContent(data);
      } catch (error) {
        // Silent failure: Do not pollute the chat stream with broken asset frames
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    };

    hydrateArtifact();
  }, [artifactId]);

  if (hasError) return null;

  return (
    <div className="w-full bg-charcoal border border-white/5 shadow-glass p-4 my-4 flex flex-col gap-3">
      {/* Header: Metadata & Status */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <span className="font-mono text-xs text-taupe uppercase tracking-widest">
          Asset Ledger // {artifactId}
        </span>
        {isLoading && (
          <div className="flex gap-1 items-center">
            <span className="w-1.5 h-1.5 bg-emerald animate-thinking-dot" />
            <span className="w-1.5 h-1.5 bg-emerald animate-thinking-dot delay-75" />
            <span className="w-1.5 h-1.5 bg-emerald animate-thinking-dot delay-150" />
          </div>
        )}
      </div>
      
      {/* Content: Hydrated Payload */}
      <div className="relative w-full overflow-hidden">
        {isLoading ? (
          <div className="w-full h-32 bg-clay/10 animate-shimmer" />
        ) : type === 'html' ? (
          <iframe 
            srcDoc={`
              <script>
                // Inject AURA Context into the Artifact Sandbox
                window.AURA_ARTIFACT_ID = "${artifactId}";
                window.executeAuraCommand = (domain, payload) => {
                  window.parent.postMessage({ 
                    type: 'AURA_EXECUTE', 
                    domain, 
                    payload, 
                    artifactId: "${artifactId}" 
                  }, '*');
                };
              </script>
              ${content || ''}
            `} 
            className="w-full h-96 border-none bg-ink shadow-inset"
            sandbox="allow-scripts allow-same-origin allow-popups"
            title={`Artifact ${artifactId}`}
          />
        ) : (
          <pre className="font-mono text-sm text-sand bg-ink p-4 overflow-x-auto shadow-inset">
            <code>{content}</code>
          </pre>
        )}
      </div>
    </div>
  );
};
