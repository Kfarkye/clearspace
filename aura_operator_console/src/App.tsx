import { useEffect, useState } from 'react';
import { ShieldCheck, Database, ListChecks } from '@phosphor-icons/react';

export default function App() {
  const [registry, setRegistry] = useState<any[]>([]);
  const [traces, setTraces] = useState<any[]>([]);
  const [policy, setPolicy] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [regRes, trRes, polRes] = await Promise.all([
          fetch('http://localhost:8080/api/internal/mcp/registry').then(r => r.json()),
          fetch('http://localhost:8080/api/internal/mcp/traces').then(r => r.json()),
          fetch('http://localhost:8080/api/internal/mcp/policy').then(r => r.json())
        ]);
        if (regRes.status === 'ok') setRegistry(regRes.data);
        if (trRes.status === 'ok') setTraces(trRes.data);
        if (polRes.status === 'ok') setPolicy(polRes.data);
      } catch (e) {
        console.error('Failed to fetch control plane data', e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="p-8 text-zinc-400">Loading Control Plane...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-[#000000] text-slate-200 p-8 overflow-y-auto space-y-8 no-scrollbar font-sans">
      <div className="flex items-center gap-3 mb-4">
        <ShieldCheck size={28} weight="fill" className="text-emerald-500" />
        <h1 className="text-2xl font-bold text-white tracking-tight">AURA Operator Console</h1>
      </div>

      {/* POLICY GUARD */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <ListChecks size={20} className="text-zinc-400" />
          <h2 className="text-lg font-medium text-white">Policy Guard Configuration</h2>
        </div>
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-5 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(policy).map(([key, value]) => (
              <div key={key} className="flex justify-between items-center p-3 bg-black/40 rounded-lg border border-white/[0.03]">
                <span className="text-sm text-zinc-300 font-mono">{key}</span>
                <span className={`text-xs px-2 py-1 rounded font-bold ${value ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                  {value ? 'ACTIVE' : 'DISABLED'}
                </span>
              </div>
            ))}
            {Object.keys(policy).length === 0 && (
              <div className="text-zinc-500 text-sm italic">No policy configuration loaded.</div>
            )}
          </div>
        </div>
      </section>

      {/* REGISTRY */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Database size={20} className="text-zinc-400" />
          <h2 className="text-lg font-medium text-white">MCP Registry</h2>
        </div>
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-black/40 text-zinc-500 border-b border-white/[0.05]">
                <th className="p-4 font-medium uppercase tracking-wider text-xs">Server</th>
                <th className="p-4 font-medium uppercase tracking-wider text-xs">Status</th>
              </tr>
            </thead>
            <tbody>
              {registry.map((server, i) => (
                <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                  <td className="p-4 font-mono text-slate-300">{server}</td>
                  <td className="p-4">
                    <span className="text-xs px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-full font-medium">Enabled</span>
                  </td>
                </tr>
              ))}
              {registry.length === 0 && (
                <tr>
                  <td colSpan={2} className="p-6 text-center text-zinc-500">No active servers found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* TRACE LEDGER */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <ListChecks size={20} className="text-zinc-400" />
          <h2 className="text-lg font-medium text-white">Trace Ledger</h2>
        </div>
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-black/40 text-zinc-500 border-b border-white/[0.05]">
                <th className="p-4 font-medium uppercase tracking-wider text-xs">Timestamp</th>
                <th className="p-4 font-medium uppercase tracking-wider text-xs">Trace ID</th>
                <th className="p-4 font-medium uppercase tracking-wider text-xs">Actor / Account</th>
                <th className="p-4 font-medium uppercase tracking-wider text-xs">Operation</th>
                <th className="p-4 font-medium uppercase tracking-wider text-xs">Decision / Tier</th>
                <th className="p-4 font-medium uppercase tracking-wider text-xs">Result</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs text-zinc-300">
              {traces.map((t, i) => (
                <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                  <td className="p-4">{new Date(t.timestamp).toLocaleTimeString()}</td>
                  <td className="p-4 text-zinc-500" title={t.traceId}>{t.traceId?.substring(0,8)}...</td>
                  <td className="p-4">
                    <div className="text-slate-300">{t.actorRef}</div>
                    <div className="text-zinc-600 truncate max-w-[120px]" title={t.accountRef}>{t.accountRef}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-blue-400">{t.serverName}</div>
                    <div className="text-zinc-400">{t.method} {t.operation ? `(${t.operation})` : ''}</div>
                  </td>
                  <td className="p-4">
                    <div className={t.policyDecision === 'ALLOW' ? 'text-emerald-400' : 'text-red-400'}>
                      {t.policyDecision}
                    </div>
                    <div className="text-zinc-500">{t.riskTier}</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${t.resultShape === 'ERROR' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {t.resultShape || 'N/A'} {t.latencyMs ? `(${t.latencyMs}ms)` : ''}
                    </span>
                  </td>
                </tr>
              ))}
              {traces.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-zinc-500">No traces recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
