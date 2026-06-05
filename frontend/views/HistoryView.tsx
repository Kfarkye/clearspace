// ============================================================================
// HistoryView — Full-page conversation history (route: "/history")
//
// Uses real ConversationSummary from persistence types.
// Clicking a conversation navigates to "/" and loads it.
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Pin, Trash2, ArrowUpRight, MessageSquare } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import * as dataService from '../services/dataService';
import type { ConversationSummary } from '../types/persistence';

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

function groupConversations(conversations: ConversationSummary[]) {
  const pinned = conversations.filter(c => c.isPinned);
  const unpinned = conversations.filter(c => !c.isPinned);
  const now = Date.now();
  const groups: Record<string, ConversationSummary[]> = {
    'Today': [], 'Yesterday': [], 'This Week': [], 'Earlier': [],
  };
  for (const conv of unpinned) {
    const days = Math.floor((now - new Date(conv.updatedAt).getTime()) / 86400000);
    if (days < 1) groups['Today'].push(conv);
    else if (days < 2) groups['Yesterday'].push(conv);
    else if (days < 7) groups['This Week'].push(conv);
    else groups['Earlier'].push(conv);
  }
  const result: { label: string; items: ConversationSummary[] }[] = [];
  if (pinned.length) result.push({ label: 'Pinned', items: pinned });
  for (const [label, items] of Object.entries(groups)) {
    if (items.length) result.push({ label, items });
  }
  return result;
}

const HistoryView: React.FC = () => {
  const { loadConversation, conversationId } = useAppContext();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadConversations = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await dataService.listConversations();
      if (data) setConversations(data);
    } catch (err) {
      console.error('[History] Failed to load:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c => 
      c.title?.toLowerCase().includes(q)
    );
  }, [conversations, search]);

  const grouped = useMemo(() => groupConversations(filtered), [filtered]);

  const handleSelect = useCallback((id: string) => {
    loadConversation(id);
    navigate('/');
  }, [loadConversation, navigate]);

  const handleDelete = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await dataService.deleteConversation(id);
      loadConversations();
    } catch (err) {
      console.error('[History] Delete failed:', err);
    }
  }, [loadConversations]);

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="px-6 pt-6 pb-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-taupe" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/60 backdrop-blur-xl border border-white/50 text-[13px] text-charcoal placeholder:text-taupe/60 focus:outline-none focus:ring-1 focus:ring-bronze/30 focus:border-bronze/30 shadow-glass-sm transition-all"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-taupe/40 animate-thinking-dot thinking-dot" />
              ))}
            </div>
          </div>
        ) : grouped.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-48 text-center"
          >
            <MessageSquare size={32} className="text-clay mb-3" strokeWidth={1.5} />
            <p className="text-[13px] text-taupe">
              {search ? 'No conversations match your search' : 'No conversations yet'}
            </p>
            <p className="text-[11px] text-taupe/60 mt-1">
              {search ? 'Try a different search term' : 'Start a chat to see your history here'}
            </p>
          </motion.div>
        ) : (
          <div className="space-y-5">
            {grouped.map(group => (
              <div key={group.label}>
                <div className="flex items-center gap-2 mb-2">
                  {group.label === 'Pinned' && <Pin size={10} className="text-bronze" />}
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-taupe/70">
                    {group.label}
                  </span>
                  <span className="text-[10px] font-mono text-taupe/40">{group.items.length}</span>
                </div>

                <div className="space-y-1">
                  <AnimatePresence mode="popLayout">
                    {group.items.map(conv => (
                      <motion.button
                        key={conv.conversationId}
                        layout
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        onClick={() => handleSelect(conv.conversationId)}
                        className={`group w-full text-left px-4 py-3 rounded-xl transition-all duration-200 border ${
                          conv.conversationId === conversationId
                            ? 'bg-white/80 border-bronze/20 shadow-glass'
                            : 'bg-white/40 border-transparent hover:bg-white/70 hover:border-white/60 hover:shadow-glass-sm'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-charcoal truncate">
                              {conv.title || 'Untitled conversation'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                            <span className="text-[10px] font-mono text-taupe/50">
                              {relativeTime(conv.updatedAt)}
                            </span>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => handleDelete(e, conv.conversationId)}
                                className="p-1 rounded-md text-taupe/40 hover:text-red-400 transition-colors"
                              >
                                <Trash2 size={10} />
                              </button>
                              <ArrowUpRight size={10} className="text-taupe/30" />
                            </div>
                          </div>
                        </div>

                        {/* Mode + message count */}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                            conv.chatMode === 'operator' 
                              ? 'text-bronze/70 bg-bronze/8' 
                              : 'text-blue-500/70 bg-blue-500/8'
                          }`}>
                            {conv.chatMode}
                          </span>
                          <span className="text-[9px] font-mono text-taupe/40">
                            {conv.messageCount} messages
                          </span>
                        </div>
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryView;
