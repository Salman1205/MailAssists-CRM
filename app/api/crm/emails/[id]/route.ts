import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { fetchEmailById } from '@/lib/mysql';
import { getCachedEmailById, cacheEmail } from '@/lib/crm-cache';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Validate session
    const sessionToken = request.cookies.get('session_token')?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = await validateSession(sessionToken);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { id } = await params;
    const emailId = parseInt(id);
    if (isNaN(emailId)) {
      return NextResponse.json({ error: 'Invalid email ID' }, { status: 400 });
    }

    // Check URL param to force refresh
    const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true';

    let email: any = null;
    let fromCache = false;

    // Try cache first (unless forced refresh)
    if (!forceRefresh) {
      const cachedEmail = await getCachedEmailById(emailId);
      if (cachedEmail) {
        console.log(`Retrieved email ${emailId} from Supabase cache`);
        email = {
          crm_message_id: cachedEmail.crm_message_id,
          email_from: cachedEmail.email_from,
          subject: cachedEmail.subject,
          content: cachedEmail.body,
          Received_On: cachedEmail.received_on,
          clientid: cachedEmail.client_id,
          Client: null, // Not stored in cache
          Department: null,
          Assignment: null,
        };
        fromCache = true;
      }
    }

    // Cache miss or forced refresh - fetch from MySQL
    if (!email || forceRefresh) {
      console.log(`Fetching email ${emailId} from MySQL...`);
      email = await fetchEmailById(emailId);
      if (!email) {
        return NextResponse.json({ error: 'Email not found' }, { status: 404 });
      }

      // Cache in background
      cacheEmail(email).catch((err) => {
        console.error('Background cache error:', err);
      });
    }

    // Map to expected format for frontend
    const mappedEmail = {
      id: String(email.crm_message_id),
      threadId: String(email.crm_message_id), // Use CRM message ID as thread ID
      from: email.email_from || '',
      to: '', // CRM doesn't store "to" field
      subject: email.subject || '(no subject)',
      snippet: email.content?.substring(0, 200) || '',
      body: email.content || '',
      date: email.Received_On || new Date().toISOString(),
      crmMessageId: email.crm_message_id,
      clientId: email.clientid,
      clientName: email.Client,
      department: email.Department,
      assignment: email.Assignment,
      fromCache,
    };

    return NextResponse.json({ email: mappedEmail });
  } catch (error: any) {
    console.error('Error fetching CRM email:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email', details: error.message },
      { status: 500 }
    );
  }
}
