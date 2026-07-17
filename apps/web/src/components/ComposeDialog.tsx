import { useState, useCallback } from "react"
import { cn } from "~/lib/utils"
import { SendIcon, LoaderIcon } from "~/components/icons"

interface Mailbox {
  id: string
  address: string
  displayName: string | null
  type: string
}

interface Recipient {
  name?: string
  address: string
}

interface ComposePrefill {
  to?: Recipient[]
  subject?: string
  text?: string
  html?: string
  inReplyTo?: string
  references?: string
}

interface ComposeDialogProps {
  isOpen: boolean
  mailboxes: Mailbox[]
  prefill?: ComposePrefill | null
  onClose: () => void
  onSent: () => void
}

export function ComposeDialog({ isOpen, mailboxes, prefill, onClose, onSent }: ComposeDialogProps) {
  const [mailboxId, setMailboxId] = useState(mailboxes[0]?.id || "")
  const [to, setTo] = useState(prefill?.to?.map((r) => r.address).join(", ") || "")
  const [cc, setCc] = useState("")
  const [bcc, setBcc] = useState("")
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState(prefill?.subject || "")
  const [body, setBody] = useState(prefill?.text || "")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = useCallback(() => {
    setMailboxId(mailboxes[0]?.id || "")
    setTo("")
    setCc("")
    setBcc("")
    setShowCc(false)
    setSubject("")
    setBody("")
    setSending(false)
    setError(null)
  }, [mailboxes])

  const handleClose = useCallback(() => {
    if (body || subject || to) {
      if (!window.confirm("Discard this message?")) return
    }
    resetForm()
    onClose()
  }, [body, subject, to, resetForm, onClose])

  if (!isOpen) return null

  const parseRecipients = (s: string): Recipient[] => {
    return s
      .split(/[\s,;]+/)
      .map((a) => a.trim())
      .filter((a) => a.includes("@"))
      .map((address) => ({ address }))
  }

  const handleSend = async () => {
    const toRecipients = parseRecipients(to)
    if (toRecipients.length === 0) {
      setError("At least one recipient is required")
      return
    }
    if (!mailboxId) {
      setError("Select a mailbox to send from")
      return
    }

    setSending(true)
    setError(null)

    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailboxId,
          to: toRecipients,
          cc: showCc && cc ? parseRecipients(cc) : undefined,
          bcc: showCc && bcc ? parseRecipients(bcc) : undefined,
          subject,
          text: body || undefined,
          inReplyTo: prefill?.inReplyTo,
          references: prefill?.references,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Send failed")
      }

      resetForm()
      onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex w-full max-w-xl flex-col rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">New Message</h2>
          <button
            onClick={handleClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <label className="w-12 text-xs font-medium text-gray-500">From</label>
            <select
              value={mailboxId}
              onChange={(e) => setMailboxId(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
            >
              {mailboxes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName || m.address}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="w-12 text-xs font-medium text-gray-500">To</label>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {!showCc && (
              <button
                onClick={() => setShowCc(true)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Cc/Bcc
              </button>
            )}
          </div>

          {showCc && (
            <>
              <div className="flex items-center gap-2">
                <label className="w-12 text-xs font-medium text-gray-500">Cc</label>
                <input
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="cc@example.com"
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-12 text-xs font-medium text-gray-500">Bcc</label>
                <input
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  placeholder="bcc@example.com"
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <label className="w-12 text-xs font-medium text-gray-500">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message..."
            rows={12}
            className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
          <button
            onClick={handleClose}
            className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Discard
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? (
              <LoaderIcon size={16} className="animate-spin" />
            ) : (
              <SendIcon size={16} />
            )}
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  )
}

// X icon used in the close button
function XIcon({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <svg
      className={cn("shrink-0", className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
