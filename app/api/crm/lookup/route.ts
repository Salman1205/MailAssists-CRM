import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { getMySQLConnection } from '@/lib/mysql';

function normalizeSender(raw: string | null): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  // Take part after last ':' if present (e.g., "source:email")
  const afterColon = s.includes(':') ? s.split(':').pop()!.trim() : s;
  // If contains angle brackets, take content inside
  const angleMatch = afterColon.match(/<([^>]+)>/);
  const candidate = angleMatch ? angleMatch[1] : afterColon;
  // Strip quotes and whitespace, lower-case
  const cleaned = candidate.replace(/^"|"$/g, '').replace(/[<>]/g, '').trim().toLowerCase();
  // Basic email validation
  if (!cleaned.includes('@')) return null;
  return cleaned;
}

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('session_token')?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await validateSession(sessionToken);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const messageId = searchParams.get('messageId');
    const emailParam = searchParams.get('email');

    if (!messageId && !emailParam) {
      return NextResponse.json(
        { error: 'Provide either messageId or email' },
        { status: 400 }
      );
    }

    try {
      const conn = getMySQLConnection();

      let senderEmail: string | null = null;

      if (messageId) {
        const [rows] = await conn.query<any[]>(
          `SELECT IFNULL(email_from, '') AS email_from
           FROM theinsolvencygroup.message_received
           WHERE id = ?
           LIMIT 1`,
          [parseInt(messageId)]
        );
        const raw = rows && rows[0] ? rows[0].email_from : null;
        senderEmail = normalizeSender(raw);
      } else if (emailParam) {
        senderEmail = normalizeSender(emailParam);
      }

      if (!senderEmail) {
        return NextResponse.json({ found: false, reason: 'No valid sender email' });
      }

      const [clientRows] = await conn.query<any[]>(
        `SELECT 
           c.id AS client_id,
           c.Firstname,
           c.LastName,
           c.Email,
           c.DateofBirth,
           c.Occupation,
           c.MaritalStatus,
           c.Town,
           c.County,
           c.Postcode,
           ic.signing_date AS iva_signing_date,
           COALESCE(ic.completion_date, ic.completed_date) AS iva_completion_date,
           ic.unsecured_debt,
           ic.monthly_payment,
           COALESCE(ic.arrears_balance, ic.arrears) AS arrears_balance
         FROM theinsolvencygroup.client c
         LEFT JOIN theinsolvencygroup.iva_client ic ON ic.clientid = c.id
         WHERE LOWER(c.Email) = ?
         LIMIT 1`,
        [senderEmail]
      );

      if (!clientRows || clientRows.length === 0) {
        return NextResponse.json({ found: false, matchedEmail: senderEmail });
      }

      return NextResponse.json({ found: true, matchedEmail: senderEmail, customer: clientRows[0] });
    } catch (mysqlError) {
      console.error('MySQL lookup failed:', mysqlError);
      return NextResponse.json(
        { found: false, error: 'MySQL unavailable - lookup requires VPN connection' },
        { status: 503 }
      );
    }
  } catch (error: any) {
    console.error('Lookup error:', error);
    return NextResponse.json({ error: 'Lookup failed', details: error.message }, { status: 500 });
  }
}
