import { cn } from "~/lib/utils"
import { Avatar } from "~/components/Avatar"
import {
  ArrowLeftIcon,
  TrashIcon,
  MailIcon,
  ShieldAlertIcon,
  PaperclipIcon,
  LoaderIcon,
  ReplyIcon,
  ForwardIcon,
} from "~/components/icons"

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

interface MessageViewProps {
  messages: Message[]
  loading: boolean
  onBack: () => void
  onToggleRead: (id: string, read: boolean) => void
  onToggleSpam: (id: string, spam: boolean) => void
  onTrash: (id: string) => void
  onReply?: (message: Message) => void
  onForward?: (message: Message) => void
  className?: string
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString([], {
    dateStyle: "full",
    timeStyle: "short",
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function MessageCard({ message }: { message: Message }) {
  return (
    <div className="border-b border-gray-200 pb-4 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Avatar name={message.fromName || undefined} email={message.fromAddress} className="mt-1 h-8 w-8" />
          <div>
            <p className="text-sm font-medium text-gray-900">
              {message.fromName || message.fromAddress}
            </p>
            <p className="text-xs text-gray-500">
              to {message.toAddress}
            </p>
          </div>
        </div>
        <p className="shrink-0 text-xs text-gray-400">{formatFullDate(message.receivedAt)}</p>
      </div>

      {message.attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {message.attachments.map((a) => (
            <a
              key={a.id}
              href={`/api/attachments/${a.id}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              <PaperclipIcon size={12} />
              <span className="max-w-[200px] truncate">{a.filename || "attachment"}</span>
              <span className="text-gray-400">({formatSize(a.sizeBytes)})</span>
            </a>
          ))}
        </div>
      )}

      <div className="mt-3">
        {message.bodyHtml ? (
          <div
            className="prose prose-sm max-w-none text-sm text-gray-800"
            dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
          />
        ) : message.bodyText ? (
          <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">
            {message.bodyText}
          </pre>
        ) : (
          <p className="text-sm italic text-gray-400">No content</p>
        )}
      </div>
    </div>
  )
}

export function MessageView({
  messages,
  loading,
  onBack,
  onToggleRead,
  onToggleSpam,
  onTrash,
  onReply,
  onForward,
  className,
}: MessageViewProps) {
  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <LoaderIcon size={24} className="text-gray-400" />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 text-gray-400", className)}>
        <MailIcon size={40} className="mb-2" />
        <p className="text-sm">Select a conversation</p>
      </div>
    )
  }

  const lastMsg = messages[messages.length - 1]

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeftIcon size={16} />
          <span className="hidden sm:inline">Back</span>
        </button>
        <h2 className="flex-1 truncate text-sm font-semibold text-gray-900">
          {lastMsg.subject || "(no subject)"}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleRead(messages[0].id, !messages[0].isRead)}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            title={messages[0].isRead ? "Mark unread" : "Mark read"}
          >
            <MailIcon size={16} />
          </button>
          <button
            onClick={() => onToggleSpam(messages[0].id, !messages[0].isSpam)}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-yellow-600"
            title={messages[0].isSpam ? "Not spam" : "Mark spam"}
          >
            <ShieldAlertIcon size={16} />
          </button>
          {onReply && (
            <button
              onClick={() => onReply(messages[0])}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
              title="Reply"
            >
              <ReplyIcon size={16} />
            </button>
          )}
          {onForward && (
            <button
              onClick={() => onForward(messages[0])}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
              title="Forward"
            >
              <ForwardIcon size={16} />
            </button>
          )}
          <button
            onClick={() => onTrash(messages[0].id)}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
            title="Trash"
          >
            <TrashIcon size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          {messages.map((m) => (
            <MessageCard key={m.id} message={m} />
          ))}
        </div>
      </div>
    </div>
  )
}
