import { NextResponse } from 'next/server';
import { testMySQLConnection } from '@/lib/mysql';

export async function GET() {
  try {
    const ok = await testMySQLConnection();
    if (!ok) {
      return NextResponse.json({ ok: false, error: 'MySQL connection failed' }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Unknown error' }, { status: 503 });
  }
}
