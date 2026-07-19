import { useState } from "react"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { LoaderIcon } from "~/components/icons"

export function SetupAdmin() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSetup = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Sign up via Better Auth endpoint directly (no client redirects)
      const signUpRes = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      })
      if (!signUpRes.ok) {
        const err = await signUpRes.json().catch(() => ({ message: "Signup failed" }))
        setError(err.message || err.statusText || "Signup failed")
        setLoading(false)
        return
      }
      // Session cookie is now set by the browser from Set-Cookie header

      // 2. Claim admin role
      const claimRes = await fetch("/api/auth/claim-admin", { method: "POST" })
      if (!claimRes.ok) {
        const err = await claimRes.json().catch(() => ({ error: "Claim failed" }))
        setError(err.error || "Failed to claim admin role")
        setLoading(false)
        return
      }

      window.location.href = "/admin/domains/new"
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Initial Setup</CardTitle>
        <CardDescription>
          No admin account exists yet. Create one to get started.
          Your email must match the <code>ADMIN_EMAIL</code> env var.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="Admin" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="admin@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button className="w-full" onClick={handleSetup} disabled={loading}>
          {loading ? <LoaderIcon size={16} className="mr-2" /> : null}
          Create Admin Account
        </Button>
      </CardContent>
    </Card>
  )
}
