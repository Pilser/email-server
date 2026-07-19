import { useState } from "react"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { LoaderIcon } from "~/components/icons"

export function AdminSignIn() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Sign in via Better Auth endpoint directly
      const signInRes = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      if (!signInRes.ok) {
        const err = await signInRes.json().catch(() => ({ message: "Sign in failed" }))
        setError(err.message || err.statusText || "Sign in failed")
        setLoading(false)
        return
      }
      // Session cookie is now set

      // 2. Re-assert admin role
      const claimRes = await fetch("/api/auth/claim-admin", { method: "POST" })
      if (!claimRes.ok) {
        const err = await claimRes.json().catch(() => ({ error: "Claim failed" }))
        setError(err.error || "Failed to claim admin role")
        setLoading(false)
        return
      }

      window.location.href = "/admin"
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Admin Sign In</CardTitle>
        <CardDescription>
          Sign in with your full admin email address.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="admin@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button className="w-full" onClick={handleSignIn} disabled={loading}>
          {loading ? <LoaderIcon size={16} className="mr-2" /> : null}
          Sign In
        </Button>
      </CardContent>
    </Card>
  )
}
