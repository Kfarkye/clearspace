import { useEffect } from 'react';

export interface AuraIPCCommand {
  type: 'AURA_EXECUTE';
  domain: 
    | 'Sports Specialist' 
    | 'Markets Specialist' 
    | 'Work Specialist' 
    | 'Music Specialist' 
    | 'Crypto Specialist' 
    | 'Automation Specialist' 
    | 'Design Specialist' 
    | 'Code Specialist';
  payload: Record<string, any>;
  artifactId: string;
}

/**
 * AURA IPC BRIDGE
 * Listens for commands emitted by sandboxed artifact iframes via window.postMessage.
 * Example iframe usage: 
 * window.parent.postMessage({ type: 'AURA_EXECUTE', domain: 'Crypto Specialist', payload: { action: 'SWAP', pair: 'ETH/USDC' } }, '*');
 */
export const useArtifactIPC = (onRouteCommand: (command: AuraIPCCommand) => void) => {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate payload structure to prevent arbitrary execution from unauthorized origins
      const data = event.data as Partial<AuraIPCCommand>;
      
      if (data?.type === 'AURA_EXECUTE' && data.domain && data.payload) {
        console.log(`[AURA IPC] Intercepted payload for ${data.domain} from ${data.artifactId || 'anonymous artifact'}`);
        
        // Route the intercepted payload directly to AURA's backend specialist models
        onRouteCommand(data as AuraIPCCommand);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onRouteCommand]);
};
