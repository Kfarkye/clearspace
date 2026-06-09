export class AccountLedger {
  async resolveAccountRef(userId, serverName) {
    console.log(`[AccountLedger] Resolving credential reference for user ${userId} -> ${serverName}`);
    if (userId === 'user123' && serverName === 'workspace_google_mcp') return 'google_oauth_cred_ref_user123';
    return `generic_cred_ref_${userId}_${serverName}`;
  }
}
