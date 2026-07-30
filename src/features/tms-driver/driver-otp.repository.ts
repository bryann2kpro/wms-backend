/**
 * Driver OTP Repository
 *
 * @description Data access layer for WhatsApp OTP login codes.
 */

import { db } from '@/db';
import { DriverOtpCodesTable } from './driver-otp.model';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { hashPassword, comparePassword } from '@/util/password';
import { logger } from '@/util/logger';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 5;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits, never leading-zero-only
}

export class DriverOtpRepositoryClass {
  constructor() {}

  /** Returns the plaintext code to send via WhatsApp, or null if a code was already sent too recently (cooldown). */
  async createOtp(driverId: string, phone: string): Promise<string | null> {
    const [recent] = await db
      .select()
      .from(DriverOtpCodesTable)
      .where(and(eq(DriverOtpCodesTable.driverId, driverId), gt(DriverOtpCodesTable.createdAt, new Date(Date.now() - OTP_RESEND_COOLDOWN_MS))))
      .orderBy(desc(DriverOtpCodesTable.createdAt))
      .limit(1);
    if (recent) {
      logger.warn(`⚠️ [DriverOtpRepository.createOtp] Cooldown active for driver ${driverId}`);
      return null;
    }

    const code = generateCode();
    const codeHash = await hashPassword(code);
    await db.insert(DriverOtpCodesTable).values({
      driverId,
      phone,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
    return code;
  }

  /** Verifies a code for the given driver. Returns true on success (and marks the code consumed); false otherwise. */
  async verifyOtp(driverId: string, code: string): Promise<boolean> {
    const [otp] = await db
      .select()
      .from(DriverOtpCodesTable)
      .where(
        and(
          eq(DriverOtpCodesTable.driverId, driverId),
          isNull(DriverOtpCodesTable.consumedAt),
          gt(DriverOtpCodesTable.expiresAt, new Date())
        )
      )
      .orderBy(desc(DriverOtpCodesTable.createdAt))
      .limit(1);

    if (!otp) return false;
    if (otp.attempts >= MAX_ATTEMPTS) return false;

    const isValid = await comparePassword(code, otp.codeHash);
    if (!isValid) {
      await db
        .update(DriverOtpCodesTable)
        .set({ attempts: otp.attempts + 1 })
        .where(eq(DriverOtpCodesTable.id, otp.id));
      return false;
    }

    await db.update(DriverOtpCodesTable).set({ consumedAt: new Date() }).where(eq(DriverOtpCodesTable.id, otp.id));
    return true;
  }
}
