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

    // Check URL param to force refresh
    const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true';

    let emails: any[] = [];
    let fromCache = false;

    // Try cache first (unless forced refresh)
    if (!forceRefresh) {
      const cachedEmails = await getCachedEmails();
      if (cachedEmails && cachedEmails.length > 0) {
        console.log(`Retrieved ${cachedEmails.length} emails from Supabase cache`);
        emails = cachedEmails;
        fromCache = true;
      }
    }

    // Cache miss or forced refresh - fetch from MySQL
    if (emails.length === 0 || forceRefresh) {
      console.log('Fetching emails from MySQL CRM database...');
      const mysqlEmails = await fetchUnassignedEmails();
      emails = mysqlEmails;

      // Cache in background (don't wait)
      cacheEmails(mysqlEmails).catch((err) => {
        console.error('Background cache error:', err);
      });
    }

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
