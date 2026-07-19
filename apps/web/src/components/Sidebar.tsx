import { cn } from "~/lib/utils"
import {
  InboxIcon,
  SendIcon,
  StarIcon,
  TrashIcon,
  MailIcon,
  ShieldAlertIcon,
  PenSquareIcon,
  SettingsIcon,
} from "~/components/icons"

const FOLDERS = [
  { key: "inbox", label: "Inbox", icon: InboxIcon },
  { key: "sent", label: "Sent", icon: SendIcon },
  { key: "starred", label: "Starred", icon: StarIcon },
  { key: "drafts", label: "Drafts", icon: MailIcon },
  { key: "spam", label: "Spam", icon: ShieldAlertIcon },
  { key: "trash", label: "Trash", icon: TrashIcon },
] as const

interface Mailbox {
  id: string
  address: string
  displayName: string | null
  type: string
}

interface SidebarProps {
  mailboxes: Mailbox[]
  mailboxId: string | null
  view: string
  isAdmin: boolean
  onSelectMailbox: (id: string) => void
  onSelectView: (view: string) => void
  onCompose: () => void
  className?: string
}

export function Sidebar({
  mailboxes,
  mailboxId,
  view,
  isAdmin,
  onSelectMailbox,
  onSelectView,
  onCompose,
  className,
}: SidebarProps) {
  return (
    <aside className={cn("flex w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50", className)}>
      <div className="p-3">
        <button
          onClick={onCompose}
          className="flex w-full items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <PenSquareIcon size={16} />
          Compose
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-2">
        <p className="px-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Mailboxes
        </p>
        {mailboxes.length === 0 && (
          <p className="px-2 text-xs text-gray-400">No mailboxes yet</p>
        )}
        {mailboxes.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelectMailbox(m.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
              mailboxId === m.id
                ? "bg-blue-100 font-medium text-blue-700"
                : "text-gray-700 hover:bg-gray-200",
            )}
          >
            <MailIcon size={16} className="shrink-0 text-gray-400" />
            <span className="truncate">{m.displayName || m.address}</span>
          </button>
        ))}

        <div className="my-3 border-t border-gray-200" />

        <p className="px-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Folders
        </p>
        {FOLDERS.map((f) => {
          const Icon = f.icon
          return (
            <button
              key={f.key}
              onClick={() => onSelectView(f.key)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                view === f.key
                  ? "bg-blue-100 font-medium text-blue-700"
                  : "text-gray-700 hover:bg-gray-200",
              )}
            >
              <Icon size={16} className="shrink-0 text-gray-400" />
              {f.label}
            </button>
          )
        })}
      </nav>

      {isAdmin && (
        <div className="border-t border-gray-200 p-2">
          <a
            href="/admin"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-200"
          >
            <SettingsIcon size={16} />
            Settings
          </a>
        </div>
      )}
    </aside>
  )
}
