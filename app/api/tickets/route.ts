/**
 * GET /api/tickets - List tickets with role-based filtering
 * - Agents: see only their own tickets + unassigned tickets
 * - Admin/Manager: see all tickets
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTickets } from '@/lib/tickets';
import { getCurrentUserIdFromRequest } from '@/lib/permissions';
import { canViewAllTickets } from '@/lib/permissions';
// Removed Gmail dependency: tickets are scoped by user role only

export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Check if user can view all tickets (Admin/Manager)
    const canViewAll = await canViewAllTickets(userId);

    // Get tickets with role-based filtering
    const tickets = await getTickets(userId, canViewAll);

    return NextResponse.json({ tickets });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tickets', details: (error as Error).message },
      { status: 500 }
    );
  }
}





