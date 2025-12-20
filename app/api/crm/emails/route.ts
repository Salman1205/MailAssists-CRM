/**
 * CRM Emails API - Fetch unassigned emails with Supabase caching
 * GET /api/crm/emails
 * 
 * Flow:
 * 1. Check Supabase cache first (fast)
 * 2. If cache miss or stale, fetch from MySQL (slow over VPN)
 * 3. Cache the MySQL results in Supabase for next time
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchUnassignedEmails } from '@/lib/mysql';
import { validateSession } from '@/lib/auth';
import { getCachedEmails, cacheEmails } from '@/lib/crm-cache';

export async function GET(request: NextRequest) {
  try {
    // Validate session
    const token = request.cookies.get('session_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await validateSession(token);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Always fetch the full set from MySQL (this ensures we show all unassigned messages)
    // and then cache the results in Supabase for faster subsequent access.
    console.log('Fetching emails from MySQL CRM database (primary source)...');
    const mysqlEmails = await fetchUnassignedEmails();

    // Cache in background (don't block response)
    cacheEmails(mysqlEmails).catch((err) => {
      console.error('Background cache error:', err);
    });

    const emails = mysqlEmails;
    const fromCache = false;

    return NextResponse.json({
      success: true,
      emails,
      count: emails.length,
      fromCache,
    });
  } catch (error) {
    console.error('Error fetching CRM emails:', error);
    return NextResponse.json(
      { error: 'Failed to fetch emails', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
