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
      <div className="w-full max-w-4xl bg-white border border-charcoal/10 shadow-sm rounded-xl p-8 font-sans flex flex-col items-center justify-center min-h-[240px]">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-charcoal/40 rounded-full animate-thinking-dot"></span>
          <span className="w-1.5 h-1.5 bg-charcoal/40 rounded-full animate-thinking-dot delay-75"></span>
          <span className="w-1.5 h-1.5 bg-charcoal/40 rounded-full animate-thinking-dot delay-150"></span>
        </div>
        <span className="text-charcoal/60 font-mono text-xs uppercase tracking-widest mt-4">Establishing Connection</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="w-full max-w-4xl bg-white border border-charcoal/10 shadow-sm rounded-xl p-8 font-sans flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 bg-rose-500 rounded-full animate-breathe"></span>
          <h2 className="text-charcoal text-lg font-medium tracking-tight">Error Loading Data</h2>
        </div>
        <p className="text-charcoal/70 text-sm font-mono bg-alabaster p-3 border border-charcoal/10 rounded-lg">{error}</p>
        <button 
          onClick={retry} 
          className="self-start bg-white border border-charcoal/10 text-charcoal py-2 px-6 rounded-lg font-medium text-sm shadow-sm hover:bg-alabaster hover:border-charcoal/20 transition-all duration-300 ease-out mt-2 outline-none active:scale-[0.98]"
        >
          Initialize Retry Sequence
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl bg-white border border-charcoal/10 shadow-sm rounded-xl p-8 font-sans flex flex-col gap-6">
      <header className="flex justify-between items-end border-b border-charcoal/10 pb-4">
        <h1 className="text-charcoal text-2xl font-medium tracking-tight">Telemetry Active</h1>
        <span className="text-emerald-600 text-[10px] font-mono uppercase tracking-wider">Connected</span>
      </header>
      <div className="flex flex-col gap-3">
        {data?.map(item => (
          <div key={item.id} className="bg-alabaster border border-charcoal/10 rounded-lg p-4 flex justify-between items-center hover:border-charcoal/20 transition-colors duration-300">
            <span className="text-charcoal text-sm font-medium">{item.value}</span>
            <span className="text-charcoal/60 font-mono text-xs">{item.id}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
