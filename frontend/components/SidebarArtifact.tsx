import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';

interface SidebarItem {
  label: string;
  description?: string;
  action_prompt: string;
}

interface SidebarData {
  title?: string;
  items?: SidebarItem[];
}

interface SidebarArtifactProps {
  dataString: string;
  onAction: (prompt: string) => void;
}

/** 
 * Robust JSON parser with multi-layer fallback logic.
 * Cleans markdown code block wrappers before parsing.
 */
const parseSidebarData = (raw: string): SidebarData | null => {
  if (!raw) return null;
  try {
    const cleanString = raw
      .replace(/```sidebar/g, '')
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(cleanString);
  } catch (e) {
    console.error("Failed to parse sidebar intelligence payload:", e);
    return null;
  }
};

export const SidebarArtifact: React.FC<SidebarArtifactProps> = ({ dataString, onAction }) => {
  const data = useMemo(() => parseSidebarData(dataString), [dataString]);

  // Elegant, design-system compliant fallback state
  if (!data) {
    return (
      <div className="w-full max-w-[340px] p-5 bg-sand/50 border border-clay/60 rounded-xl font-sans">
        <span className="text-[9px] font-mono tracking-[0.15em] text-bronze font-semibold uppercase block mb-1.5">
          System Error
        </span>
        <p className="text-xs text-taupe leading-relaxed">
          Failed to render navigation artifact. The payload structure is invalid.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[340px] bg-alabaster border border-clay/60 rounded-xl shadow-glass overflow-hidden font-sans select-none">
      {/* Structural Top Accent Line */}
      <div className="h-[2px] w-full bg-gradient-to-r from-bronze/10 via-bronze/40 to-bronze/10" />

      {/* Header Panel */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-clay/30 bg-alabaster">
        <span className="text-[9px] font-mono tracking-[0.18em] text-taupe font-semibold uppercase truncate pr-3">
          {data.title || "Navigation"}
        </span>
        <span className="text-[9px] font-mono tracking-[0.1em] text-bronze/80 font-medium uppercase flex-shrink-0">
          Index
        </span>
      </div>

      {/* Interactive List Stack */}
      <div className="divide-y divide-clay/20">
        {data.items && data.items.length > 0 ? (
          data.items.map((item, idx) => (
            <button
              key={idx}
              onClick={() => onAction(item.action_prompt)}
              aria-label={`Action: ${item.label}`}
              className="group flex items-center justify-between w-full text-left px-5 py-4 transition-all duration-200 bg-transparent hover:bg-sand/30 active:bg-sand/50 focus-visible:outline-none focus-visible:bg-sand/30 focus-visible:ring-inset focus-visible:ring-1 focus-visible:ring-bronze/40"
            >
              <div className="flex flex-col pr-4 min-w-0 flex-1">
                <span className="text-xs font-semibold text-charcoal tracking-tight group-hover:text-ink transition-colors truncate">
                  {item.label}
                </span>
                {item.description && (
                  <span className="text-[10px] text-taupe/80 mt-0.5 font-mono tracking-tight truncate">
                    {item.description}
                  </span>
                )}
              </div>
              
              {/* Ultra-minimalist action indicator with sub-pixel translation */}
              <div className="flex-shrink-0 ml-2">
                <ChevronRight 
                  size={12} 
                  className="text-taupe/50 group-hover:text-bronze transform group-hover:translate-x-0.5 group-hover:scale-110 transition-all duration-200 ease-out stroke-[2.5]" 
                />
              </div>
            </button>
          ))
        ) : (
          <div className="px-5 py-8 text-center">
            <span className="text-[10px] font-mono text-taupe/60 uppercase">
              No items registered
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
