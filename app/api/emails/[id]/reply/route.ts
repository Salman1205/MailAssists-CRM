/**
 * Reply sending is intentionally disabled in this build (read-only mode).
 */

import { NextRequest, NextResponse } from 'next/server'

type RouteContext =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, _context: RouteContext) {
  return NextResponse.json(
    { error: 'Reply sending is disabled in read-only mode' },
    { status: 501 }
  )
}


