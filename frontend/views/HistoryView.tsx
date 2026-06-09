// ============================================================================
// HistoryView — Intelligence Archive (route: "/history")
//
// A masonry grid of visual snapshots representing miniaturized, inert 
// representations of the DOM state at the time of generation.
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SquaresFour, ListDashes, ArrowsOutSimple, ChatTeardropText } from '@phosphor-icons/react';
import { useAppContext } from '../context/AppContext';
import * as dataService from '../services/dataService';
import type { SpannerAsset } from '../types/persistence';

function relativeTime(dateString: string): string {
  const ms = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const getPayloadHtml = (asset: SpannerAsset) => {
  // Determine the raw HTML payload string for the iframe srcDoc.
  const raw = asset.payload?.text || asset.payload?.html || '';
  if (raw.includes('<!DOCTYPE html>')) return raw;
  
  // Fallback if it's not wrapped in the native fluid card
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        body { margin: 0; padding: 1.5rem; background: transparent; color: #EAEAEA; font-family: system-ui, sans-serif; font-size: 14px; }
      </style>
    </head>
    <body>${raw}</body>
    </html>
  `;
};

const getTypeFormat = (type: string) => {
  if (type.includes('BETTING')) return { color: 'text-[#F58426] bg-[#F58426]/10 border-[#F58426]/20', label: 'Market Analysis' };
  if (type.includes('SCOREBOARD')) return { color: 'text-blue-500 bg-blue-500/10 border-blue-500/20', label: 'Live Sports' };
  if (type.includes('WORKSPACE')) return { color: 'text-[#C45C5C] bg-[#C45C5C]/10 border-[#C45C5C]/20', label: 'Email & Calendar' };
  if (type.includes('SYNTHESIS')) return { color: 'text-purple-500 bg-purple-500/10 border-purple-500/20', label: 'Component Design' };
  return { color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', label: 'System Diagnostic' };
};

const parseDiagnostic = (asset: SpannerAsset) => {
  const raw = asset.payload?.text || asset.payload?.html || '';
  if (raw.trim().startsWith('{') && raw.trim().endsWith('}')) {
    try {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        let derivedTitle = asset.title;
        let derivedSummary = asset.summary;
        
        if (data.root_cause) {
          derivedTitle = typeof data.root_cause === 'string' ? `Fix: ${data.root_cause.split('.')[0]}` : 'Diagnostic Repair';
        } else if (data.intent) {
          derivedTitle = typeof data.intent === 'string' ? `Task: ${data.intent}` : 'System Task';
        } else {
          derivedTitle = 'System Diagnostic';
        }
        
        if (data.proposed_fix) {
          derivedSummary = typeof data.proposed_fix === 'string' ? data.proposed_fix : 'Applied automated patch to resolve diagnostic failure.';
        }
        
        return { isDiagnostic: true, title: derivedTitle, summary: derivedSummary };
      }
    } catch (e) {
      // Not JSON
    }
  }
  return { isDiagnostic: false, title: asset.title, summary: asset.summary };
};

// Extracted HistoryCard to handle individual mouse tracking for spotlight effect
const HistoryCard = ({ asset, index, view, handleRestore }: { asset: SpannerAsset, index: number, view: 'grid' | 'list', handleRestore: (asset: SpannerAsset) => void }) => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const diagnosticInfo = React.useMemo(() => parseDiagnostic(asset), [asset]);

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const displayTitle = diagnosticInfo.isDiagnostic ? diagnosticInfo.title : asset.title;
  const displaySummary = diagnosticInfo.isDiagnostic ? diagnosticInfo.summary : asset.summary;

  return (
    <motion.article 
      layout
      initial={{ opacity: 0, y: 20, filter: "blur(12px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 300, damping: 30 }}
      onClick={() => handleRestore(asset)}
      onMouseMove={handleMouseMove}
      className={`group relative bg-white dark:bg-[#080808] border border-clay/40 dark:border-white/5 rounded-[20px] overflow-hidden shadow-sm hover:shadow-xl dark:shadow-none dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] cursor-pointer flex transition-all duration-400 ease-out hover:border-clay/60 dark:hover:border-white/10 ${view === 'grid' ? 'flex-col' : 'flex-row items-center h-32'}`}
    >
      {/* ─── Spotlight Hover Effect ─────────────────────────────────────── */}
      <div 
        className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0"
        style={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.06), transparent 40%)`
        }}
      />
      {/* Light mode spotlight variant */}
      <div 
        className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0 dark:hidden"
        style={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(0,0,0,0.03), transparent 40%)`
        }}
      />

      {/* Subtle top-inner highlight for depth */}
      <div className="absolute inset-0 rounded-[20px] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] pointer-events-none transition-shadow duration-500 z-10" />

      {/* Visual Snapshot Window */}
      <div className={`relative bg-[#050505] overflow-hidden border-white/5 flex items-center justify-center z-10 ${view === 'grid' ? 'aspect-video border-b' : 'w-48 h-full border-r'}`}>
        
        {diagnosticInfo.isDiagnostic ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#080808] border-b border-white/5 pointer-events-none">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center mb-3">
              <ChatTeardropText size={20} weight="duotone" className="text-emerald-500/60" />
            </div>
            <span className="text-[11px] font-mono tracking-widest text-emerald-500/40 uppercase">Diagnostic</span>
          </div>
        ) : (
          <div className="absolute inset-0 w-[200%] h-[200%] origin-top-left transform scale-50 group-hover:scale-[0.52] transition-transform duration-500 pointer-events-none p-4">
            <iframe 
              srcDoc={getPayloadHtml(asset)}
              className="w-full h-full border-0 pointer-events-none rounded-xl"
              title={displayTitle}
              sandbox="allow-same-origin"
            />
          </div>
        )}
        
        {/* Glassmorphic Hover Overlay */}
        <div className="absolute inset-0 bg-alabaster/40 dark:bg-void/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 flex items-center justify-center z-10 transition-opacity duration-300">
          <span className="px-4 py-2 bg-white/80 dark:bg-white/10 border border-clay/40 dark:border-white/10 rounded-full text-xs font-medium text-ink dark:text-sand flex items-center gap-2 shadow-sm dark:shadow-glass transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
            <ArrowsOutSimple size={14} weight="bold" /> Restore
          </span>
        </div>
      </div>
      
      {/* Metadata */}
      <div className={`p-5 flex flex-col justify-between bg-white dark:bg-transparent relative z-10 ${view === 'grid' ? 'flex-1' : 'flex-1 h-full'}`}>
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2.5 py-1 text-[10px] font-mono font-semibold tracking-wider rounded-md border ${getTypeFormat(asset.type).color}`}>
              {getTypeFormat(asset.type).label}
            </span>
            <span className="text-[11px] font-mono text-charcoal/50 dark:text-taupe">{relativeTime(asset.createdAt)}</span>
          </div>
          <h3 className="text-[15px] font-semibold text-ink dark:text-sand truncate tracking-tight" title={displayTitle}>{displayTitle}</h3>
          {(view === 'list' || diagnosticInfo.isDiagnostic) && displaySummary && (
            <p className={`text-[13.5px] text-charcoal/60 dark:text-taupe mt-1.5 leading-relaxed ${view === 'grid' ? 'line-clamp-3' : 'line-clamp-2'}`}>{displaySummary}</p>
          )}
        </div>
      </div>
    </motion.article>
  );
};


export default function HistoryView() {
  const { loadConversation } = useAppContext();
  const navigate = useNavigate();
  const [assets, setAssets] = useState<SpannerAsset[]>([]);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [isLoading, setIsLoading] = useState(true);

  const fetchAssets = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await dataService.listAssets(50);
      setAssets(data || []);
    } catch (err) {
      console.error('[Archive] Failed to load:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const handleRestore = useCallback((asset: SpannerAsset) => {
    if (asset.sourceSessionId) {
      loadConversation(asset.sourceSessionId);
      navigate('/');
    }
  }, [loadConversation, navigate]);

  return (
    <div className="h-full flex flex-col p-6 md:p-12 overflow-y-auto relative transition-colors duration-500">
      
      {/* 1. Cinematic Film Grain Texture (Overlay) */}
      <div 
        className="fixed inset-0 opacity-[0.02] dark:opacity-[0.04] pointer-events-none z-50 mix-blend-overlay"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
      />

      {/* Deep ambient background mesh */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,0,0,0.02)_0%,transparent_100%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.015)_0%,transparent_100%)] pointer-events-none z-0 transition-colors duration-500" />

      <main className="w-full max-w-6xl mx-auto space-y-8 relative z-10 pt-4">
        
        {/* Header: Typographic Dominance */}
        <motion.header 
          initial={{ opacity: 0, y: -10, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="flex items-end justify-between border-b border-clay/30 dark:border-white/5 pb-8 mb-10"
        >
          <div>
            <h1 className="text-[32px] font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-ink to-ink/60 dark:from-white dark:to-white/50 pb-1">
              History
            </h1>
            <p className="text-[15px] text-charcoal/60 dark:text-white/40 mt-1.5 font-normal tracking-wide">
              Review past sessions and generated views.
            </p>
          </div>
          
          {/* View Toggles */}
          <div className="flex items-center gap-1 bg-white/50 dark:bg-[#080808] border border-clay/40 dark:border-white/5 p-1 rounded-xl shadow-sm">
            <button 
              onClick={() => setView('grid')} 
              className={`p-2 rounded-lg transition-colors ${view === 'grid' ? 'bg-white dark:bg-white/10 text-ink dark:text-sand shadow-sm' : 'text-charcoal/60 dark:text-taupe hover:text-ink dark:hover:text-sand'}`}
            >
              <SquaresFour size={18} weight={view === 'grid' ? "duotone" : "regular"} />
            </button>
            <button 
              onClick={() => setView('list')} 
              className={`p-2 rounded-lg transition-colors ${view === 'list' ? 'bg-white dark:bg-white/10 text-ink dark:text-sand shadow-sm' : 'text-charcoal/60 dark:text-taupe hover:text-ink dark:hover:text-sand'}`}
            >
              <ListDashes size={18} weight={view === 'list' ? "duotone" : "regular"} />
            </button>
          </div>
        </motion.header>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-taupe/40 animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        ) : assets.length === 0 ? (
           <motion.div
             initial={{ opacity: 0, y: 8 }}
             animate={{ opacity: 1, y: 0 }}
             className="flex flex-col items-center justify-center h-48 text-center"
           >
             <ChatTeardropText size={32} weight="duotone" className="text-charcoal/30 dark:text-clay mb-3" />
             <p className="text-[14px] text-charcoal/60 dark:text-taupe font-medium">No history yet</p>
             <p className="text-[12px] text-charcoal/40 dark:text-taupe/60 mt-1">Past sessions and views will appear here.</p>
           </motion.div>
        ) : (
          <div className={view === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "flex flex-col gap-4"}>
            <AnimatePresence mode="popLayout">
              {assets.map((asset, index) => (
                <HistoryCard key={asset.assetId} asset={asset} index={index} view={view} handleRestore={handleRestore} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
