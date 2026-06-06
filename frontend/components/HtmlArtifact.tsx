import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FileText, Copy, Check, Maximize2, Minimize2, Upload, Loader2, ExternalLink, Globe } from 'lucide-react';
import { API_ENDPOINTS } from '../config/apiEndpoints';

interface HtmlArtifactProps {
  dataString: string;
  workspaceToken?: string | null;
  sandboxPermissions?: string;
}

type SaveState = 'idle' | 'choosing' | 'saving' | 'saved' | 'error';
type SaveFormat = 'doc' | 'html' | 'deploy';

export const HtmlArtifact: React.FC<HtmlArtifactProps> = ({
  dataString,
  workspaceToken,
  sandboxPermissions,
}) => {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(400);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedFileUrl, setSavedFileUrl] = useState<string | null>(null);
  const [savedFormat, setSavedFormat] = useState<SaveFormat>('doc');
  const menuRef = useRef<HTMLDivElement>(null);

  const handleCopy = useCallback(() => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(dataString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [dataString]);

  // Close format picker on outside click
  useEffect(() => {
    if (saveState !== 'choosing') return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setSaveState('idle');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [saveState]);

  // Extract title
  const titleMatch = dataString.match(/<title>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : 'HTML Document';

  // --- Save to Google Drive ---
  const handleSaveToDrive = useCallback(async (format: SaveFormat) => {
    setSaveState('saving');
    setSavedFormat(format);
    setSavedFileUrl(null);

    try {
      // --- Deploy to Cloud Storage ---
      if (format === 'deploy') {
        const response = await fetch(API_ENDPOINTS.DEPLOY_HTML, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ html: dataString, title }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Deploy failed: ${response.status}`);
        }

        const { url } = await response.json();
        setSavedFileUrl(url);
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 8000);
        return;
      }

      // --- Save to Drive (Doc or HTML) ---
      if (!workspaceToken) {
        throw new Error('Connect workspace to save to Drive.');
      }

      const cleanName = title.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
      const isDoc = format === 'doc';
      const metadata = {
        name: isDoc ? cleanName : `${cleanName}.html`,
        mimeType: isDoc ? 'application/vnd.google-apps.document' : 'text/html',
      };

      const boundary = '---AuraBoundary' + Date.now();
      const body = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        '',
        dataString,
        `--${boundary}--`,
      ].join('\r\n');

      const response = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${workspaceToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Drive API error: ${response.status}`);
      }

      const fileData = await response.json();
      setSavedFileUrl(fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 6000);
    } catch (error: any) {
      console.error('[HtmlArtifact] Save failed:', error);
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }, [dataString, workspaceToken, title]);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'resize_html' && e.data?.height) {
        setIframeHeight(Math.max(100, Math.min(e.data.height + 20, expanded ? 2000 : 600)));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [expanded]);

  const styledSrcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{margin:0;padding:0;overflow-x:hidden}img{max-width:100%;height:auto;display:block}</style>
  <script>
    // Inject AURA Context into the Artifact Sandbox
    window.AURA_ARTIFACT_ID = "ephemeral_html";
    window.executeAuraCommand = (domain, payload) => {
      window.parent.postMessage({ 
        type: 'AURA_EXECUTE', 
        domain, 
        payload, 
        artifactId: "ephemeral_html" 
      }, '*');
    };
    window.onload = function() {
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(function() {
           window.parent.postMessage({ type: 'resize_html', height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) }, '*');
        });
        ro.observe(document.body);
      }
      window.parent.postMessage({ type: 'resize_html', height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) }, '*');
    };
  </script>
  </head><body>${dataString}</body></html>`;

  const defaultSandbox = "allow-popups allow-forms allow-modals allow-pointer-lock allow-downloads allow-orientation-lock allow-presentation allow-top-navigation-by-user-activation allow-scripts";
  const effectiveSandbox = sandboxPermissions || defaultSandbox;

  // Format labels for the "Open" link
  const formatLabels: Record<SaveFormat, string> = {
    doc: 'Doc',
    html: 'HTML',
    deploy: 'Page',
  };

  // --- Render the save control ---
  const renderSaveControl = () => {
    // After save: "Open" link
    if (saveState === 'saved' && savedFileUrl) {
      return (
        <a
          href={savedFileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[10px] font-mono text-bronze hover:bg-clay/20 transition-all duration-300"
        >
          {savedFormat === 'deploy' ? <Globe size={11} /> : <ExternalLink size={11} />}
          <span>Open {formatLabels[savedFormat]}</span>
        </a>
      );
    }

    // Saving: spinner
    if (saveState === 'saving') {
      return (
        <div className="flex items-center gap-1.5 px-2.5 h-7 text-[10px] font-mono text-taupe/50">
          <Loader2 size={11} className="animate-spin" />
          <span>{savedFormat === 'deploy' ? 'Deploying…' : 'Saving…'}</span>
        </div>
      );
    }

    // Error
    if (saveState === 'error') {
      return (
        <div className="flex items-center px-2.5 h-7 text-[10px] font-mono text-red-400/80">
          Failed
        </div>
      );
    }

    // Choosing: three format options
    if (saveState === 'choosing') {
      return (
        <div ref={menuRef} className="relative flex items-center">
          <div className="flex items-center gap-0 bg-white/80 backdrop-blur-xl rounded-lg border border-clay/40 shadow-sm overflow-hidden">
            {workspaceToken && (
              <>
                <button
                  onClick={() => handleSaveToDrive('doc')}
                  className="px-3 h-7 text-[10px] font-mono text-charcoal/70 hover:text-charcoal hover:bg-clay/20 transition-all duration-200 tracking-wide"
                >
                  Doc
                </button>
                <div className="w-px h-3.5 bg-clay/30" />
                <button
                  onClick={() => handleSaveToDrive('html')}
                  className="px-3 h-7 text-[10px] font-mono text-charcoal/70 hover:text-charcoal hover:bg-clay/20 transition-all duration-200 tracking-wide"
                >
                  HTML
                </button>
                <div className="w-px h-3.5 bg-clay/30" />
              </>
            )}
            <button
              onClick={() => handleSaveToDrive('deploy')}
              className="px-3 h-7 text-[10px] font-mono text-charcoal/70 hover:text-charcoal hover:bg-clay/20 transition-all duration-200 tracking-wide"
            >
              Deploy
            </button>
          </div>
        </div>
      );
    }

    // Idle: single icon
    return (
      <button
        onClick={() => setSaveState('choosing')}
        className="relative flex items-center justify-center w-7 h-7 text-taupe hover:text-charcoal transition-colors rounded-md hover:bg-white/50 active:scale-90"
        aria-label="Save or Deploy"
        title="Save or Deploy"
      >
        <Upload size={13} />
      </button>
    );
  };

  return (
    <div className="my-6 w-full bg-white/60 backdrop-blur-xl border border-clay/60 rounded-3xl shadow-glass-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-clay/40 bg-white/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-charcoal/5 flex items-center justify-center">
            <FileText size={14} className="text-charcoal" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-ink tracking-tight">{title}</h3>
            <span className="px-2 py-0.5 rounded-md bg-clay/50 text-[9px] font-mono text-taupe uppercase tracking-widest">
              HTML
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {renderSaveControl()}
          <button
            onClick={() => setExpanded(!expanded)}
            className="relative flex items-center justify-center w-7 h-7 text-taupe hover:text-charcoal transition-colors rounded-md hover:bg-white/50 active:scale-90"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            onClick={handleCopy}
            className="relative flex items-center justify-center w-7 h-7 text-taupe hover:text-charcoal transition-colors rounded-md hover:bg-white/50 active:scale-90 group/btn"
            aria-label="Copy HTML"
          >
            {copied ? <Check size={14} className="text-bronze" /> : <Copy size={14} className="group-hover/btn:scale-110 transition-transform" />}
          </button>
        </div>
      </div>

      {/* Rendered HTML */}
      <div className="w-full bg-white" style={{ height: expanded ? iframeHeight : Math.min(iframeHeight, 600) }}>
        <iframe
          ref={iframeRef}
          srcDoc={styledSrcdoc}
          sandbox={effectiveSandbox}
          title={title}
          className="w-full h-full border-0"
          style={{ colorScheme: 'light' }}
        />
      </div>
    </div>
  );
};
