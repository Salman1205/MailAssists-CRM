/**
 * Send new email and create ticket
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'Composing/sending new emails is disabled in read-only mode' },
    { status: 501 }
  );
}