import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// NEEDS INTEGRATION TESTING.
// This performs a real OAuth2 refresh-token grant against Google's token
// endpoint. It was written without a live Google project to test against, so
// treat it as unverified until exercised end to end with real Secret Manager
// secrets and a real client. In particular, confirm:
//   - secret naming convention matches how refresh tokens are actually stored
//   - the client_id / client_secret source below matches your deployment
//   - error/expiry handling behaves under real token rotation
export class OAuthTokenBroker {
  constructor(writeTrace) {
    this.writeTrace = writeTrace;
    this.secretClient = process.env.NODE_ENV === 'production' ? new SecretManagerServiceClient() : null;
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT || 'aura-production-2026';
    this.tokenEndpoint = 'https://oauth2.googleapis.com/token';
  }

  async _accessSecret(name) {
    const [version] = await this.secretClient.accessSecretVersion({ name });
    return version.payload.data.toString('utf8');
  }

  async getEphemeralAccessToken(userId, provider = 'google_workspace') {
    if (process.env.NODE_ENV !== 'production') {
      return { access_token: `mock-dev-token-${userId}`, expires_in: 3600, mock: true };
    }
    try {
      const refreshToken = await this._accessSecret(
        `projects/${this.projectId}/secrets/oauth-${provider}-${userId}/versions/latest`
      );
      const clientId = await this._accessSecret(
        `projects/${this.projectId}/secrets/oauth-${provider}-client-id/versions/latest`
      );
      const clientSecret = await this._accessSecret(
        `projects/${this.projectId}/secrets/oauth-${provider}-client-secret/versions/latest`
      );

      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      });

      const response = await fetch(this.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Token endpoint returned ${response.status}: ${errText}`);
      }

      const data = await response.json();
      if (!data.access_token) throw new Error('Token endpoint response missing access_token.');

      if (this.writeTrace) this.writeTrace('OAUTH_TOKEN_BROKER_RETRIEVAL', { userId, provider, brokerIdentity: 'aura-oauth-broker-sa' });
      return { access_token: data.access_token, expires_in: data.expires_in || 3600 };
    } catch (error) {
      if (this.writeTrace) this.writeTrace('OAUTH_TOKEN_BROKER_ERROR', { userId, error: error.message });
      throw new Error(`OAuth token retrieval failed for ${provider}: ${error.message}`);
    }
  }
}
