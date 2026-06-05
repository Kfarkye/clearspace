// ============================================================================
// DashboardView — Main chat interface (route: "/")
//
// Pulls chat state from AppContext. Renders TruthChat + ConversationSidebar.
// ============================================================================

import React from 'react';
import TruthChat from '../components/TruthChat';
import { ConversationSidebar } from '../components/ConversationSidebar';
import { useAppContext } from '../context/AppContext';

const DashboardView: React.FC = () => {
  const {
    messages,
    isLoading,
    handleSendMessage,
    chatMode,
    thinkingMode,
    setThinkingMode,
    workspaceToken,
    retryFailedSaves,
    isSidebarOpen,
    setIsSidebarOpen,
    loadConversation,
    conversationId,
    isGitHubConnected,
    githubUser,
    handleConnectGitHub,
    handleDisconnectGitHub,
  } = useAppContext();

  return (
    <>
      <TruthChat 
        messages={messages} 
        isLoading={isLoading} 
        onSendMessage={handleSendMessage} 
        chatMode={chatMode}
        thinkingMode={thinkingMode}
        onThinkingModeChange={setThinkingMode}
        workspaceToken={workspaceToken}
        onRetrySave={retryFailedSaves}
      />
      
      <ConversationSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSelectConversation={loadConversation}
        activeConversationId={conversationId}
        isGitHubConnected={isGitHubConnected}
        githubUser={githubUser}
        onConnectGitHub={handleConnectGitHub}
        onDisconnectGitHub={handleDisconnectGitHub}
      />
    </>
  );
};

export default DashboardView;
