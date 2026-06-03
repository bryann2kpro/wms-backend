/**
 * Loads SME logo from `public/sme-logo.jpg` as a data URL for HTML/PDF templates.
 * Shared by documents and reports to avoid circular imports (documents → report).
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@/util/logger';

let cachedLogoDataUrlPromise: Promise<string | null> | null = null;

export async function getSmeLogoDataUrl(): Promise<string | null> {
  if (!cachedLogoDataUrlPromise) {
    cachedLogoDataUrlPromise = (async () => {
      try {
        const logoPath = path.resolve(process.cwd(), 'public', 'sme-logo.jpg');
        const buf = await readFile(logoPath);
        return `data:image/jpeg;base64,${buf.toString('base64')}`;
      } catch (error) {
        logger.warn('⚠️ [sme-logo.getSmeLogoDataUrl] Failed to load logo, continuing without it.', error);
        return null;
      }
    })();
  }
  return cachedLogoDataUrlPromise;
}

/** `<img class="logo" …>` or empty string if file missing */
export async function getSmeLogoImgHtml(alt = 'SME Edaran'): Promise<string> {
  const dataUrl = await getSmeLogoDataUrl();
  if (!dataUrl) return '';
  const safeAlt = alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<img class="logo" alt="${safeAlt}" src="${dataUrl}" />`;
}
