import crypto from 'crypto';
import { env } from '@/env.js';
import { logger } from '@/util/logger.js';

export class NetSuiteService {
  /**
   * Build the OAuth 1.0a TBA Authorization header for a NetSuite RESTlet request.
   */
  private buildAuthHeader(url: string, method: string): string {
    // OAuth credentials must be plain ASCII — header values can't carry code points > 255
    // (fetch throws "Cannot convert argument to a ByteString"). Strip stray Unicode
    // whitespace (e.g. U+202F narrow no-break space) that can sneak in via copy-paste.
    const sanitize = (label: string, raw: string) => {
      const badIdx = [...raw].findIndex((ch) => ch.codePointAt(0)! > 255);
      if (badIdx !== -1) {
        logger.warn(`⚠️ [NetSuiteService.buildAuthHeader] env ${label} has non-Latin1 char (code ${raw.codePointAt(badIdx)}) at index ${badIdx} — stripping`);
      }
      return raw.replace(/[^\x00-\xFF]/g, '').trim();
    };
    const accountId = sanitize('NETSUITE_ACCOUNT_ID', env.NETSUITE_ACCOUNT_ID);
    const consumerKey = sanitize('NETSUITE_CONSUMER_KEY', env.NETSUITE_CONSUMER_KEY);
    const consumerSecret = sanitize('NETSUITE_CONSUMER_SECRET', env.NETSUITE_CONSUMER_SECRET);
    const tokenId = sanitize('NETSUITE_TOKEN_ID', env.NETSUITE_TOKEN_ID);
    const tokenSecret = sanitize('NETSUITE_TOKEN_SECRET', env.NETSUITE_TOKEN_SECRET);
    sanitize('NETSUITE_ITEM_RECEIPT_URL (diagnostic only — not stripped)', url);

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

    // Per OAuth 1.0a (RFC 5849 §3.4.1.3), query-string params must be
    // merged with OAuth params before sorting for the signature base string.
    const parsedUrl = new URL(url);
    const baseUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;

    const allParams: Record<string, string> = { ...oauthParams };
    parsedUrl.searchParams.forEach((value, key) => {
      allParams[key] = value;
    });

    const sortedParams = Object.entries(allParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
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
