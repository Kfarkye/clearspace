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
  if (pinned.length > 0) result.push({ label: '__pinned__', items: pinned });

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
}) => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'history' | 'github'>('history');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const list = await dataService.listConversations(50);
        if (!cancelled) setConversations(list);
      } catch (e: any) {
        if (e.message !== 'AUTH_REQUIRED') {
          console.warn('[Sidebar] Failed to load conversations:', e);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setConfirmDeleteId(null);
      setCopiedId(null);
    }
  }, [isOpen]);

  const handleDelete = useCallback(async (conversationId: string) => {
    try {
      await dataService.deleteConversation(conversationId);
      setConversations(prev => prev.filter(c => c.conversationId !== conversationId));
      setConfirmDeleteId(null);
    } catch (err) {
      console.error('[Sidebar] Delete failed:', err);
    }
  }, []);

  const handlePin = useCallback(async (conversationId: string, currentlyPinned: boolean) => {
    const newPinned = !currentlyPinned;
    // Optimistic update
    setConversations(prev =>
      prev.map(c => c.conversationId === conversationId ? { ...c, isPinned: newPinned } : c)
    );
    try {
      await dataService.pinConversation(conversationId, newPinned);
    } catch (err) {
      // Rollback
      setConversations(prev =>
        prev.map(c => c.conversationId === conversationId ? { ...c, isPinned: currentlyPinned } : c)
      );
    }
  }, []);

  const handleCopy = useCallback(async (conv: ConversationSummary) => {
    try {
      const detail = await dataService.getConversation(conv.conversationId);
      if (!detail) return;

      const md = formatConversationMarkdown(conv, detail.messages);
      await navigator.clipboard.writeText(md);
      
      setCopiedId(conv.conversationId);
      setTimeout(() => {
        setCopiedId(prev => prev === conv.conversationId ? null : prev);
      }, 1500);
    } catch (err) {
      console.error('[Sidebar] Copy failed:', err);
    }
  }, []);

  const grouped = useMemo(() => groupConversations(conversations), [conversations]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Scrim */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-charcoal/8 z-40"
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 40, stiffness: 400, mass: 0.8 }}
            className="fixed top-0 left-0 h-full w-[296px] bg-[#F9F8F6] border-r border-[#DDD8D2] z-50 flex flex-col select-none"
          >
            {/* Header with Tab Switcher */}
            <div className="px-5 pt-6 pb-3">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setActiveTab('history')}
                  className={`text-[11px] font-semibold tracking-[0.1em] uppercase transition-colors duration-200 ${
                    activeTab === 'history' ? 'text-[#8C7A6B]/80' : 'text-[#8C7A6B]/25 hover:text-[#8C7A6B]/50'
                  }`}
                >
                  History
                </button>
                <button
                  onClick={() => setActiveTab('github')}
                  className={`text-[11px] font-semibold tracking-[0.1em] uppercase transition-colors duration-200 flex items-center gap-1.5 ${
                    activeTab === 'github' ? 'text-[#8C7A6B]/80' : 'text-[#8C7A6B]/25 hover:text-[#8C7A6B]/50'
                  }`}
                >
                  GitHub
                  {isGitHubConnected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400/80" />
                  )}
                </button>
              </div>
            </div>

            <div className="mx-5 h-px bg-[#DDD8D2]/70" />

            {/* Content */}
            {activeTab === 'github' ? (
              <div className="flex-1 overflow-hidden">
                <GitHubPanel
                  isConnected={isGitHubConnected}
                  username={githubUser}
                  onConnect={onConnectGitHub}
                  onDisconnect={onDisconnectGitHub}
                  onSyncRepo={onSyncRepo}
                />
              </div>
            ) : (
            <div className="flex-1 overflow-y-auto no-scrollbar">
              {isLoading ? (
                <div className="px-5 pt-4 space-y-3.5">
                  {[68, 52, 60, 44, 68].map((w, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="h-[10px] rounded bg-[#DDD8D2]/40 animate-pulse" style={{ width: `${w}%` }} />
                      <div className="h-[8px] w-9 rounded bg-[#DDD8D2]/25 animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col justify-center items-center h-full px-8 -mt-8">
                  <p className="text-[12px] text-[#8C7A6B]/35 text-center leading-relaxed">
                    Your conversations<br />will appear here.
                  </p>
                </div>
              ) : (
                <LayoutGroup>
                  <div className="pt-1 pb-5">
                    {grouped.map((group, groupIdx) => (
                      <div key={group.label}>
                        {/* Section label */}
                        {group.label !== '__pinned__' && (
                          <div className="px-5 pt-4 pb-1.5">
                            <span className="text-[9px] font-semibold tracking-[0.14em] text-[#8C7A6B]/30 uppercase">
                              {group.label}
                            </span>
                          </div>
                        )}

                        {group.items.map((conv) => {
                          const isActive = activeConversationId === conv.conversationId;
                          const isConfirming = confirmDeleteId === conv.conversationId;
                          const isCopied = copiedId === conv.conversationId;

                          return (
                            <motion.div
                              key={conv.conversationId}
                              layout
                              layoutId={conv.conversationId}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ layout: { type: 'spring', damping: 30, stiffness: 300 }, opacity: { duration: 0.2 } }}
                            >
                              {isConfirming ? (
                                <div className="mx-3 my-0.5 px-3 py-2.5 rounded-lg bg-white border border-[#DDD8D2]/70">
                                  <p className="text-[11px] text-[#3C3C3C]/65 leading-snug mb-2.5">
                                    Delete this conversation?
                                  </p>
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() => handleDelete(conv.conversationId)}
                                      className="text-[10px] font-semibold text-[#C45C5C] hover:text-[#A33] px-2 py-0.5 rounded hover:bg-[#C45C5C]/5 transition-colors"
                                    >
                                      Delete
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="text-[10px] text-[#8C7A6B]/45 hover:text-[#8C7A6B]/75 px-2 py-0.5 rounded hover:bg-[#8C7A6B]/5 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => {
                                    onSelectConversation(conv.conversationId);
                                    onClose();
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      onSelectConversation(conv.conversationId);
                                      onClose();
                                    }
                                  }}
                                  className={`group w-full text-left cursor-pointer mx-1.5 rounded-lg transition-all duration-150 ${
                                    isActive
                                      ? 'bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                                      : conv.isPinned
                                        ? 'bg-[#A0845C]/[0.03] hover:bg-[#A0845C]/[0.06]'
                                        : 'hover:bg-white/50'
                                  }`}
                                  style={{ width: 'calc(100% - 12px)' }}
                                >
                                  <div className="px-3.5 py-2.5 relative">
                                    {/* Active dot */}
                                    {isActive && (
                                      <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-[2.5px] h-[2.5px] rounded-full bg-[#A0845C]" />
                                    )}

                                    {/* Title — crossfade transition on text change */}
                                    <p
                                      className={`text-[12.5px] leading-snug truncate pr-14 transition-opacity duration-300 ${
                                        isActive ? 'text-[#3C3C3C] font-medium' : 'text-[#3C3C3C]/70'
                                      }`}
                                    >
                                      {conv.title || 'New Conversation'}
                                    </p>

                                    {/* Meta */}
                                    <p className="text-[9.5px] mt-0.5 text-[#8C7A6B]/30 tracking-wide">
                                      <span className={conv.chatMode === 'operator' ? 'text-[#A0845C]/45' : 'text-blue-400/45'}>
                                        {conv.chatMode === 'operator' ? 'Truth' : 'Gemini'}
                                      </span>
                                      <span className="mx-1">·</span>
                                      {relativeTime(conv.updatedAt)}
                                    </p>

                                    {/* Hover actions: pin · copy · delete */}
                                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex gap-2 items-center">
                                      {/* Pin */}
                                      <span
                                        onClick={(e) => { e.stopPropagation(); handlePin(conv.conversationId, conv.isPinned); }}
                                        className={`text-[9px] cursor-pointer transition-all duration-200 ${
                                          conv.isPinned
                                            ? 'text-[#A0845C]/40 hover:text-[#A0845C]/70'
                                            : 'text-[#8C7A6B]/0 group-hover:text-[#8C7A6B]/20 hover:!text-[#A0845C]/50'
                                        }`}
                                      >
                                        {conv.isPinned ? 'unpin' : 'pin'}
                                      </span>
                                      {/* Copy */}
                                      <span
                                        onClick={(e) => { e.stopPropagation(); handleCopy(conv); }}
                                        className={`text-[9px] cursor-pointer transition-all duration-200 ${
                                          isCopied
                                            ? 'text-[#A0845C]/60'
                                            : 'text-[#8C7A6B]/0 group-hover:text-[#8C7A6B]/20 hover:!text-[#8C7A6B]/50'
                                        }`}
                                      >
                                        {isCopied ? '✓' : 'copy'}
                                      </span>
                                      {/* Delete */}
                                      <span
                                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(conv.conversationId); }}
                                        className="text-[9px] text-[#8C7A6B]/0 group-hover:text-[#8C7A6B]/20 hover:!text-[#C45C5C]/55 transition-all duration-200 cursor-pointer"
                                      >
                                        delete
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}

                        {/* Separator after pinned section */}
                        {group.label === '__pinned__' && groupIdx < grouped.length - 1 && (
                          <div className="mx-5 mt-1 mb-0">
                            <div className="h-px bg-[#A0845C]/10" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </LayoutGroup>
              )}
            </div>
            )}

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-[#DDD8D2]/50">
              <button
                onClick={onClose}
                className="text-[10px] font-medium text-[#8C7A6B]/25 hover:text-[#8C7A6B]/55 transition-colors duration-200"
              >
                close
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
