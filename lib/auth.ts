/**
 * Simple authentication utilities
 * Replaces Gmail OAuth with username/password
 */

import bcrypt from 'bcryptjs';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  is_active: boolean;
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
}

/**
 * Authenticate user with username and password
 */
export async function authenticateUser(
  username: string,
  password: string
): Promise<AuthUser | null> {
  // Hardcoded dev login (no DB): admin / Mailassist1205
  const DEV_USER = {
    id: 'admin',
    username: 'admin',
    email: 'admin@example.com',
    is_active: true,
  } as AuthUser;

  if (username === 'admin' && password === 'Mailassist1205') {
    return DEV_USER;
  }
  return null;
}

/**
 * Create a new session for authenticated user
 */
export async function createSession(userId: string): Promise<string> {
  // Stateless dev session token
  const token = generateToken();
  return token;
}

/**
 * Validate session token
 */
export async function validateSession(token: string): Promise<AuthUser | null> {
  // Dev: any non-empty token is treated as valid and maps to admin
  if (!token) return null;
  return {
    id: 'admin',
    username: 'admin',
    email: 'admin@example.com',
    is_active: true,
  };
}

/**
 * Delete session (logout)
 */
export async function deleteSession(token: string): Promise<boolean> {
  // Dev: stateless session, just return true
  return true;
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<void> {
  // Stateless sessions don't need cleanup
  return;
}

/**
 * Generate random session token
 */
function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Hash password for new users
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}
