import React from 'react';
import { motion } from 'framer-motion';
import { Cloud, Mail, Calendar, HardDrive, CheckCircle2, ShieldCheck, LogOut } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

export const WorkspacePanel: React.FC = () => {
  const { isWorkspaceConnected, handleConnectWorkspace, disconnectWorkspace } = useAppContext();

  if (!isWorkspaceConnected) {
    return (
      <div className="flex flex-col justify-center items-center h-full px-8 pb-10">
        <div className="w-16 h-16 rounded-2xl bg-black/[0.03] flex items-center justify-center mb-6 border border-black/[0.02] shadow-[inset_0_1px_1px_rgba(255,255,255,0.5),0_4px_12px_rgba(0,0,0,0.02)]">
          <Cloud size={28} className="text-[#8C7A6B]" strokeWidth={1.5} />
        </div>
        <h3 className="text-[15px] font-semibold text-[#1D1D1F] tracking-tight mb-2">Connect Google Workspace</h3>
        <p className="text-[13px] text-[#1D1D1F]/50 text-center leading-[1.6] mb-8 text-pretty">
          Authorize Truth to seamlessly retrieve and synthesize data from your Gmail, Calendar, and Drive environments.
        </p>
        
        <div className="w-full flex flex-col gap-2.5 mb-8">
          {[
            { icon: Mail, label: 'Read & compose emails' },
            { icon: Calendar, label: 'Manage schedule & meetings' },
            { icon: HardDrive, label: 'Search documents & drive' }
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 px-1">
              <item.icon size={14} className="text-[#8C7A6B]/50" />
              <span className="text-[12px] text-[#1D1D1F]/70 tracking-tight">{item.label}</span>
            </div>
          ))}
        </div>

        <motion.button 
          whileHover={{ scale: 1.02 }} 
          whileTap={{ scale: 0.98 }} 
          onClick={handleConnectWorkspace} 
          className="flex items-center justify-center gap-2.5 w-full py-3 bg-[#1D1D1F] text-white rounded-xl text-[13px] font-medium tracking-tight shadow-[0_4px_14px_rgba(0,0,0,0.15)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] transition-all outline-none"
        >
          <ShieldCheck size={16} className="text-emerald-400" />
          Authorize Secure Access
        </motion.button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#FAFAFC] relative">
      <div className="px-5 py-6 flex flex-col items-center justify-center bg-white border-b border-black/[0.04]">
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-b from-[#F9F8F6] to-white border border-[#DDD8D2]/50 shadow-[0_4px_12px_rgba(0,0,0,0.03)] flex items-center justify-center mb-4">
          <Cloud size={24} className="text-[#8C7A6B]" strokeWidth={1.5} />
          <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 border border-[#DDD8D2]/50">
            <CheckCircle2 size={16} className="text-emerald-500" fill="currentColor" fillOpacity={0.1} />
          </div>
        </div>
        <h3 className="text-[15px] font-semibold text-[#1D1D1F] tracking-tight">Workspace Connected</h3>
        <p className="text-[11px] text-[#8C7A6B]/70 uppercase tracking-widest mt-1.5 font-semibold">Active Session</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <h4 className="text-[10px] font-semibold tracking-widest uppercase text-[#8C7A6B]/50 px-2 mb-3">Active Integrations</h4>
          <div className="bg-white rounded-[16px] border border-black/[0.04] shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
            {[
              { id: 'gmail', name: 'Gmail Intelligence', icon: Mail, status: 'Synced' },
              { id: 'cal', name: 'Calendar Engine', icon: Calendar, status: 'Synced' },
              { id: 'drive', name: 'Drive Indexing', icon: HardDrive, status: 'Synced' }
            ].map((int, idx, arr) => (
              <div key={int.id} className={`flex items-center justify-between p-4 ${idx !== arr.length - 1 ? 'border-b border-black/[0.03]' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#8C7A6B]/[0.04] flex items-center justify-center text-[#8C7A6B]/70">
                    <int.icon size={14} strokeWidth={2} />
                  </div>
                  <span className="text-[13px] font-medium text-[#1D1D1F] tracking-tight">{int.name}</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 rounded-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">{int.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="pt-6 px-1">
          <button 
            onClick={disconnectWorkspace}
            className="flex items-center gap-2 text-[12px] font-medium text-[#FF3B30]/80 hover:text-[#FF3B30] transition-colors group"
          >
            <LogOut size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            Revoke Access
          </button>
        </div>
      </div>
    </div>
  );
};
