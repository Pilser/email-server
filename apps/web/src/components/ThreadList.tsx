import { useRef, useEffect, useCallback } from "react"
import { cn } from "~/lib/utils"
import { Avatar } from "~/components/Avatar"
import { LoaderIcon, MailIcon, MailOpenIcon } from "~/components/icons"

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

interface ThreadListProps {
  threads: Thread[]
  loading: boolean
  selectedThreadId: string | null
  onSelectThread: (id: string) => void
  hasMore: boolean
  onLoadMore: () => void
  loadingMore: boolean
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  if (diff < 604800000 && d.getDay() !== now.getDay()) {
    return d.toLocaleDateString([], { weekday: "short" })
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

function ThreadRow({
  thread,
  isSelected,
  onSelect,
}: {
  thread: Thread
  isSelected: boolean
  onSelect: () => void
}) {
  const p = thread.participants?.[0]
  const label = p?.name || p?.address || "(unknown)"
  const unread = thread.unreadCount > 0

  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50",
        isSelected && "bg-blue-50 hover:bg-blue-50",
        unread && "bg-white",
      )}
    >
      <Avatar name={p?.name} email={p?.address} className="mt-0.5 h-8 w-8 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("truncate text-sm", unread ? "font-semibold text-gray-900" : "text-gray-700")}>
            {label}
          </span>
          <span className="shrink-0 text-xs text-gray-400">{formatDate(thread.lastMessageAt)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn("truncate text-sm", unread ? "font-medium text-gray-800" : "text-gray-600")}>
            {thread.subject || "(no subject)"}
          </span>
          {unread && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
          )}
        </div>
        {thread.snippet && (
          <p className="mt-0.5 truncate text-xs text-gray-500">{thread.snippet}</p>
        )}
        {thread.messageCount > 1 && (
          <p className="mt-0.5 text-xs text-gray-400">{thread.messageCount} messages</p>
        )}
      </div>
    </button>
  )
}

export function ThreadList({
  threads,
  loading,
  selectedThreadId,
  onSelectThread,
  hasMore,
  onLoadMore,
  loadingMore,
}: ThreadListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
        onLoadMore()
      }
    },
    [hasMore, loadingMore, onLoadMore],
  )

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(handleIntersect, { rootMargin: "200px" })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleIntersect])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoaderIcon size={24} className="text-gray-400" />
      </div>
    )
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <MailOpenIcon size={40} className="mb-2" />
        <p className="text-sm">No conversations yet</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {threads.map((t) => (
        <ThreadRow
          key={t.id}
          thread={t}
          isSelected={t.id === selectedThreadId}
          onSelect={() => onSelectThread(t.id)}
        />
      ))}
      {hasMore && (
        <div ref={sentinelRef} className="flex items-center justify-center py-4">
          {loadingMore ? (
            <LoaderIcon size={20} className="text-gray-400" />
          ) : (
            <span className="text-xs text-gray-400">Scroll for more</span>
          )}
        </div>
      )}
    </div>
  )
}
