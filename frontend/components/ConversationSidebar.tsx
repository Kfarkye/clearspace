// ============================================================================
// ConversationSidebar — Persistent conversation history panel
//
// Design: Radical simplicity. No icons. Typography and whitespace only.
// Features: Pinning (hover text, spatial glide), Export (clipboard, checkmark),
//           Smart title crossfade, time-grouped chronological list.
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import * as dataService from '../services/dataService';
import type { ConversationSummary } from '../types/persistence';
import { GitHubPanel } from './GitHubPanel';
import { WorkspacePanel } from './WorkspacePanel';

interface ConversationSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
  activeConversationId: string | null;
  isGitHubConnected?: boolean;
  githubUser?: string;
  onConnectGitHub?: () => void;
  onDisconnectGitHub?: () => void;
  onSyncRepo?: (repo: string) => void;
  onInjectFile?: (path: string, content: string) => void;
}

/** Relative time — minimal, lowercase, no "ago". */
function relativeTime(dateString: string): string {
  const ms = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);

  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (hrs < 24) return `${hrs}h`;
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Groups conversations: pinned first, then by time period. */
function groupConversations(conversations: ConversationSummary[]): { label: string; items: ConversationSummary[] }[] {
  const pinned = conversations.filter(c => c.isPinned);
  const unpinned = conversations.filter(c => !c.isPinned);

  const now = Date.now();
  const groups: Record<string, ConversationSummary[]> = {
    'Today': [],
    'Yesterday': [],
    'This Week': [],
    'Earlier': [],
  };

  for (const conv of unpinned) {
    const ms = now - new Date(conv.updatedAt).getTime();
    const days = Math.floor(ms / 86400000);
    if (days < 1) groups['Today'].push(conv);
    else if (days < 2) groups['Yesterday'].push(conv);
    else if (days < 7) groups['This Week'].push(conv);
    else groups['Earlier'].push(conv);
  }

  const result: { label: string; items: ConversationSummary[] }[] = [];
  if (pinned.length > 0) result.push({ label: 'pinned', items: pinned });

  for (const [label, items] of Object.entries(groups)) {
    if (items.length > 0) result.push({ label, items });
  }
  return result;
}

/** Formats a conversation as structured Markdown for clipboard export. */
function formatConversationMarkdown(conv: ConversationSummary, messages: Array<{ role: string; content: string; createdAt: string }>): string {
  const date = new Date(conv.createdAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const mode = conv.chatMode === 'operator' ? 'Truth' : 'Gemini';

  let md = `---\ntitle: "${conv.title || 'Untitled'}"\ndate: ${date}\nmode: ${mode}\nmessages: ${messages.length}\n---\n\n# ${conv.title || 'Untitled'}\n\n`;

  for (const msg of messages) {
    if (msg.role === 'user') {
      md += `**You**\n${msg.content}\n\n`;
    } else {
      md += `> ${(msg.content || '').replace(/\n/g, '\n> ')}\n\n`;
    }
  }
  return md.trim();
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  isOpen,
  onClose,
  onSelectConversation,
  activeConversationId,
  isGitHubConnected,
  githubUser,
  onConnectGitHub,
  onDisconnectGitHub,
  onSyncRepo,
  onInjectFile,
}) => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await dataService.listConversations(50);
      setConversations(data || []);
    } catch (error) {
      console.error('Failed to load conversations', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchConversations();
    }
  }, [isOpen, fetchConversations]);

  const handleTogglePin = async (e: React.MouseEvent, conv: ConversationSummary) => {
    e.stopPropagation();
    const updated = { ...conv, isPinned: !conv.isPinned };
    
    // Optimistic UI update
    setConversations(prev => prev.map(c => c.conversationId === conv.conversationId ? updated : c));
    
    try {
      await dataService.pinConversation(conv.conversationId, updated.isPinned);
    } catch (error) {
      // Revert on failure
      setConversations(prev => prev.map(c => c.conversationId === conv.conversationId ? conv : c));
    }
  };

  const handleExport = async (e: React.MouseEvent, conv: ConversationSummary) => {
    e.stopPropagation();
    try {
      const detail = await dataService.getConversation(conv.conversationId);
      if (!detail) return;
      const md = formatConversationMarkdown(conv, detail.messages);
      await navigator.clipboard.writeText(md);
      
      setCopiedId(conv.conversationId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Export failed', error);
    }
  };

  const groupedConversations = useMemo(() => groupConversations(conversations), [conversations]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* Sidebar */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 250, mass: 0.8 }}
            className="fixed inset-y-0 left-0 w-[380px] bg-sand border-r border-charcoal/10 shadow-glass z-50 flex flex-col font-sans overflow-hidden"
          >
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-5 border-b border-charcoal/10 shrink-0">
              <span className="text-charcoal font-medium tracking-tight">History</span>
              <button 
                onClick={onClose}
                className="text-taupe hover:text-charcoal text-xs font-mono uppercase tracking-widest transition-colors duration-200 focus:outline-none"
              >
                Close
              </button>
            </header>

            {/* Scrollable List */}
            <div className="flex-1 overflow-y-auto overscroll-contain no-scrollbar py-4">
              {isLoading ? (
                <div className="px-6 flex flex-col gap-6 mt-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex flex-col gap-2">
                      <div className="w-16 h-3 bg-charcoal/5 rounded animate-pulse" />
                      <div className="w-full h-4 bg-charcoal/5 rounded animate-pulse" />
                      <div className="w-3/4 h-4 bg-charcoal/5 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <div className="px-6 py-8 text-taupe text-[12px] font-mono">
                  No conversations yet.
                </div>
              ) : (
                <LayoutGroup>
                  {groupedConversations.map((group) => (
                    <motion.div layout key={group.label} className="mb-8 last:mb-0">
                      <motion.h3 
                        layout="position"
                        className="px-6 mb-3 text-taupe font-mono text-[10px] uppercase tracking-widest"
                      >
                        {group.label}
                      </motion.h3>
                      <div className="flex flex-col">
                        {group.items.map((conv) => {
                          const isActive = conv.conversationId === activeConversationId;
                          return (
                            <motion.div
                              layout
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              key={conv.conversationId}
                              onClick={() => onSelectConversation(conv.conversationId)}
                              className={`group relative flex flex-col gap-1.5 px-6 py-3 cursor-pointer transition-all duration-200 ease-out ${
                                isActive 
                                  ? 'bg-charcoal/5 border-l-[3px] border-charcoal' 
                                  : 'border-l-[3px] border-transparent hover:bg-charcoal/[0.02]'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <span className={`text-[12.5px] leading-snug truncate font-medium transition-colors duration-200 ${isActive ? 'text-charcoal' : 'text-charcoal/70 group-hover:text-charcoal'}`}>
                                  {conv.title || 'Untitled'}
                                </span>
                              </div>
                              
                              <div className="flex items-center justify-between h-4">
                                <span className="text-taupe text-[10px] font-mono">
                                  {relativeTime(conv.updatedAt)}
                                </span>
                                
                                {/* Typographic Actions */}
                                <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                  <button
                                    onClick={(e) => handleExport(e, conv)}
                                    className={`text-[9px] font-mono uppercase tracking-wider transition-colors duration-200 focus:outline-none ${
                                      copiedId === conv.conversationId ? 'text-emerald' : 'text-taupe hover:text-charcoal'
                                    }`}
                                  >
                                    {copiedId === conv.conversationId ? 'Copied' : 'Copy'}
                                  </button>
                                  <button
                                    onClick={(e) => handleTogglePin(e, conv)}
                                    className="text-[9px] font-mono uppercase tracking-wider text-taupe hover:text-charcoal transition-colors duration-200 focus:outline-none"
                                  >
                                    {conv.isPinned ? 'Unpin' : 'Pin'}
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.div>
                  ))}
                </LayoutGroup>
              )}
            </div>

            {/* Integrations Footer */}
            <div className="shrink-0 border-t border-charcoal/10 bg-[#FAFAFC] flex flex-col h-[40vh] overflow-y-auto no-scrollbar">
              <div className="h-1/2 min-h-[200px] border-b border-charcoal/10 overflow-y-auto no-scrollbar relative">
                <GitHubPanel 
                  isConnected={isGitHubConnected}
                  username={githubUser}
                  onConnect={onConnectGitHub}
                  onDisconnect={onDisconnectGitHub}
                  onSyncRepo={onSyncRepo}
                  onInjectFile={onInjectFile}
                />
              </div>
              <div className="h-1/2 min-h-[200px] overflow-y-auto no-scrollbar relative">
                <WorkspacePanel />
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
