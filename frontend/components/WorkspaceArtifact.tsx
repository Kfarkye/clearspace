import React, { useMemo, useRef } from 'react';
import { Mail, Calendar, CheckSquare, Clock, Users, ChevronRight } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { motion } from 'framer-motion';

interface WorkspaceArtifactProps {
  dataString: string;
  onEmailClick?: (messageId: string, subject: string) => void;
}

// Apple-esque Spring Physics: Critically damped, zero bounce
const SPRING_TRANSITION = { type: 'spring', bounce: 0, duration: 0.5, mass: 0.8, damping: 18 };

export const WorkspaceArtifact: React.FC<WorkspaceArtifactProps> = ({ dataString, onEmailClick }) => {
  // 1. SWR CACHE: Prevents UI flickering and console spam during LLM streams
  const lastValidData = useRef<any>(null);

  const data = useMemo(() => {
    if (!dataString) return lastValidData.current;

    try {
      // 2. BULLETPROOF AST PARSER: Safely strip markdown wrappers via Regex
      let cleanString = dataString
        .replace(/^```[a-zA-Z]*\n?/i, '') // Strip opening ```json
        .replace(/\n?```$/i, '')          // Strip closing ```
        .trim();

      // Heal LLM hallucinated trailing commas before parsing
      cleanString = cleanString.replace(/,\s*([\]}])/g, '$1');

      const parsed = JSON.parse(cleanString);
      
      lastValidData.current = parsed;
      return parsed;
    } catch (e) {
      // 3. SILENT FALLBACK: We explicitly remove console.error() here.
      // During an LLM stream, 99% of parses will fail with SyntaxError.
      return lastValidData.current;
    }
  }, [dataString]);

  if (!data) {
    // Elegant dormant state instead of a loud red error banner
    return (
      <div className="my-8 p-6 bg-black/[0.02] border border-black/[0.04] rounded-[24px] flex items-center justify-center gap-3 w-full max-w-sm mx-auto">
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
          <div className="w-2 h-2 rounded-full bg-black/30" />
        </motion.div>
        <span className="text-[13px] font-medium tracking-tight text-black/40">Loading workspace...</span>
      </div>
    );
  }

  const renderMarkdown = (md: string) => {
    if (!md) return '';
    try {
      const rawMarkup = marked.parse(md, { breaks: true }) as string;
      // Isomorphic check for Next.js SSR environments
      if (typeof window === 'undefined') return rawMarkup;
      return DOMPurify.sanitize(rawMarkup);
    } catch {
      return md;
    }
  };

  const handleEmailClick = (email: any) => {
    if (email.id && onEmailClick) {
      onEmailClick(email.id, email.subject || '(No Subject)');
    }
  };

  // Safe checks to prevent .map() crashes if LLM hallucinates an object instead of array
  const emails = Array.isArray(data.emails) ? data.emails : [];
  const schedule = Array.isArray(data.schedule) ? data.schedule : [];
  const actionItems = Array.isArray(data.action_items) ? data.action_items : [];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_TRANSITION}
      className="my-8 w-full bg-white/70 backdrop-blur-3xl rounded-[32px] shadow-[0_24px_60px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.1)] border border-black/[0.04] overflow-hidden font-sans isolate selection:bg-[#0066CC]/15"
    >
      {/* Fluid Spatial Header */}
      <div className="px-8 py-6 bg-white/40 flex items-center justify-between border-b border-black/[0.03]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-black/[0.02] flex items-center justify-center">
            <Mail size={18} className="text-[#1D1D1F]" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-[#1D1D1F] tracking-tight leading-none mb-1.5">Workspace Context</h3>
            <p className="text-[10px] font-medium text-black/40 uppercase tracking-[0.18em] leading-none">Summary</p>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-10">
        
        {/* Editorial Typography for Summary */}
        {data.summary_markdown && (
          <div 
            className="prose max-w-none text-[15px] leading-[1.65] tracking-[-0.01em] text-[#1D1D1F]/80 antialiased
                       prose-p:my-3 prose-strong:font-semibold prose-strong:text-[#1D1D1F]
                       prose-h3:text-[11px] prose-h3:font-mono prose-h3:uppercase prose-h3:tracking-[0.15em] prose-h3:text-black/40 prose-h3:mt-8 prose-h3:mb-4
                       prose-ul:list-none prose-ul:pl-0 prose-ul:space-y-2.5
                       prose-li:relative prose-li:pl-5
                       prose-li:before:absolute prose-li:before:left-0 prose-li:before:top-[10px] prose-li:before:w-1.5 prose-li:before:h-1.5 prose-li:before:bg-black/20 prose-li:before:rounded-full"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(data.summary_markdown) }}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14">
          
          {/* EMAILS: iOS List Style */}
          {emails.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-[11px] font-medium text-black/40 uppercase tracking-[0.18em]">Priority Inbox</h4>
                <span className="text-[10px] font-semibold text-[#007AFF] bg-[#007AFF]/10 px-2.5 py-1 rounded-full">{emails.length} New</span>
              </div>
              
              <div className="bg-[#F5F5F7]/80 rounded-[24px] p-2 space-y-1">
                {emails.map((email: any, idx: number) => {
                  const isClickable = !!(email.id && onEmailClick);
                  return (
                    <motion.div 
                      key={idx} 
                      whileHover={isClickable ? { scale: 0.99, backgroundColor: "rgba(255,255,255,1)", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" } : {}}
                      whileTap={isClickable ? { scale: 0.97 } : {}}
                      className={`relative bg-transparent rounded-[18px] p-4 transition-colors duration-300 ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                      onClick={() => handleEmailClick(email)}
                      role={isClickable ? "button" : undefined}
                      tabIndex={isClickable ? 0 : undefined}
                      onKeyDown={(e) => { if (e.key === 'Enter' && isClickable) handleEmailClick(email); }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          {email.is_urgent && <span className="w-2 h-2 rounded-full bg-[#FF3B30] shadow-[0_0_8px_rgba(255,59,48,0.4)]" />}
                          <span className="text-[13.5px] font-semibold text-[#1D1D1F] tracking-tight truncate max-w-[140px]">{email.sender}</span>
                        </div>
                        <span className="text-[11px] text-black/40 font-medium tracking-wide flex-shrink-0">{email.time}</span>
                      </div>
                      <p className="text-[14px] font-medium text-[#1D1D1F]/90 mb-1.5 truncate pr-6">{email.subject}</p>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[13px] text-[#1D1D1F]/60 line-clamp-2 leading-[1.5] flex-1 pr-2">{email.snippet}</p>
                        {isClickable && (
                          <ChevronRight size={16} className="text-black/20 shrink-0" strokeWidth={2} />
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-10">
            {/* SCHEDULE: Apple Watch Timeline Aesthetic */}
            {schedule.length > 0 && (
              <div className="space-y-5">
                <div className="flex items-center justify-between px-1 border-b border-black/[0.04] pb-3">
                  <h4 className="text-[11px] font-medium text-black/40 uppercase tracking-[0.18em]">Today</h4>
                  <Calendar size={14} className="text-black/30" />
                </div>
                
                <div className="relative pl-3 space-y-6 before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-[2px] before:bg-[#F5F5F7] before:rounded-full">
                  {schedule.map((event: any, idx: number) => (
                    <div key={idx} className="relative pl-8 flex items-start gap-4">
                      {/* Timeline Dot */}
                      <div className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-[2.5px] bg-white z-10 ${event.is_next ? 'border-[#34C759] shadow-[0_0_12px_rgba(52,199,89,0.4)]' : 'border-black/20'}`} />
                      
                      <div className="flex-1 -mt-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1.5">
                          <h5 className={`text-[14.5px] font-semibold tracking-tight ${event.is_next ? 'text-[#1D1D1F]' : 'text-[#1D1D1F]/60'}`}>{event.title}</h5>
                          {event.is_next && <span className="text-[9px] font-bold text-[#34C759] uppercase tracking-wider bg-[#34C759]/10 px-2 py-0.5 rounded-[4px]">Next</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] font-medium text-black/40">
                          <span className="flex items-center gap-1.5"><Clock size={12} strokeWidth={2} /> {event.time}</span>
                          {Array.isArray(event.attendees) && event.attendees.length > 0 && (
                            <span className="flex items-center gap-1.5"><Users size={12} strokeWidth={2} /> {event.attendees.join(', ')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ACTION ITEMS: Apple Reminders App Style */}
            {actionItems.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1 border-b border-black/[0.04] pb-3">
                  <h4 className="text-[11px] font-medium text-black/40 uppercase tracking-[0.18em]">Action Items</h4>
                  <CheckSquare size={14} className="text-black/30" />
                </div>
                
                <div className="space-y-1">
                  {actionItems.map((item: any, idx: number) => (
                    <motion.div 
                      key={idx} 
                      whileHover={{ backgroundColor: "rgba(0,0,0,0.02)" }}
                      className="group flex items-start gap-3.5 p-3.5 rounded-[16px] transition-colors duration-300"
                    >
                      <div className="mt-0.5 w-[18px] h-[18px] rounded-full border-[1.5px] border-black/20 flex items-center justify-center shrink-0 group-hover:border-black/40 transition-colors bg-white">
                        <CheckSquare size={10} className="text-transparent group-hover:text-black/20 transition-colors" />
                      </div>
                      <div className="flex-1">
                        <span className="text-[14px] font-medium text-[#1D1D1F] tracking-tight block mb-1.5">{item.task}</span>
                        <div className="flex items-center gap-3">
                          {item.priority && (
                            <span className={`text-[11px] font-medium ${String(item.priority).toLowerCase() === 'high' ? 'text-[#FF3B30]' : 'text-[#007AFF]'}`}>
                              {item.priority} Priority
                            </span>
                          )}
                          {item.due && <span className="text-[11px] font-medium text-black/40">{item.due}</span>}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
