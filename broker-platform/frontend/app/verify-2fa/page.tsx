"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

export default function Verify2faPage() {
  const router = useRouter();
  const { verify2fa, pending2faEmail } = useAuth();
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleChange = (val: string) => {
    setCode(val.replace(/\D/g, "").slice(0, 6));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Enter all 6 digits");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await verify2fa(code);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-900 px-4 py-12 text-zinc-100">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator app
            {pending2faEmail ? ` for ${pending2faEmail}` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => handleChange(e.target.value)}
              className="flex h-14 w-full rounded-md border border-zinc-700 bg-zinc-900 text-center text-2xl font-mono tracking-[0.6em] text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              placeholder="••••••"
              aria-label="6-digit TOTP code"
            />
            {error && <Alert variant="danger">{error}</Alert>}
            <Button type="submit" className="w-full" disabled={submitting || code.length !== 6}>
              {submitting ? "Verifying…" : "Verify"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
