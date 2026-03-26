import crypto from 'crypto';
import { env } from '@/env.js';
import { logger } from '@/util/logger.js';

export class NetSuiteService {
  /**
   * Build the OAuth 1.0a TBA Authorization header for a NetSuite RESTlet request.
   */
  private buildAuthHeader(url: string, method: string): string {
    const accountId = env.NETSUITE_ACCOUNT_ID;
    const consumerKey = env.NETSUITE_CONSUMER_KEY;
    const consumerSecret = env.NETSUITE_CONSUMER_SECRET;
    const tokenId = env.NETSUITE_TOKEN_ID;
    const tokenSecret = env.NETSUITE_TOKEN_SECRET;

    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: consumerKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA256',
      oauth_timestamp: timestamp,
      oauth_token: tokenId,
      oauth_version: '1.0',
    };

    // Build base string: METHOD&encodedURL&encodedParams (sorted)
    const sortedParams = Object.entries(oauthParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    // Strip query string from URL for base string (use only base URL)
    const baseUrl = url.split('?')[0];
    const baseString = `${method.toUpperCase()}&${encodeURIComponent(baseUrl)}&${encodeURIComponent(sortedParams)}`;

    // Signing key
    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;

    // HMAC-SHA256 signature
    const signature = crypto
      .createHmac('sha256', signingKey)
      .update(baseString)
      .digest('base64');

    const headerParts = [
      `realm="${accountId}"`,
      `oauth_consumer_key="${consumerKey}"`,
      `oauth_token="${tokenId}"`,
      `oauth_signature_method="HMAC-SHA256"`,
      `oauth_timestamp="${timestamp}"`,
      `oauth_nonce="${nonce}"`,
      `oauth_version="1.0"`,
      `oauth_signature="${encodeURIComponent(signature)}"`,
    ];

    return `OAuth ${headerParts.join(', ')}`;
  }

  /**
   * POST an Item Receipt payload to the NetSuite RESTlet.
   * Returns the parsed response body and HTTP status.
   */
  async postItemReceipt(payload: unknown): Promise<{ status: number; body: unknown }> {
    const url = env.NETSUITE_ITEM_RECEIPT_URL;
    const method = 'POST';
    const authHeader = this.buildAuthHeader(url, method);

    logger.info(`ℹ️ [NetSuiteService.postItemReceipt] POSTing to ${url}`);

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(payload),
    });

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => null);
    }

    logger.info(`ℹ️ [NetSuiteService.postItemReceipt] Response status: ${response.status}`);
    if (!response.ok) {
      logger.warn(`⚠️ [NetSuiteService.postItemReceipt] Non-2xx response: ${response.status}`, body);
    }

    return { status: response.status, body };
  }
}
