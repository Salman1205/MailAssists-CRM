"use client"

import { useEffect, useState, useCallback } from "react"

interface Email {
  id: string
  from: string
  subject: string
  snippet: string
  date: string
  crmMessageId?: number
  clientId?: number
  threadId?: string
  body?: string
  to?: string
}

interface EmailListProps {
  selectedEmail: string | null
  onSelectEmail: (id: string, emailData?: any) => void
  onLoadingChange?: (loading: boolean) => void
  viewType?: "inbox" | "sent" | "spam" | "trash"
  onRefreshReady?: (refreshFn: () => void) => void
  searchQuery?: string
}

export default function EmailList({ selectedEmail, onSelectEmail, onLoadingChange, viewType = "inbox", onRefreshReady, searchQuery = "" }: EmailListProps) {
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState(20)
  const [hasMore, setHasMore] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  // Extract a short preview from email content: first non-empty line of plain text
  const getPreview = (content?: string) => {
    if (!content) return "";
    // Strip basic HTML tags if present
    const text = content
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    // First non-empty sentence/line
    const first = text.split(/\n|\.|!|\?/).map(s => s.trim()).find(s => s.length > 0);
    return first ? first.slice(0, 180) : text.slice(0, 180);
  };

  const fetchEmails = async (newLimit = limit, isLoadMore = false, silent = false) => {
    try {
      if (!silent) {
        if (isLoadMore) {
          setLoadingMore(true)
        } else {
          setLoading(true)
        }
        onLoadingChange?.(true)
      }
      setError(null)
      
      // Fetch unassigned CRM emails (only inbox supported for now)
      const url = `/api/crm/emails`

      const response = await fetch(url, {
        cache: isLoadMore ? 'default' : 'no-cache'
      })
      
      if (!response.ok) {
        if (response.status === 401) {
          setError('Not authenticated')
          return
        }
        throw new Error('Failed to fetch emails')
      }

      const data = await response.json()
      
      // Map CRM emails to Email interface
      const mappedEmails = (data.emails || []).map((email: any) => ({
        id: String(email.crm_message_id),
        from: email.email_from || '',
        to: email.mailto || '',
        subject: email.subject || '(no subject)',
        // Handle both MySQL field `content` and cache field `body`
        snippet: getPreview(email.content ?? email.body) || '',
        body: email.content ?? email.body ?? '',
        // Handle both MySQL `Received_On` and cache `received_on`
        date: email.Received_On || email.received_on || new Date().toISOString(),
        crmMessageId: email.crm_message_id,
        clientId: email.clientid ?? email.client_id,
        threadId: String(email.crm_message_id), // Use CRM message ID as thread ID
      }))
      
      // Deduplicate by ID (in case UNION ALL returns duplicates)
      const uniqueEmails = Array.from(
        new Map(mappedEmails.map((email: Email) => [email.id, email])).values()
      )
      
      setEmails(uniqueEmails)
      setLimit(newLimit)
      setHasMore(false) // CRM query returns all unassigned (no pagination for now)
      setLastRefreshed(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load emails')
      console.error('Error fetching emails:', err)
    } finally {
      if (!silent) {
        setLoading(false)
        setLoadingMore(false)
        onLoadingChange?.(false)
      }
    }
  }

  // Memoized refresh function to prevent infinite loops (silent refresh)
  const handleRefresh = useCallback(() => {
    fetchEmails(limit, false, true)
  }, [limit])

  // Expose refresh function to parent component
  useEffect(() => {
    if (onRefreshReady) {
      onRefreshReady(handleRefresh)
    }
  }, [onRefreshReady, handleRefresh])

  // Auto-poll for new emails every 30 seconds (silent refresh)
  useEffect(() => {
    const pollInterval = setInterval(() => {
      console.log('Auto-polling for new emails...')
      fetchEmails(limit, false, true)
    }, 30000) // 30 seconds

    return () => clearInterval(pollInterval)
  }, [limit])

  // Update last refreshed display every second
  useEffect(() => {
    const updateInterval = setInterval(() => {
      // Force re-render by accessing a dummy state
      // This ensures the getLastRefreshedText() function is recalculated
      setLastRefreshed((prev) => prev ? new Date(prev.getTime()) : null)
    }, 1000) // 1 second

    return () => clearInterval(updateInterval)
  }, [])

  // Reset and fetch when viewType changes
  useEffect(() => {
    setEmails([])
    setError(null)
    setLoading(true)
    setLoadingMore(false)
    setLimit(20)
    setHasMore(true)
    fetchEmails(20)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewType])

  const handleLoadMore = () => {
    const nextLimit = limit + 20
    fetchEmails(nextLimit, true)
  }

  const parseToDate = (value: string) => {
    if (!value) return null;
    // If numeric epoch seconds
    if (/^\d+$/.test(value)) {
      const secs = parseInt(value, 10);
      return new Date(secs * 1000);
    }
    // If MySQL timestamp like "YYYY-MM-DD HH:MM:SS" optionally with +00
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(.+)?$/.test(value)) {
      const iso = value.replace(" ", "T");
      // Append Z if no timezone info
      const finalIso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
      const d = new Date(finalIso);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  };

  const formatDate = (dateString: string) => {
    const date = parseToDate(dateString);
    if (!date) return dateString;

    const now = new Date();
    let diffMs = now.getTime() - date.getTime();
    // If future (timezone issues), treat as 0m
    if (diffMs < 0) diffMs = 0;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  }

  // Format last refreshed time
  const getLastRefreshedText = () => {
    if (!lastRefreshed) return "Never"
    const now = new Date()
    const diffMs = now.getTime() - lastRefreshed.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffSecs / 60)
    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    return lastRefreshed.toLocaleTimeString()
  }

  if (loading && !loadingMore) {
    return (
      <div className="p-4 space-y-3 animate-in fade-in duration-300">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border border-border/50 rounded-xl p-4 bg-card">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="h-5 bg-muted rounded w-1/3 animate-pulse" />
                  <div className="h-4 bg-muted rounded w-16 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-2/3 animate-pulse" />
                  <div className="h-4 bg-muted rounded w-full animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error && !loadingMore) {
    return (
      <div className="flex items-center justify-center p-12 animate-in fade-in duration-300">
        <div className="text-center space-y-5 max-w-sm">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-destructive/15 via-destructive/10 to-destructive/5 flex items-center justify-center mx-auto shadow-lg border-2 border-destructive/20">
            <svg className="w-12 h-12 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="space-y-3">
            <div className="text-base font-bold text-destructive">Failed to load emails</div>
            <p className="text-sm text-muted-foreground leading-relaxed">{error}</p>
            <button
              onClick={() => fetchEmails()}
              className="text-sm text-primary hover:underline font-semibold mt-2"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (emails.length === 0 && !loadingMore) {
    return (
      <div className="flex items-center justify-center p-12 animate-in fade-in duration-300">
        <div className="text-center space-y-5 max-w-sm">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/15 via-accent/10 to-primary/5 flex items-center justify-center mx-auto shadow-lg border-2 border-primary/20">
            <svg className="w-12 h-12 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="space-y-3">
            <div className="text-base font-bold text-foreground">No emails found</div>
            <p className="text-sm text-muted-foreground leading-relaxed">Try checking another folder or refresh the page</p>
          </div>
        </div>
      </div>
    )
  }

  const getInitials = (from: string) => {
    const name = from.split("<")[0].trim() || from;
    return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  };

  // Filter emails based on search query
  const filteredEmails = emails.filter((email) => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    return (
      email.subject.toLowerCase().includes(query) ||
      email.from.toLowerCase().includes(query) ||
      email.snippet.toLowerCase().includes(query)
    );
  });

  const getAvatarColor = (from: string) => {
    const colors = [
      "bg-blue-500", "bg-purple-500", "bg-pink-500", "bg-green-500",
      "bg-yellow-500", "bg-red-500", "bg-indigo-500", "bg-teal-500"
    ];
    const hash = from.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <div className="flex flex-col h-full">
      {/* Last Refreshed Indicator */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-border/30 bg-card/50 backdrop-blur">
        <div className="text-xs text-muted-foreground text-right">
          Last refreshed: {getLastRefreshedText()}
        </div>
      </div>

      {/* Email List */}
      <div className="p-4 space-y-3 overflow-x-hidden max-w-full flex-1 overflow-y-auto">
      {filteredEmails.length === 0 && !loading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          {searchQuery ? "No emails match your search" : "No emails found"}
        </div>
      ) : null}
      {filteredEmails.map((email, index) => (
        <button
          key={email.id}
          onClick={() => onSelectEmail(email.id, {
            subject: email.subject,
            from: email.from,
            to: email.to,
            date: email.date,
            snippet: email.snippet,
            body: email.body,
            threadId: email.threadId,
            crmMessageId: email.crmMessageId,
            clientId: email.clientId,
          })}
          className={`w-full text-left rounded-xl transition-all duration-200 ease-out border animate-in fade-in slide-in-from-left-2 group relative overflow-hidden ${
            selectedEmail === email.id 
              ? "border-primary/50 bg-accent/15 shadow-lg ring-2 ring-primary/30 border-l-4" 
              : "border-border/50 hover:border-primary/40 hover:bg-accent/5 hover:shadow-md bg-card"
          }`}
          style={{ animationDelay: `${index * 20}ms` }}
        >
          <div className="flex gap-4 p-4 relative z-10">
            {/* Avatar */}
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 ${
              getAvatarColor(email.from)
            } shadow-md`}>
              {getInitials(email.from)}
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0 space-y-2">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold text-base truncate transition-colors ${
                    selectedEmail === email.id ? "text-primary" : "text-foreground group-hover:text-primary"
                  }`}>
                    {email.from.split("<")[0].trim() || email.from}
                  </h3>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-muted-foreground font-medium">
                    {formatDate(email.date)}
                  </span>
                  {selectedEmail === email.id && (
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse shadow-sm shadow-primary/50" />
                  )}
                </div>
              </div>
              
              {/* Subject and snippet */}
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-foreground line-clamp-1 leading-snug">
                  {email.subject || "(No subject)"}
                </p>
                {email.snippet && (
                  <p className="text-sm text-muted-foreground line-clamp-1 leading-relaxed">
                    {email.snippet}
                  </p>
                )}
              </div>
            </div>
          </div>
        </button>
      ))}

      {hasMore && (
        <div className="flex justify-center p-4 pt-6">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="text-sm px-8 py-3 rounded-xl border-2 border-border/60 bg-card text-primary hover:bg-accent/10 hover:border-primary/60 hover:shadow-lg transition-colors duration-200 ease-out disabled:opacity-60 disabled:cursor-not-allowed font-semibold"
          >
            {loadingMore ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                Loading more...
              </div>
            ) : (
              "Load more emails"
            )}
          </button>
        </div>
      )}
      </div>
    </div>
  )
}
