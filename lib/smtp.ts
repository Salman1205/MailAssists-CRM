import nodemailer from 'nodemailer';

export function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP configuration is missing (SMTP_HOST, SMTP_USER, SMTP_PASS)');
  }

  const secure = port === 465; // true for 465, false for other ports

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  attachments,
}: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{ filename: string; mimeType: string; data: string }>;
}) {
  const transporter = getTransporter();
  const from = process.env.FROM_EMAIL || process.env.SMTP_USER || 'support@example.com';

  const mailOptions: any = {
    from,
    to,
    subject,
    text,
    html,
  };

  if (attachments && attachments.length > 0) {
    mailOptions.attachments = attachments.map((att) => ({
      filename: att.filename,
      content: Buffer.from(att.data, 'base64'),
      contentType: att.mimeType,
    }));
  }

  return await transporter.sendMail(mailOptions);
}
