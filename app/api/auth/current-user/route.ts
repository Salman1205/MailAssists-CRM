/**
 * Get current user from session
 * Verifies that the user belongs to the current Gmail account
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserIdFromRequest } from '@/lib/session';
import { getUserById } from '@/lib/users';

export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserIdFromRequest(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: 'No user selected' },
        { status: 404 }
      );
    }

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Error fetching current user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch current user', details: (error as Error).message },
      { status: 500 }
    );
  }
}

