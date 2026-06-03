import nodemailer from 'nodemailer';
import path from 'path';
import { env } from '@/env';
import { logger } from './logger';

const LOGO_CID = 'sme-logo';
const LOGO_PATH = path.join(process.cwd(), 'public', 'sme-logo.jpg');

export type AdvanceNoticeEmailData = {
  tranid: string;
  duedate: string;
  entity: string;
  lineCount: number;
  receivedAt: Date;
};

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT ?? 465,
  secure: env.SMTP_PORT === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASSWORD,
  },
});

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<void> {
  logger.info('ℹ️ [sendPasswordResetEmail] Sending password reset email to:' + to);
  await transporter.sendMail({
    from: `"SME Edaran WMS" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Reset your password — SME Edaran WMS',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:8px">Reset your password</h2>
        <p style="color:#555;margin-bottom:24px">
          We received a request to reset the password for your SME Edaran WMS account.
          Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
        </p>
        <a href="${resetUrl}"
           style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600">
          Reset password
        </a>
        <p style="color:#888;font-size:12px;margin-top:24px">
          If you did not request a password reset, you can safely ignore this email.
          <br/>Your password will not change until you click the link above.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin-top:32px"/>
        <p style="color:#bbb;font-size:11px">© ${new Date().getFullYear()} SME Edaran. All rights reserved.</p>
      </div>
    `,
  });
  logger.info('✅ [sendPasswordResetEmail] Password reset email sent to:' + to);
}

export async function sendAdvanceNoticeEmail(
  to: string | string[],
  data: AdvanceNoticeEmailData,
  cc?: string | string[],
): Promise<void> {
  logger.info(`ℹ️ [sendAdvanceNoticeEmail] Sending to: ${JSON.stringify(to)}, cc: ${JSON.stringify(cc ?? [])}, tranid: ${data.tranid}`);
  const companyName = env.COMPANY_NAME ?? 'SME Edaran WMS';
  await transporter.sendMail({
    from: `"${companyName}" <${env.SMTP_FROM ?? env.SMTP_USER}>`,
    to,
    cc,
    subject: `New Advance Notice Received — PO ${data.tranid}`,
    html: buildAdvanceNoticeHtml(data, companyName),
    attachments: [
      {
        filename: 'sme-logo.jpg',
        path: LOGO_PATH,
        cid: LOGO_CID,
      },
    ],
  });
  logger.info(`✅ [sendAdvanceNoticeEmail] Email sent, tranid: ${data.tranid}`);
}

function buildAdvanceNoticeHtml(data: AdvanceNoticeEmailData, companyName: string): string {
  const receivedAt = data.receivedAt.toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });
  const wmsUrl = env.FRONTEND_URL ?? '#';
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <div style="margin-bottom:24px">
        <img src="cid:${LOGO_CID}" alt="${companyName}" style="max-height:60px;max-width:200px;object-fit:contain" />
      </div>
      <h2 style="margin-bottom:8px">New Advance Notice Received</h2>
      <p style="color:#555;margin-bottom:24px">
        A new purchase order advance notice has been received from NetSuite and is pending goods receipt.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="border-bottom:1px solid #eee">
          <td style="padding:10px 0;color:#888;width:40%">PO Number</td>
          <td style="padding:10px 0;font-weight:600">${data.tranid}</td>
        </tr>
        <tr style="border-bottom:1px solid #eee">
          <td style="padding:10px 0;color:#888">Supplier</td>
          <td style="padding:10px 0">${data.entity}</td>
        </tr>
        <tr style="border-bottom:1px solid #eee">
          <td style="padding:10px 0;color:#888">Expected Date</td>
          <td style="padding:10px 0">${data.duedate}</td>
        </tr>
        <tr style="border-bottom:1px solid #eee">
          <td style="padding:10px 0;color:#888">Line Items</td>
          <td style="padding:10px 0">${data.lineCount}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#888">Received At</td>
          <td style="padding:10px 0">${receivedAt} (MYT)</td>
        </tr>
      </table>
      <div style="margin-top:28px">
        <a href="${wmsUrl}"
           style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600">
          Open WMS
        </a>
      </div>
      <hr style="border:none;border-top:1px solid #eee;margin-top:32px"/>
      <p style="color:#bbb;font-size:11px">© ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  `;
}
