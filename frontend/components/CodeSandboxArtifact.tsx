
import React, { useState, useMemo } from 'react';
import { Terminal, Copy, Check, AlertCircle } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface CodeSandboxArtifactProps {
  dataString: string;
}

export const CodeSandboxArtifact: React.FC<CodeSandboxArtifactProps> = ({ dataString }) => {
  const [copied, setCopied] = useState(false);

  const data = useMemo(() => {
    try {
      let cleanString = dataString.trim();
      if (cleanString.startsWith('```')) {
        const lines = cleanString.split('\n');
        if (lines[0].startsWith('```')) lines.shift();
        if (lines[lines.length - 1].startsWith('```')) lines.pop();
        cleanString = lines.join('\n');
      }
      return JSON.parse(cleanString);
    } catch (e) {
      console.error("Failed to parse codesandbox JSON", e);
      return null;
    }
  }, [dataString]);

  if (!data) {
    return (
      <div className="p-4 bg-red-50/50 border border-red-100 rounded-xl text-red-800 text-sm font-mono">
        <AlertCircle className="inline-block w-4 h-4 mr-2 mb-0.5" />
        Failed to render code sandbox artifact. Invalid data format.
      </div>
    );
  }

  const handleCopy = () => {
    if (data.code) {
      navigator.clipboard.writeText(data.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderMarkdown = (md: string) => {
    const rawMarkup = marked.parse(md, { breaks: true }) as string;
    return DOMPurify.sanitize(rawMarkup);
  };

  return (
    <div className="my-6 w-full bg-white/60 backdrop-blur-xl border border-clay/60 rounded-3xl shadow-glass-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-clay/40 bg-white/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-charcoal/5 flex items-center justify-center">
            <Terminal size={14} className="text-charcoal" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-ink tracking-tight">{data.filename || 'script'}</h3>
            <span className="px-2 py-0.5 rounded-md bg-clay/50 text-[9px] font-mono text-taupe uppercase tracking-widest">
              {data.language || 'code'}
            </span>
          </div>
        </div>
        <button
          onClick={handleCopy}
          className="relative flex items-center justify-center w-7 h-7 text-taupe hover:text-charcoal transition-colors rounded-md hover:bg-white/50 active:scale-90 group/btn"
          aria-label="Copy code"
        >
          {copied ? <Check size={14} className="text-bronze" /> : <Copy size={14} className="group-hover/btn:scale-110 transition-transform" />}
        </button>
      </div>

      {/* Code Area (Dark Theme) */}
      <div className="bg-charcoal w-full overflow-x-auto border-b border-clay/40">
        <pre className="p-5 font-mono text-[13px] text-sand/90 leading-relaxed no-scrollbar">
          <code>{data.code}</code>
        </pre>
      </div>

      {/* Explanation Area */}
      {data.explanation_markdown && (
        <div className="p-5 bg-white/30">
          <div 
            className="prose max-w-none text-[13px] leading-relaxed text-charcoal
                       prose-p:m-0 prose-p:last:mb-0
                       prose-code:px-1.5 prose-code:py-0.5 prose-code:bg-clay/40 prose-code:rounded-md prose-code:text-ink prose-code:font-mono prose-code:text-[11px]
                       prose-strong:font-semibold prose-strong:text-ink"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(data.explanation_markdown) }}
          />
        </div>
      )}
    </div>
  );
};
