import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { fetchEmailById } from '@/lib/mysql';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Validate session
    const sessionToken = request.cookies.get('session_token')?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = await validateSession(sessionToken);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const emailId = parseInt(params.id);
    if (isNaN(emailId)) {
      return NextResponse.json({ error: 'Invalid email ID' }, { status: 400 });
    }

    // Fetch email from CRM
    const email = await fetchEmailById(emailId);
    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Check if regenerate flag is set
    const url = new URL(request.url);
    const regenerate = url.searchParams.get('regenerate') === 'true';

    // Call AI service to generate draft
    // Validate input content length
    const contentText = (email.content || '').trim();
    if (!contentText) {
      return NextResponse.json({ error: 'Email content is empty' }, { status: 400 });
    }

    // Timeout helper
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    let aiData: any = null;
    try {
      const aiResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/ai/generate-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `session_token=${sessionToken}`,
        },
        body: JSON.stringify({
          subject: email.subject,
          from: email.email_from,
          content: contentText,
          clientName: email.Client,
          regenerate,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!aiResponse.ok) {
        const errText = await aiResponse.text().catch(() => '');
        console.error('AI service error:', aiResponse.status, errText);
        return NextResponse.json({ error: 'AI service returned error' }, { status: 502 });
      }
      aiData = await aiResponse.json();
    } catch (aiErr: any) {
      console.error('AI draft generation failed:', aiErr?.message || aiErr);
      return NextResponse.json({ error: 'AI draft generation failed' }, { status: 504 });
    }

    const replyText = (aiData?.reply || '').trim();
    const replyHtml = (aiData?.replyHtml || '').trim() || replyText;
    if (!replyText) {
      return NextResponse.json({ error: 'AI did not produce a reply' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      draft: {
        text: replyText,
        html: replyHtml,
      },
    });
  } catch (error: any) {
    console.error('Error generating draft for CRM email:', error);
    return NextResponse.json(
      { error: 'Failed to generate draft', details: error.message },
      { status: 500 }
    );
  }
}
