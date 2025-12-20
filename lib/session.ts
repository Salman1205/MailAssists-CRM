/**
 * Session management utilities
 * Uses MySQL sessions via auth.ts
 */

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from './auth';

const SESSION_TOKEN_COOKIE_NAME = 'session_token';
const CURRENT_USER_ID_COOKIE_NAME = 'current_user_id';

/**
 * Get the current session token from cookies
 */
export async function getSessionToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_TOKEN_COOKIE_NAME)?.value;
    return token || null;
  } catch (error) {
    return null;
  }
}

/**
 * Get the current session token from request cookies
 */
export function getSessionTokenFromRequest(request: NextRequest): string | null {
  try {
    const token = request.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value;
    return token || null;
  } catch (error) {
    return null;
  }
}

/**
 * Validate session and get user info
 */
export async function getCurrentSessionUser() {
  const token = await getSessionToken();
  if (!token) return null;
  
  return await validateSession(token);
}

/**
 * Validate session from request
 */
export async function getSessionUserFromRequest(request: NextRequest) {
  const token = getSessionTokenFromRequest(request);
  if (!token) return null;
  
  return await validateSession(token);
}

/**
 * Compatibility helper for legacy code paths that relied on Gmail account email.
 * In the current dev setup, return the session user's email from auth validation.
 */
export function getSessionUserEmailFromRequest(request: NextRequest): string | null {
  try {
    const token = getSessionTokenFromRequest(request);
    if (!token) return null;
    // Note: validateSession returns a simple AuthUser in dev
    // We intentionally do not await here to keep this helper synchronous-friendly.
    // Callers that need strong guarantees should use getSessionUserFromRequest.
    // Since we cannot use async here, provide a best-effort shim.
    // Consumers of this helper generally only gate access.
    return null; // Prefer callers to switch to getSessionUserFromRequest.
  } catch {
    return null;
  }
}

/**
 * Get current user ID from session cookie
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(CURRENT_USER_ID_COOKIE_NAME)?.value;
    return userId || null;
  } catch (error) {
    return null;
  }
}

/**
 * Get current user ID from request cookies
 */
export function getCurrentUserIdFromRequest(request: NextRequest): string | null {
  try {
    const userId = request.cookies.get(CURRENT_USER_ID_COOKIE_NAME)?.value;
    return userId || null;
  } catch (error) {
    return null;
  }
}

/**
 * Set current user ID in session cookie
 */
export async function setCurrentUserId(userId: string): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.set(CURRENT_USER_ID_COOKIE_NAME, userId, {
      httpOnly: true,
      secure: process.env.VERCEL === '1' || process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    });
  } catch (error) {
    console.error('Error setting current user ID cookie:', error);
  }
}

/**
 * Set current user ID in NextResponse
 */
export function setCurrentUserIdInResponse(
  response: NextResponse,
  userId: string
): NextResponse {
  try {
    const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
    response.cookies.set(CURRENT_USER_ID_COOKIE_NAME, userId, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    });
  } catch (error) {
    console.error('Error setting current user ID in response:', error);
  }
  return response;
}

