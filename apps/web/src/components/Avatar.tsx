import { cn } from "~/lib/utils"

const COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-red-500",
]

function hashColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0][0].toUpperCase()
  }
  if (email) return email[0].toUpperCase()
  return "?"
}

interface AvatarProps {
  name?: string
  email?: string
  className?: string
}

export function Avatar({ name, email, className }: AvatarProps) {
  const initials = getInitials(name, email)
  const color = hashColor(email || name || "")

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full text-xs font-semibold text-white",
        color,
        className || "h-8 w-8",
      )}
      title={name || email}
    >
      {initials}
    </span>
  )
}
