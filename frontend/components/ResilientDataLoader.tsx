import React from 'react';
import { z } from 'zod';
import { useResilientFetch } from '../hooks/useResilientFetch';

const PayloadSchema = z.array(z.object({
  id: z.string(),
  value: z.string()
}));

type Payload = z.infer<typeof PayloadSchema>;

export const ResilientDataLoader: React.FC = () => {
  const { data, status, error, retry } = useResilientFetch<Payload>('/api/v1/system/metrics', PayloadSchema);

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="w-full max-w-4xl bg-charcoal border border-white/5 shadow-glass p-8 font-sans flex flex-col items-center justify-center min-h-[240px]">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-sand rounded-full animate-thinking-dot"></span>
          <span className="w-1.5 h-1.5 bg-sand rounded-full animate-thinking-dot delay-75"></span>
          <span className="w-1.5 h-1.5 bg-sand rounded-full animate-thinking-dot delay-150"></span>
        </div>
        <span className="text-taupe font-mono text-xs uppercase tracking-widest mt-4">Establishing Secure Connection</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="w-full max-w-4xl bg-ink border border-clay/50 shadow-glass p-8 font-sans flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 bg-clay rounded-full animate-breathe"></span>
          <h2 className="text-sand text-lg font-medium tracking-tight">System Fault Detected</h2>
        </div>
        <p className="text-taupe text-sm font-mono bg-white/5 p-3 border border-white/5">{error}</p>
        <button 
          onClick={retry} 
          className="self-start bg-white/5 border border-white/5 text-sand py-2 px-6 font-medium text-sm shadow-btn hover:shadow-glass-hover transition-all duration-300 ease-out mt-2"
        >
          Initialize Retry Sequence
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl bg-charcoal border border-white/5 shadow-glass p-8 font-sans flex flex-col gap-6">
      <header className="flex justify-between items-end border-b border-white/5 pb-4">
        <h1 className="text-sand text-2xl font-medium tracking-tight">Telemetry Active</h1>
        <span className="text-emerald text-[10px] font-mono uppercase tracking-wider">Connected</span>
      </header>
      <div className="flex flex-col gap-3">
        {data?.map(item => (
          <div key={item.id} className="bg-ink border border-white/5 p-4 flex justify-between items-center hover:border-white/10 transition-colors duration-300">
            <span className="text-sand text-sm font-medium">{item.value}</span>
            <span className="text-taupe font-mono text-xs">{item.id}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
