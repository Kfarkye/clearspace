import React, { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, FolderOpen, FileCode, FileText, FileJson, ChevronRight, ChevronLeft, Lock } from 'lucide-react';

// Github icon removed from lucide-react in recent versions — inline SVG
const Github = ({ size = 24, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

const SPRING = { type: 'spring', bounce: 0, duration: 0.4, damping: 18 };

interface Repo { name: string; private: boolean; language: string | null; }
interface TreeNode { name: string; path: string; type: 'blob' | 'tree'; sha: string; size?: number; children: TreeNode[]; isOpen: boolean; }

function buildTree(entries: any[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const entry of entries) {
    const parts = entry.path.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i], isLast = i === parts.length - 1;
      let existing = current.find(n => n.name === name);
      if (!existing) {
        existing = { name, path: parts.slice(0, i + 1).join('/'), type: isLast ? entry.type : 'tree', sha: isLast ? entry.sha : '', size: isLast ? entry.size : undefined, children: [], isOpen: false };
        current.push(existing);
      }
      current = existing.children;
    }
  }
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.type !== b.type ? (a.type === 'tree' ? -1 : 1) : a.name.localeCompare(b.name));
    nodes.forEach(n => sortNodes(n.children));
  };
  sortNodes(root); return root;
}

const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'json') return <FileJson size={13} className="text-[#AF52DE]" />;
  if (ext === 'md' || ext === 'txt') return <FileText size={13} className="text-black/40" />;
  if (ext === 'tsx' || ext === 'ts' || ext === 'js' || ext === 'jsx') return <FileCode size={13} className="text-[#007AFF]" />;
  return <FileCode size={13} className="text-black/30" />;
};

const FileViewer = memo(({ owner, repo, filePath, sha, onBack }: any) => {
  const [content, setContent] = useState<string | null>(null);
  
  useEffect(() => {
    let cancelled = false;
    setContent(null); // Reset content instantly when path changes
    fetch(`/api/github/repos/${owner}/${repo}/file?path=${encodeURIComponent(filePath)}&sha=${sha}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setContent(d.content || 'Empty file'); })
      .catch(() => { if (!cancelled) setContent('Failed to load file'); });
      
    return () => { cancelled = true; };
  }, [owner, repo, filePath, sha]);

  return (
    <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={SPRING} className="flex flex-col h-full bg-[#FAFAFC] absolute inset-0 z-10">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-black/[0.04] bg-white/80 backdrop-blur-md sticky top-0">
        <button onClick={onBack} className="p-1 rounded-md text-black/40 hover:text-black/80 hover:bg-black/5 transition-all outline-none">
          <ChevronLeft size={16} strokeWidth={2.5} />
        </button>
        <span className="text-[12px] text-[#1D1D1F]/80 truncate font-mono font-medium tracking-tight">{filePath}</span>
      </div>
      <div className="flex-1 overflow-auto p-5 pb-10 no-scrollbar">
        {!content ? (
          <div className="space-y-2 animate-pulse mt-2">
            {[80, 60, 70, 50, 65].map((w, i) => <div key={i} className="h-2 rounded-full bg-black/5" style={{ width: `${w}%` }} />)}
          </div>
        ) : (
          <pre className="text-[11.5px] leading-[1.65] text-[#1D1D1F]/80 font-mono whitespace-pre-wrap break-words selection:bg-[#007AFF]/15">
            {content}
          </pre>
        )}
      </div>
    </motion.div>
  );
});
FileViewer.displayName = 'FileViewer';

const FileTreeNode = memo(({ node, depth, onToggle, onFileClick }: any) => {
  const isFolder = node.type === 'tree';
  return (
    <>
      <div onClick={() => isFolder ? onToggle(node.path) : onFileClick(node)} className={`flex items-center gap-2.5 w-full py-1.5 cursor-pointer hover:bg-black/[0.03] rounded-md transition-colors ${isFolder ? 'text-[#1D1D1F]' : 'text-[#1D1D1F]/60 hover:text-[#007AFF]'}`} style={{ paddingLeft: `${16 + depth * 14}px`, paddingRight: 16 }}>
        {isFolder ? (node.isOpen ? <FolderOpen size={14} className="text-[#007AFF] shrink-0" /> : <Folder size={14} className="text-[#007AFF] shrink-0" fill="currentColor" fillOpacity={0.2} />) : getFileIcon(node.name)}
        <span className={`text-[12.5px] tracking-tight truncate ${isFolder ? 'font-medium' : 'font-normal'}`}>{node.name}</span>
      </div>
      <AnimatePresence>
        {isFolder && node.isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            {node.children.map((child: any) => <FileTreeNode key={child.path} node={child} depth={depth + 1} onToggle={onToggle} onFileClick={onFileClick} />)}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});
FileTreeNode.displayName = 'FileTreeNode';

export const GitHubPanel: React.FC<{ isConnected?: boolean; username?: string; onConnect?: () => void; onDisconnect?: () => void }> = ({ isConnected, username, onConnect, onDisconnect }) => {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [viewingFile, setViewingFile] = useState<TreeNode | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    
    fetch('/api/github/repos')
      .then(r => r.json())
      .then(data => {
        if (!cancelled && Array.isArray(data)) setRepos(data);
      });
      
    return () => { cancelled = true; };
  }, [isConnected]);

  useEffect(() => {
    if (!selectedRepo) {
      setTree([]);
      return;
    }
    let cancelled = false;
    const [owner, repo] = selectedRepo.split('/');
    
    fetch(`/api/github/repos/${owner}/${repo}/tree`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.tree) setTree(buildTree(data.tree));
      });
      
    return () => { cancelled = true; };
  }, [selectedRepo]);

  const selectRepo = useCallback((repoName: string) => {
    setSelectedRepo(repoName); 
    setViewingFile(null); 
    setTree([]);
  }, []);

  const toggleFolder = useCallback((path: string) => {
    setTree(prev => {
      function toggle(nodes: TreeNode[]): TreeNode[] {
        return nodes.map(n => n.path === path ? { ...n, isOpen: !n.isOpen } : n.children.length ? { ...n, children: toggle(n.children) } : n);
      }
      return toggle(prev);
    });
  }, []);

  if (!isConnected) {
    return (
      <div className="flex flex-col justify-center items-center h-full px-8 pb-10">
        <div className="w-16 h-16 rounded-full bg-black/[0.03] flex items-center justify-center mb-6 border border-black/[0.02] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.02)]">
          <Github size={28} className="text-black/50" />
        </div>
        <h3 className="text-[15px] font-semibold text-[#1D1D1F] tracking-tight mb-2">Connect Workspace</h3>
        <p className="text-[13px] text-[#1D1D1F]/50 text-center leading-[1.6] mb-6 text-pretty">
          Link your GitHub account to allow AURA to seamlessly index, retrieve, and analyze your code.
        </p>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} onClick={onConnect} className="flex items-center gap-2.5 px-6 py-2.5 bg-[#1D1D1F] text-white rounded-full text-[13px] font-semibold tracking-tight shadow-[0_4px_14px_rgba(0,0,0,0.15)] transition-all outline-none">
          Connect GitHub
        </motion.button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden bg-white">
      <AnimatePresence mode="wait">
        {viewingFile && selectedRepo ? (
          <FileViewer key="viewer" owner={selectedRepo.split('/')[0]} repo={selectedRepo.split('/')[1]} filePath={viewingFile.path} sha={viewingFile.sha} onBack={() => setViewingFile(null)} />
        ) : selectedRepo ? (
          <motion.div key="tree" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={SPRING} className="flex flex-col h-full absolute inset-0 bg-[#FAFAFC]">
            <div className="px-4 py-3 flex items-center gap-3 border-b border-black/[0.04] bg-white/80 backdrop-blur-md sticky top-0 z-10">
              <button onClick={() => { setSelectedRepo(null); setTree([]); }} className="p-1 rounded-md text-black/40 hover:text-black/80 hover:bg-black/5 transition-all outline-none">
                <ChevronLeft size={16} strokeWidth={2.5} />
              </button>
              <span className="text-[13px] text-[#1D1D1F] font-semibold tracking-tight truncate">{selectedRepo.split('/')[1]}</span>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar py-2">
              {tree.length === 0 ? (
                 <div className="px-4 pt-4 space-y-3">{[55, 40, 65, 35].map((w, i) => <div key={i} className="h-2 rounded-full bg-black/5 animate-pulse" style={{ width: `${w}%` }} />)}</div>
              ) : tree.map(node => <FileTreeNode key={node.path} node={node} depth={0} onToggle={toggleFolder} onFileClick={setViewingFile} />)}
            </div>
          </motion.div>
        ) : (
          <motion.div key="repos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={SPRING} className="flex flex-col h-full absolute inset-0">
            <div className="px-5 py-3 flex items-center justify-between border-b border-black/[0.04] bg-white sticky top-0 z-0">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-black/5 flex items-center justify-center">
                  <Github size={12} className="text-[#1D1D1F]/60" />
                </div>
                <span className="text-[12px] font-semibold text-[#1D1D1F]/80 tracking-tight truncate">{username}</span>
              </div>
              <button onClick={onDisconnect} className="text-[10px] font-semibold text-[#FF3B30]/80 hover:text-[#FF3B30] uppercase tracking-wider transition-colors bg-[#FF3B30]/10 px-2 py-1 rounded-md">
                Log Out
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-3 bg-[#FAFAFC]">
              <div className="bg-white rounded-[20px] border border-black/[0.04] shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
                {repos.length === 0 ? (
                  <div className="p-4 space-y-4">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-black/[0.03] rounded-[12px] animate-pulse" />)}
                  </div>
                ) : (
                  repos.map((repo, idx) => (
                    <div key={repo.name} onClick={() => selectRepo(repo.name)} className={`flex items-center justify-between p-4 hover:bg-black/[0.02] cursor-pointer transition-colors ${idx !== repos.length - 1 ? 'border-b border-black/[0.04]' : ''}`}>
                      <div className="flex flex-col min-w-0 pr-4">
                        <span className="text-[14px] font-medium text-[#1D1D1F] tracking-tight truncate flex items-center gap-2">
                          {repo.private ? <Lock size={12} className="text-black/30 shrink-0" /> : <Folder size={12} className="text-[#007AFF]/60 shrink-0" fill="currentColor" fillOpacity={0.2} />}
                          {repo.name.split('/')[1]}
                        </span>
                        <div className="flex items-center gap-3 mt-1">
                          {repo.language && <span className="text-[10.5px] font-semibold text-black/40 uppercase tracking-widest">{repo.language}</span>}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-black/20 shrink-0" strokeWidth={2.5} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
