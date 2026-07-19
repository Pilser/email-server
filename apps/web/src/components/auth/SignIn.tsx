import { useState, useEffect } from "react"
import { authClient } from "~/lib/auth-client"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/components/ui/card"
import { LoaderIcon } from "~/components/icons"

interface Domain {
  id: string
  name: string
}

export function SignIn() {
  const [localPart, setLocalPart] = useState("")
  const [domainId, setDomainId] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [domains, setDomains] = useState<Domain[]>([])
  const [domainsLoading, setDomainsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/domains/available")
      .then((r) => r.json())
      .then((data) => {
        const available = data.domains || []
        setDomains(available)
        if (available.length > 0) setDomainId(available[0].id)
      })
      .catch(() => setError("Failed to load domains"))
      .finally(() => setDomainsLoading(false))
  }, [])

  const selectedDomain = domains.find((d) => d.id === domainId)
  const email = selectedDomain && localPart ? `${localPart}@${selectedDomain.name}` : ""

  const handleSignIn = async () => {
    if (!localPart || !domainId) {
      setError("Please enter your email local part and select a domain")
      return
    }
    setLoading(true)
    setError(null)
    try {
      await authClient.signIn.email({
        email,
        password,
        callbackURL: "/inbox",
      }, {
        onError: (ctx) => {
          setError(ctx.error.message)
        },
        onSuccess: () => {
          window.location.href = "/inbox"
        },
      })
    } catch {
      setError("An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  if (domainsLoading) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">Loading...</p>
        </CardContent>
      </Card>
    )
  }

  if (domains.length === 0) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>No domains available</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            No domains have been configured yet. If you are the server administrator,
            go to the <a href="/setup" className="text-blue-600 hover:underline">setup page</a>.
          </p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-gray-500">
            Don't have an account? <a href="/signup" className="text-blue-600 hover:underline">Sign up</a>
          </p>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Sign In</CardTitle>
        <CardDescription>Enter your credentials to access your account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="localPart">Email Address</Label>
          <div className="flex gap-2">
            <Input
              id="localPart"
              type="text"
              placeholder="sales"
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value)}
              className="flex-shrink-0"
            />
            <span className="flex items-center text-sm text-gray-500">@</span>
            <select
              id="domain"
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {domains.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          {email && (
            <p className="text-xs text-gray-500">Signing in as: <strong>{email}</strong></p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button className="w-full" onClick={handleSignIn} disabled={loading || !email}>
          {loading ? <LoaderIcon size={16} className="mr-2" /> : null}
          Sign In
        </Button>
      </CardContent>
      <CardFooter className="flex justify-center">
        <p className="text-sm text-gray-500">
          Don't have an account? <a href="/signup" className="text-blue-600 hover:underline">Sign up</a>
        </p>
      </CardFooter>
    </Card>
  )
}
