"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Logo from "@/components/logo"
import { useToast } from "@/components/ui/use-toast"

interface GmailConnectProps {
  onConnect: () => void
}

export default function GmailConnect({ onConnect }: GmailConnectProps) {
  const [connecting, setConnecting] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const { toast } = useToast()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!username || !password) {
      toast({
        title: "Missing credentials",
        description: "Please enter username and password",
        variant: "destructive",
      })
      return
    }

    try {
      setConnecting(true)
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Login failed')
      }

      const data = await response.json()
      
      if (data.success) {
        toast({
          title: "Login successful",
          description: `Welcome back, ${data.user.username}!`,
        })
        onConnect()
        // In case parent does not immediately transition,
        // release the loading state to avoid a stuck button.
        setConnecting(false)
      }
    } catch (error) {
      console.error('Login error:', error)
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Invalid credentials",
        variant: "destructive",
      })
      setConnecting(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col items-center px-4 py-6 md:py-14">
      <div className="max-w-md w-full space-y-8 bg-card/95 border border-border rounded-3xl p-8 md:p-12 shadow-2xl">
        {/* Header section */}
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            <Logo size="large" showText={true} />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
            Welcome Back
          </h1>
          <p className="text-base text-muted-foreground">
            Sign in to access Mail Assist CRM
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={connecting}
              autoComplete="username"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={connecting}
              autoComplete="current-password"
              className="h-11"
            />
          </div>

          <Button
            type="submit"
            disabled={connecting}
            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg text-base transition-all shadow-sm disabled:opacity-60"
          >
            {connecting ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        {/* Features grid */}
        <div className="grid grid-cols-1 gap-4 pt-4 border-t border-border">
          <div className="space-y-2 text-center">
            <div className="w-10 h-10 mx-auto rounded-lg bg-primary/15 dark:bg-primary/20 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-primary"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
            </div>
            <h3 className="font-semibold text-foreground text-sm">AI-Powered Support</h3>
            <p className="text-xs text-muted-foreground">
              Manage customer emails with intelligent ticket system
            </p>
          </div>

          <div className="space-y-2 text-center">
            <div className="w-10 h-10 mx-auto rounded-lg bg-primary/15 dark:bg-primary/20 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-primary"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h3 className="font-semibold text-foreground text-sm">Secure & Private</h3>
            <p className="text-xs text-muted-foreground">
              Your data is protected with enterprise-grade security
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
