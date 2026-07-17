import { useState, useEffect, useCallback } from "react"
import { cn } from "~/lib/utils"
import { Sidebar } from "~/components/Sidebar"
import { ThreadList } from "~/components/ThreadList"
import { MessageView } from "~/components/MessageView"
import { ComposeDialog } from "~/components/ComposeDialog"
import { SearchIcon, LoaderIcon } from "~/components/icons"

interface Mailbox {
  id: string
  address: string
  displayName: string | null
  type: string
}

interface Participant {
  address: string
  name?: string
}

interface Thread {
  id: string
  subject: string | null
  snippet: string | null
  participants: Participant[]
  messageCount: number
  unreadCount: number
  lastMessageAt: string
}

interface Attachment {
  id: string
  filename: string | null
  mimeType: string | null
  sizeBytes: number
  isInline: boolean
}

interface Message {
  id: string
  messageId?: string | null
  inReplyTo?: string | null
  fromAddress: string
  fromName: string | null
  toAddress: string
  subject: string | null
  bodyText: string | null
  bodyHtml: string | null
  isRead: boolean
  isSpam: boolean
  sizeBytes: number
  receivedAt: string
  attachments: Attachment[]
}

function parseSearch(): { mailboxId: string | null; view: string; threadId: string | null } {
  const params = new URLSearchParams(window.location.search)
  return {
    mailboxId: params.get("mailboxId"),
    view: params.get("view") || "inbox",
    threadId: params.get("threadId"),
  }
}

function updateUrl(mailboxId: string | null, view: string, threadId: string | null) {
  const params = new URLSearchParams()
  if (mailboxId) params.set("mailboxId", mailboxId)
  params.set("view", view)
  if (threadId) params.set("threadId", threadId)
  const url = `${window.location.pathname}?${params}`
  window.history.replaceState(null, "", url)
}

export default function InboxShell() {
  const [mailboxId, setMailboxId] = useState<string | null>(null)
  const [view, setView] = useState("inbox")
  const [threadId, setThreadId] = useState<string | null>(null)
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [threads, setThreads] = useState<Thread[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [mobileDetail, setMobileDetail] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<{ threads: Thread[]; messages: Message[] } | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults(null)
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const params = new URLSearchParams({ q: searchQuery })
        if (mailboxId) params.set("mailboxId", mailboxId)
        const res = await fetch(`/api/search?${params}`)
        const data = await res.json()
        setSearchResults(data)
      } catch {
        setSearchResults(null)
      }
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, mailboxId])

  useEffect(() => {
    const initial = parseSearch()
    if (initial.mailboxId) setMailboxId(initial.mailboxId)
    setView(initial.view)
    if (initial.threadId) {
      setThreadId(initial.threadId)
      setMobileDetail(true)
    }
  }, [])

  useEffect(() => {
    fetch("/api/mailboxes")
      .then((r) => r.json())
      .then((data) => {
        const boxes: Mailbox[] = data.mailboxes || []
        setMailboxes(boxes)
        if (!mailboxId && boxes.length > 0) {
          setMailboxId(boxes[0].id)
        }
      })
  }, [])

  useEffect(() => {
    if (!mailboxId) return
    setLoading(true)
    setCursor(null)
    setHasMore(false)
    fetch(`/api/threads?mailboxId=${mailboxId}&folder=${view}&limit=50`)
      .then((r) => r.json())
      .then((data) => {
        setThreads(data.threads || [])
        setHasMore(!!data.nextCursor)
        setCursor(data.nextCursor)
        setLoading(false)
      })
  }, [mailboxId, view])

  useEffect(() => {
    if (!threadId) {
      setMessages([])
      return
    }
    setLoadingMessages(true)
    fetch(`/api/threads/${threadId}/messages`)
      .then((r) => r.json())
      .then((data) => {
        setMessages(data.messages || [])
        setLoadingMessages(false)
      })
  }, [threadId])

  useEffect(() => {
    updateUrl(mailboxId, view, threadId)
  }, [mailboxId, view, threadId])

  useEffect(() => {
    const es = new EventSource('/api/realtime/subscribe');

    es.addEventListener('new_message', (e) => {
      const data = JSON.parse(e.data);
      if (data.mailboxId === mailboxId) {
        fetch(`/api/threads?mailboxId=${mailboxId}&folder=${view}&limit=50`)
          .then(r => r.json())
          .then(data => {
            setThreads(data.threads || []);
            setHasMore(!!data.nextCursor);
            setCursor(data.nextCursor);
          });
      }
    });

    es.addEventListener('message_sent', (e) => {
      if (mailboxId) {
        fetch(`/api/threads?mailboxId=${mailboxId}&folder=${view || 'sent'}&limit=50`)
          .then(r => r.json())
          .then(data => {
            setThreads(data.threads || []);
          });
      }
    });

    return () => es.close();
  }, [mailboxId, view])

  const handleLoadMore = useCallback(() => {
    if (!cursor || loadingMore || !mailboxId) return
    setLoadingMore(true)
    fetch(`/api/threads?mailboxId=${mailboxId}&folder=${view}&cursor=${cursor}&limit=50`)
      .then((r) => r.json())
      .then((data) => {
        setThreads((prev) => [...prev, ...(data.threads || [])])
        setHasMore(!!data.nextCursor)
        setCursor(data.nextCursor)
        setLoadingMore(false)
      })
  }, [cursor, loadingMore, mailboxId, view])

  const handleSelectThread = (id: string) => {
    setThreadId(id)
    setMobileDetail(true)
  }

  const handleBack = () => {
    setThreadId(null)
    setMobileDetail(false)
  }

  const handleToggleRead = async (id: string, read: boolean) => {
    try {
      await fetch(`/api/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: read }),
      })
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, isRead: read } : m)),
      )
    } catch {}
  }

  const handleToggleSpam = async (id: string, spam: boolean) => {
    try {
      await fetch(`/api/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSpam: spam }),
      })
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, isSpam: spam } : m)),
      )
    } catch {}
  }

  const handleTrash = async (id: string) => {
    try {
      await fetch(`/api/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      })
      handleBack()
    } catch {}
  }

  const [composeOpen, setComposeOpen] = useState(false)
  const [composePrefill, setComposePrefill] = useState<{
    to?: { name?: string; address: string }[]
    subject?: string
    text?: string
    html?: string
    inReplyTo?: string
    references?: string
  } | null>(null)

  const openCompose = useCallback(() => {
    setComposePrefill(null)
    setComposeOpen(true)
  }, [])

  const handleReply = useCallback((msg: Message) => {
    setComposePrefill({
      to: [{ address: msg.fromAddress, name: msg.fromName || undefined }],
      subject: msg.subject ? `Re: ${msg.subject.replace(/^(Re:\s*)+/i, '')}` : 'Re: ',
      text: msg.bodyHtml
        ? `On ${new Date(msg.receivedAt).toLocaleString()}, ${msg.fromName || msg.fromAddress} wrote:\n> ${msg.bodyText?.replace(/\n/g, '\n> ') || ''}`
        : `On ${new Date(msg.receivedAt).toLocaleString()}, ${msg.fromName || msg.fromAddress} wrote:\n> ${(msg.bodyText || '').replace(/\n/g, '\n> ')}`,
      inReplyTo: msg.messageId || msg.id,
      references: msg.messageId || msg.id,
    })
    setComposeOpen(true)
  }, [])

  const handleForward = useCallback((msg: Message) => {
    setComposePrefill({
      subject: `Fwd: ${(msg.subject || '').replace(/^(Fwd:\s*)+/i, '')}`,
      text: `-------- Forwarded message --------\nSubject: ${msg.subject || '(no subject)'}\n\n${msg.bodyText || ''}`,
    })
    setComposeOpen(true)
  }, [])

  const handleSent = useCallback(() => {
    setComposeOpen(false)
    setComposePrefill(null)
    if (mailboxId) {
      setLoading(true)
      fetch(`/api/threads?mailboxId=${mailboxId}&folder=${view}&limit=50`)
        .then((r) => r.json())
        .then((data) => {
          setThreads(data.threads || [])
          setHasMore(!!data.nextCursor)
          setCursor(data.nextCursor)
          setLoading(false)
        })
    }
  }, [mailboxId, view])

  return (
    <>
      <ComposeDialog
        isOpen={composeOpen}
        mailboxes={mailboxes}
        prefill={composePrefill}
        onClose={() => {
          setComposeOpen(false)
          setComposePrefill(null)
        }}
        onSent={handleSent}
      />
    <div className="flex h-screen bg-white">
      <Sidebar
        mailboxes={mailboxes}
        mailboxId={mailboxId}
        view={view}
        onSelectMailbox={(id) => {
          setMailboxId(id)
          setThreadId(null)
        }}
        onSelectView={(v) => {
          setView(v)
          setThreadId(null)
        }}
        onCompose={openCompose}
        className="hidden md:flex"
      />

      <div className={cn("flex min-w-0 flex-1 flex-col md:flex-row", mobileDetail && "hidden md:flex")}>
        <div className="flex w-full flex-col border-r border-gray-200 md:w-96">
          <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2">
            {mailboxes.length > 0 && (
              <select
                value={mailboxId || ""}
                onChange={(e) => {
                  setMailboxId(e.target.value)
                  setThreadId(null)
                }}
                className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
              >
                {mailboxes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName || m.address}
                  </option>
                ))}
              </select>
            )}
            <div className="flex rounded-md border border-gray-200">
              {["inbox", "sent", "starred", "spam", "trash"].map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setView(v)
                    setThreadId(null)
                  }}
                  className={cn(
                    "px-2 py-1 text-xs font-medium capitalize transition-colors",
                    view === v
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-100",
                  )}
                >
                  {v === "starred" ? "Starred" : v}
                </button>
              ))}
            </div>
          </div>
          <div className="border-b border-gray-200 px-3 py-2">
            <div className="relative">
              <SearchIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search mail…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:outline-none"
              />
              {searching && (
                <LoaderIcon size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              )}
            </div>
          </div>
          {searchResults !== null ? (
            <div className="flex-1 overflow-y-auto">
              {searchResults.threads.length === 0 && searchResults.messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <p className="text-sm">No results for "{searchQuery}"</p>
                </div>
              ) : (
                <>
                  {searchResults.threads.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setThreadId(t.id)
                        setMobileDetail(true)
                      }}
                      className={cn(
                        "flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50",
                        t.id === threadId && "bg-blue-50 hover:bg-blue-50",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-gray-900">{t.subject || "(no subject)"}</span>
                        <p className="mt-0.5 truncate text-xs text-gray-500">{t.snippet}</p>
                      </div>
                    </button>
                  ))}
                  {searchResults.messages.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setThreadId(m.threadId || m.id)
                        setMobileDetail(true)
                      }}
                      className="flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-gray-900">{m.subject || "(no subject)"}</span>
                        <p className="mt-0.5 truncate text-xs text-gray-500">{m.fromAddress} — {m.bodyText?.slice(0, 100)}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          ) : (
            <ThreadList
              threads={threads}
              loading={loading}
              selectedThreadId={threadId}
              onSelectThread={handleSelectThread}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
              loadingMore={loadingMore}
            />
          )}
        </div>

        <MessageView
          messages={messages}
          loading={loadingMessages}
          onBack={handleBack}
          onToggleRead={handleToggleRead}
          onToggleSpam={handleToggleSpam}
          onTrash={handleTrash}
          onReply={handleReply}
          onForward={handleForward}
          className="hidden md:flex flex-1"
        />
      </div>

      <div className={cn("flex-1 md:hidden", !mobileDetail && "hidden")}>
        <MessageView
          messages={messages}
          loading={loadingMessages}
          onBack={handleBack}
          onToggleRead={handleToggleRead}
          onToggleSpam={handleToggleSpam}
          onTrash={handleTrash}
          onReply={handleReply}
          onForward={handleForward}
          className="flex h-full"
        />
      </div>
    </div>
    </>
  )
}


