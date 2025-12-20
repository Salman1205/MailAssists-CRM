import { google } from 'googleapis';

export async function sendViaGmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const sender = process.env.GMAIL_SENDER_EMAIL;

  if (!clientId || !clientSecret || !refreshToken || !sender) {
    throw new Error('Missing Gmail OAuth env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER_EMAIL');
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

  // Build RFC 2822 message
  const boundary = 'mixed_boundary_' + Date.now();
  const from = sender;
  const bodyText = text || '';
  const bodyHtml = html || text || '';

  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    bodyText,
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    bodyHtml,
    `--${boundary}--`,
  ].join('\r\n');

  const raw = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
}
