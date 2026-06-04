
import React, { useMemo } from 'react';
import { Stethoscope, MapPin, DollarSign, Clock, FileText, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface TravelHealthArtifactProps {
  dataString: string;
}

export const TravelHealthArtifact: React.FC<TravelHealthArtifactProps> = ({ dataString }) => {
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
      console.error("Failed to parse travel health JSON", e);
      return null;
    }
  }, [dataString]);

  if (!data) {
    return (
      <div className="p-4 bg-red-50/50 border border-red-100 rounded-xl text-red-800 text-sm font-mono">
        <AlertCircle className="inline-block w-4 h-4 mr-2 mb-0.5" />
        Failed to render travel health artifact. Invalid data format.
      </div>
    );
  }

  const renderMarkdown = (md: string) => {
    const rawMarkup = marked.parse(md, { breaks: true }) as string;
    return DOMPurify.sanitize(rawMarkup);
  };

  return (
    <div className="my-6 w-full bg-white/60 backdrop-blur-xl border border-clay/60 rounded-3xl shadow-glass-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-clay/40 bg-white/40 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-bronze/10 flex items-center justify-center">
            <Stethoscope size={16} className="text-bronze" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink tracking-tight">Clinician Logistics</h3>
            <p className="text-[10px] font-mono text-taupe uppercase tracking-widest">Placement & Compliance</p>
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

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Job Matches Section (Takes up 3 columns on large screens) */}
          {data.job_matches && data.job_matches.length > 0 && (
            <div className="lg:col-span-3 space-y-3">
              <div className="flex items-center justify-between border-b border-clay/40 pb-2">
                <h4 className="text-[11px] font-mono text-taupe uppercase tracking-widest">Curated Placements</h4>
                <span className="text-[10px] font-medium text-bronze bg-bronze/10 px-2 py-0.5 rounded-md">{data.job_matches.length} Matches</span>
              </div>
              <div className="space-y-3">
                {data.job_matches.map((job: any, idx: number) => (
                  <div key={idx} className="group relative bg-white/50 border border-clay/50 rounded-2xl p-5 hover:bg-white/80 hover:shadow-float transition-all duration-300 cursor-pointer">
                    <div className="flex justify-between items-start mb-3">
                      <div className="space-y-1">
                        <h5 className="text-sm font-semibold text-ink">{job.facility}</h5>
                        <div className="flex items-center gap-1.5 text-[11px] font-mono text-taupe">
                          <MapPin size={10} />
                          <span>{job.location}</span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-md bg-bronze/10 border border-bronze/20 text-[10px] font-mono font-bold text-bronze">
                        {job.match_score} MATCH
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between pt-3 border-t border-clay/30">
                      <div className="space-y-1">
                        <span className="text-[10px] font-mono text-taupe uppercase tracking-widest block">Package</span>
                        <div className="flex items-center gap-1 text-ink font-semibold">
                          <DollarSign size={14} className="text-bronze" />
                          <span className="text-base">{job.weekly_pay}</span>
                          <span className="text-[10px] font-normal text-taupe">/wk</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 text-[11px] font-mono text-charcoal">
                        <div className="flex items-center gap-1.5 bg-sand px-2.5 py-1.5 rounded-lg border border-clay/40">
                          <Stethoscope size={12} className="text-taupe" />
                          <span>{job.specialty}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-sand px-2.5 py-1.5 rounded-lg border border-clay/40">
                          <Clock size={12} className="text-taupe" />
                          <span>{job.shift}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compliance Section (Takes up 2 columns on large screens) */}
          {data.compliance && data.compliance.items && (
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between border-b border-clay/40 pb-2">
                <h4 className="text-[11px] font-mono text-taupe uppercase tracking-widest">Credentialing</h4>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                  data.compliance.status.toLowerCase().includes('action') || data.compliance.status.toLowerCase().includes('missing')
                    ? 'bg-red-50 text-red-600 border border-red-100'
                    : 'bg-green-50 text-green-600 border border-green-100'
                }`}>
                  {data.compliance.status}
                </span>
              </div>
              
              <div className="bg-white/40 border border-clay/40 rounded-2xl p-4 space-y-1">
                {data.compliance.items.map((item: any, idx: number) => {
                  const isMissing = item.status.toLowerCase() === 'missing';
                  const isExpiring = item.status.toLowerCase().includes('expiring');
                  const isValid = item.status.toLowerCase() === 'valid';
                  
                  return (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/60 transition-colors">
                      <div className="mt-0.5">
                        {isValid && <CheckCircle2 size={14} className="text-green-500" />}
                        {isExpiring && <AlertTriangle size={14} className="text-amber-500" />}
                        {isMissing && <AlertCircle size={14} className="text-red-500" />}
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-medium ${isMissing ? 'text-red-900' : 'text-charcoal'}`}>
                            {item.document}
                          </span>
                          <span className={`text-[9px] font-mono uppercase tracking-wider ${
                            isValid ? 'text-green-600' : isExpiring ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {item.status}
                          </span>
                        </div>
                        {item.expiry && (
                          <div className="text-[10px] font-mono text-taupe flex items-center gap-1">
                            <Clock size={10} /> Exp: {item.expiry}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
