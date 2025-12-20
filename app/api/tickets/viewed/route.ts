import { NextRequest, NextResponse } from "next/server"
// Gmail scoping removed; rely on session-based user ID only
import { getCurrentUserIdFromRequest } from "@/lib/session"
import { getTicketViewsForUser } from "@/lib/ticket-views"

export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Pass null for userEmail to avoid Gmail scoping
    const views = await getTicketViewsForUser(userId, null)
    const map: Record<string, string> = {}
    views.forEach((v) => {
      map[v.ticketId] = v.lastViewedAt
    })

    return NextResponse.json({ views: map })
  } catch (error) {
    console.error("Error fetching ticket views:", error)
    return NextResponse.json({ error: "Failed to fetch ticket views" }, { status: 500 })
  }
}

