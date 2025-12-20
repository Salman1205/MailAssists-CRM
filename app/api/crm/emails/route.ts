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

    let emails: any[] = [];
    let fromCache = false;

    // Try to fetch from MySQL first
    try {
      console.log('Fetching emails from MySQL CRM database (primary source)...');
      emails = await fetchUnassignedEmails();
      
      // Cache in background (don't block response)
      cacheEmails(emails).catch((err) => {
        console.error('Background cache error:', err);
      });
    } catch (mysqlError) {
      console.warn('MySQL fetch failed, trying Supabase cache:', mysqlError instanceof Error ? mysqlError.message : 'Unknown error');
      
      // Fallback to Supabase cache if MySQL fails
      try {
        const cached = await getCachedEmails();
        if (cached && cached.length > 0) {
          emails = cached;
          fromCache = true;
          console.log('Using cached emails from Supabase');
        } else {
          console.log('No cached emails available');
          emails = [];
        }
      } catch (cacheError) {
        console.error('Supabase cache also failed:', cacheError instanceof Error ? cacheError.message : 'Unknown error');
        emails = [];
      }
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
