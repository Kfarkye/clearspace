
import React, { useMemo } from 'react';
import { Mail, Calendar, CheckSquare, Clock, AlertCircle, Users, ChevronRight } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface WorkspaceArtifactProps {
  dataString: string;
  onEmailClick?: (messageId: string, subject: string) => void;
}

export const WorkspaceArtifact: React.FC<WorkspaceArtifactProps> = ({ dataString, onEmailClick }) => {
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
      console.error("Failed to parse workspace JSON", e);
      return null;
    }
  }, [dataString]);

  if (!data) {
    return (
      <div className="p-4 bg-red-50/50 border border-red-100 rounded-xl text-red-800 text-sm font-mono">
        <AlertCircle className="inline-block w-4 h-4 mr-2 mb-0.5" />
        Failed to render workspace artifact. Invalid data format.
      </div>
    );
  }

  const renderMarkdown = (md: string) => {
    const rawMarkup = marked.parse(md, { breaks: true }) as string;
    return DOMPurify.sanitize(rawMarkup);
  };

  const handleEmailClick = (email: any) => {
    if (email.id && onEmailClick) {
      onEmailClick(email.id, email.subject || '(No Subject)');
    }
  };

  return (
    <div className="my-6 w-full bg-white/60 backdrop-blur-xl border border-clay/60 rounded-3xl shadow-glass-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-clay/40 bg-white/40 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-charcoal/5 flex items-center justify-center">
            <Mail size={16} className="text-charcoal" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink tracking-tight">Workspace Orchestration</h3>
            <p className="text-[10px] font-mono text-taupe uppercase tracking-widest">G-Suite Integration</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Summary Markdown */}
        {data.summary_markdown && (
          <div 
            className="prose max-w-none text-[13px] leading-relaxed text-charcoal
                       prose-p:my-3 
                       prose-h3:text-[11px] prose-h3:font-mono prose-h3:uppercase prose-h3:tracking-widest prose-h3:text-taupe prose-h3:mt-6 prose-h3:mb-3 prose-h3:border-b prose-h3:border-clay/40 prose-h3:pb-2
                       prose-strong:font-semibold prose-strong:text-ink
                       prose-ul:list-none prose-ul:pl-0 prose-ul:space-y-2
                       prose-li:relative prose-li:pl-4
                       prose-li:before:absolute prose-li:before:left-0 prose-li:before:top-[0.6em] prose-li:before:w-1.5 prose-li:before:h-1.5 prose-li:before:bg-bronze/60 prose-li:before:rounded-full"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(data.summary_markdown) }}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Emails Section */}
          {data.emails && data.emails.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-clay/40 pb-2">
                <h4 className="text-[11px] font-mono text-taupe uppercase tracking-widest">Priority Inbox</h4>
                <span className="text-[10px] font-medium text-bronze bg-bronze/10 px-2 py-0.5 rounded-md">{data.emails.length} Unread</span>
              </div>
              <div className="space-y-3">
                {data.emails.map((email: any, idx: number) => (
                  <div 
                    key={idx} 
                    className={`group relative bg-white/50 border border-clay/50 rounded-2xl p-4 transition-all duration-300 ${
                      email.id && onEmailClick 
                        ? 'hover:bg-white/80 hover:shadow-float hover:border-bronze/30 cursor-pointer active:scale-[0.99]' 
                        : 'hover:bg-white/80 hover:shadow-float cursor-default'
                    }`}
                    onClick={() => handleEmailClick(email)}
                    role={email.id && onEmailClick ? "button" : undefined}
                    aria-label={email.id && onEmailClick ? `Open email: ${email.subject}` : undefined}
                    tabIndex={email.id && onEmailClick ? 0 : undefined}
                    onKeyDown={(e) => { if (e.key === 'Enter' && email.id && onEmailClick) handleEmailClick(email); }}
                  >
                    <div className="flex justify-between items-start mb-1.5">
                      <div className="flex items-center gap-2">
                        {email.is_urgent && <span className="w-1.5 h-1.5 rounded-full bg-bronze animate-pulse" />}
                        <span className="text-xs font-semibold text-ink">{email.sender}</span>
                      </div>
                      <span className="text-[10px] font-mono text-taupe">{email.time}</span>
                    </div>
                    <p className="text-[13px] font-medium text-charcoal mb-1 truncate">{email.subject}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-taupe line-clamp-2 leading-relaxed flex-1">{email.snippet}</p>
                      {email.id && onEmailClick && (
                        <ChevronRight size={14} className="text-taupe/40 group-hover:text-bronze group-hover:translate-x-0.5 transition-all ml-2 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-8">
            {/* Schedule Section */}
            {data.schedule && data.schedule.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-clay/40 pb-2">
                  <h4 className="text-[11px] font-mono text-taupe uppercase tracking-widest">Today's Schedule</h4>
                  <Calendar size={12} className="text-taupe" />
                </div>
                <div className="space-y-3">
                  {data.schedule.map((event: any, idx: number) => (
                    <div key={idx} className={`relative border rounded-2xl p-4 flex items-start gap-4 transition-all duration-300 ${event.is_next ? 'bg-sand/80 border-bronze/30 shadow-sm' : 'bg-white/40 border-clay/40'}`}>
                      {event.is_next && (
                        <div className="absolute -left-[1px] top-4 bottom-4 w-[3px] bg-bronze rounded-r-full" />
                      )}
                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <h5 className={`text-sm font-semibold ${event.is_next ? 'text-ink' : 'text-charcoal'}`}>{event.title}</h5>
                          {event.is_next && <span className="text-[9px] font-mono font-bold text-bronze uppercase tracking-wider bg-bronze/10 px-2 py-0.5 rounded-md">Up Next</span>}
                        </div>
                        <div className="flex items-center gap-4 text-[11px] font-mono text-taupe">
                          <span className="flex items-center gap-1.5"><Clock size={12} /> {event.time}</span>
                          {event.attendees && (
                            <span className="flex items-center gap-1.5"><Users size={12} /> {event.attendees.join(', ')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Items Section */}
            {data.action_items && data.action_items.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-clay/40 pb-2">
                  <h4 className="text-[11px] font-mono text-taupe uppercase tracking-widest">Action Items</h4>
                  <CheckSquare size={12} className="text-taupe" />
                </div>
                <div className="space-y-2">
                  {data.action_items.map((item: any, idx: number) => (
                    <div key={idx} className="group flex items-center gap-3 p-3 rounded-xl hover:bg-white/50 transition-colors cursor-pointer">
                      <div className="w-4 h-4 rounded border border-clay/80 flex items-center justify-center group-hover:border-bronze/50 transition-colors">
                        <CheckSquare size={10} className="text-transparent group-hover:text-bronze/30 transition-colors" />
                      </div>
                      <div className="flex-1 flex items-center justify-between">
                        <span className="text-xs font-medium text-charcoal">{item.task}</span>
                        <div className="flex items-center gap-3">
                          <span className={`text-[10px] font-mono ${item.priority?.toLowerCase() === 'high' ? 'text-bronze font-bold' : 'text-taupe'}`}>
                            {item.priority}
                          </span>
                          <span className="text-[10px] font-mono text-taupe">{item.due}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
