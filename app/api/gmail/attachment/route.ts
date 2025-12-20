import { NextResponse } from 'next/server'
import { getValidTokens } from '@/lib/token-refresh'
import { getGmailClient } from '@/lib/gmail'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const mid = url.searchParams.get('mid')
    const aid = url.searchParams.get('aid')
    const filename = url.searchParams.get('filename') || 'attachment'

    if (!mid || !aid) {
      return new NextResponse('Missing parameters', { status: 400 })
    }

    const tokens = await getValidTokens()
    if (!tokens || !tokens.access_token) {
      return new NextResponse('Not authenticated', { status: 401 })
    }

    const gmail = getGmailClient(tokens)

    // Fetch the attachment bytes
    const attRes = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: mid,
      id: decodeURIComponent(aid),
    })

    const raw = attRes?.data?.data || attRes?.data || ''
    const base64 = typeof raw === 'string' ? raw.replace(/-/g, '+').replace(/_/g, '/') : ''
    const buffer = Buffer.from(base64, 'base64')

    // Try to determine mime type by fetching the message structure
    let mimeType = 'application/octet-stream'
    try {
      const msg = await gmail.users.messages.get({ userId: 'me', id: mid, format: 'full' })
      const findPart = (part: any): string | null => {
        if (!part) return null
        if (part.body && part.body.attachmentId && String(part.body.attachmentId) === decodeURIComponent(aid)) {
          return part.mimeType || null
        }
        if (part.parts && Array.isArray(part.parts)) {
          for (const p of part.parts) {
            const found = findPart(p)
            if (found) return found
          }
        }
        return null
      }
      const found = findPart(msg.data.payload)
      if (found) mimeType = found
    } catch (err) {
      // ignore and use default
      console.warn('Failed to determine mime type for attachment', err)
    }

    const headers = new Headers()
    headers.set('Content-Type', mimeType)
    headers.set('Content-Disposition', `inline; filename="${filename.replace(/\"/g, '')}"`)
    headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')

    return new NextResponse(buffer, { status: 200, headers })
  } catch (err) {
    console.error('Attachment proxy error:', err)
    return new NextResponse('Attachment fetch failed', { status: 500 })
  }
}
