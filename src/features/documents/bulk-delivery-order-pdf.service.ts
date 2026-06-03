import { generateDeliveryOrderPdfData } from '@/features/documents/documents.service';
import { io } from '@/socket/socket-server';
import { logger } from '@/util/logger';
import { createSemaphore } from '@/util/semaphore';
import { buildZip } from '@/util/zip';

/**
 * Fire-and-forget bulk Delivery Order PDF generation job.
 * Generates up to `deliveryOrderIds.length` DOs concurrently (max 3 at a time),
 * bundles them into a zip, and streams progress + result back via Socket.IO.
 *
 * Socket events emitted to room `job:{jobId}`:
 *   bulk-pdf:progress  { jobId, completed, total, currentFilename }
 *   bulk-pdf:complete  { jobId, zipBase64, zipFilename, successCount, failedCount }
 *   bulk-pdf:error     { jobId, message }
 */
export async function runBulkDeliveryOrderPdfJob(
  jobId: string,
  deliveryOrderIds: string[],
): Promise<void> {
  const room = `job:${jobId}`;
  const total = deliveryOrderIds.length;
  let completed = 0;

  const semaphore = createSemaphore(3);

  try {
    io.to(room).emit('bulk-pdf:progress', {
      jobId,
      completed: 0,
      total,
      currentFilename: '',
    });

    const results = await Promise.allSettled(
      deliveryOrderIds.map((id) =>
        semaphore(async () => {
          try {
            const result = await generateDeliveryOrderPdfData(id);
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
      .filter(
        (r): r is PromiseFulfilledResult<{ pdfBase64: string; filename: string }> =>
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
    const zipFilename = `Delivery_Orders_${dateStr}.zip`;

    io.to(room).emit('bulk-pdf:complete', {
      jobId,
      zipBase64,
      zipFilename,
      successCount: succeeded.length,
      failedCount,
    });
  } catch (err) {
    logger.error('[bulk-delivery-order-pdf] Job failed unexpectedly', err);
    io.to(room).emit('bulk-pdf:error', {
      jobId,
      message: 'Bulk delivery order PDF generation failed unexpectedly',
    });
  }
}
