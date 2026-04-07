import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import { generateProformaInvoicePdf } from '@/features/documents/documents.service';
import { io } from '@/socket/socket-server';
import { logger } from '@/util/logger';

// ============================================
// SEMAPHORE — limits concurrent Puppeteer instances
// ============================================

function createSemaphore(limit: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (running >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    running++;
    try {
      return await fn();
    } finally {
      running--;
      queue.shift()?.();
    }
  };
}

// ============================================
// ZIP BUILDER
// ============================================

async function buildZip(
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

// ============================================
// BULK JOB
// ============================================

/**
 * Fire-and-forget bulk PDF generation job.
 * Generates up to `invoiceIds.length` proforma PDFs concurrently (max 3 at a time),
 * bundles them into a zip, and streams progress + result back via Socket.IO.
 *
 * Socket events emitted to room `job:{jobId}`:
 *   bulk-pdf:progress  { jobId, completed, total, currentFilename }
 *   bulk-pdf:complete  { jobId, zipBase64, zipFilename, successCount, failedCount }
 *   bulk-pdf:error     { jobId, message }
 */
export async function runBulkProformaPdfJob(
  jobId: string,
  invoiceIds: string[],
  organizationId: string,
): Promise<void> {
  const room = `job:${jobId}`;
  const total = invoiceIds.length;
  let completed = 0;

  const semaphore = createSemaphore(3);

  try {
    // Announce job start
    io.to(room).emit('bulk-pdf:progress', {
      jobId,
      completed: 0,
      total,
      currentFilename: '',
    });

    const results = await Promise.allSettled(
      invoiceIds.map((id) =>
        semaphore(async () => {
          try {
            const result = await generateProformaInvoicePdf(id, organizationId);
            completed++;
            io.to(room).emit('bulk-pdf:progress', {
              jobId,
              completed,
              total,
              currentFilename: result.filename,
            });
            return result;
          } catch (err) {
            completed++;
            io.to(room).emit('bulk-pdf:progress', {
              jobId,
              completed,
              total,
              currentFilename: '',
            });
            throw err;
          }
        }),
      ),
    );

    const succeeded = results
      .filter((r): r is PromiseFulfilledResult<{ pdfBase64: string; filename: string }> =>
        r.status === 'fulfilled',
      )
      .map((r) => r.value);

    const failedCount = results.filter((r) => r.status === 'rejected').length;

    const zipEntries = succeeded.map(({ pdfBase64, filename }) => ({
      filename,
      buffer: Buffer.from(pdfBase64, 'base64'),
    }));

    const zipBuffer = await buildZip(zipEntries);
    const zipBase64 = zipBuffer.toString('base64');
    const dateStr = new Date().toISOString().slice(0, 10);
    const zipFilename = `Proforma_Invoices_${dateStr}.zip`;

    io.to(room).emit('bulk-pdf:complete', {
      jobId,
      zipBase64,
      zipFilename,
      successCount: succeeded.length,
      failedCount,
    });
  } catch (err) {
    logger.error('[bulk-pdf] Job failed unexpectedly', err);
    io.to(room).emit('bulk-pdf:error', {
      jobId,
      message: 'Bulk PDF generation failed unexpectedly',
    });
  }
}
