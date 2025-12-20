/**
 * Authentication API - Logout endpoint
 * POST /api/auth/logout
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('session_token')?.value;

    if (token) {
      await deleteSession(token);
    }

    // Clear session cookie
    const response = NextResponse.json({ 
      success: true, 
      message: 'Logged out successfully.' 
    });
    
    response.cookies.delete('session_token');
    response.cookies.delete('current_user_id');
    
    return response;
  } catch (error) {
    console.error('Error during logout:', error);
    const response = NextResponse.json(
      { error: 'Failed to logout', details: (error as Error).message },
      { status: 500 }
    );
    response.cookies.delete('session_token');
    response.cookies.delete('current_user_id');
    
    return response;
  }
}
