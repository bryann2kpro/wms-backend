import archiver from 'archiver';
import { PassThrough } from 'node:stream';

/**
 * Bundles an array of in-memory files into a zip archive and returns the result as a Buffer.
 */
export async function buildZip(
  entries: Array<{ filename: string; buffer: Buffer }>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const pass = new PassThrough();
    pass.on('data', (chunk: Buffer) => chunks.push(chunk));
    pass.on('end', () => resolve(Buffer.concat(chunks)));
    pass.on('error', reject);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', reject);
    archive.pipe(pass);

    for (const { filename, buffer } of entries) {
      archive.append(buffer, { name: filename });
    }

    archive.finalize().catch(reject);
  });
}
