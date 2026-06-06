import { useState, useEffect, useCallback } from 'react';
import { z } from 'zod';

export interface FetchState<T> { 
  data: T | null; 
  status: 'idle' | 'loading' | 'success' | 'error'; 
  error: string | null; 
}

export function useResilientFetch<T>(url: string, schema?: z.ZodSchema<T>) {
  const [state, setState] = useState<FetchState<T>>({ data: null, status: 'idle', error: null });

  const execute = useCallback(async (signal: AbortSignal) => {
    setState(p => ({ ...p, status: 'loading', error: null }));
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      
      // Strict runtime boundary validation if a schema is provided
      const validatedData = schema ? schema.parse(data) : (data as T);
      
      setState({ data: validatedData, status: 'success', error: null });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (err instanceof z.ZodError) {
         setState({ data: null, status: 'error', error: 'Malformed API payload: ' + err.issues[0].message });
         return;
      }
      setState({ data: null, status: 'error', error: err.message || 'Network fault' });
    }
  }, [url, schema]);

  useEffect(() => {
    const controller = new AbortController();
    execute(controller.signal);
    return () => controller.abort();
  }, [execute]);

  return { ...state, retry: () => execute(new AbortController().signal) };
}
