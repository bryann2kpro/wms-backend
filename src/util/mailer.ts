import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<void> {
  await transporter.sendMail({
    from: `"SME Ederan WMS" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Reset your password — SME Ederan WMS',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:8px">Reset your password</h2>
        <p style="color:#555;margin-bottom:24px">
          We received a request to reset the password for your SME Ederan WMS account.
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
        <p style="color:#bbb;font-size:11px">© ${new Date().getFullYear()} SME Ederan. All rights reserved.</p>
      </div>
    `,
  });
}
