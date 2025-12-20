/**
 * GET /api/users/me - Get current user info
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserIdFromRequest } from '@/lib/permissions';
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

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error getting current user:', error);
    return NextResponse.json(
      { error: 'Failed to get current user', details: (error as Error).message },
      { status: 500 }
    );
  }
}
