/**
 * Send a previously generated draft as a reply via Gmail
 */

import { NextRequest, NextResponse } from 'next/server';

function stripHtml(html: string) {
  if (!html) return ''
  return html.replace(/<style[^>]*>.*?<\/style>/gis, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

type RouteContext =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> };
  return NextResponse.json(
    { error: 'Reply sending is disabled in read-only mode' },
    { status: 501 }
  );
    return NextResponse.json(
      {
        error: 'Failed to send reply',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}


