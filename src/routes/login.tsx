import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.auth.login(email, password);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return <AuthLayout title="Welcome back" subtitle="Sign in to your Pilot account" onSubmit={submit} error={error} loading={loading} email={email} setEmail={setEmail} password={password} setPassword={setPassword} showPw={showPw} setShowPw={setShowPw} submitLabel="Sign in" altText="Don't have an account?" altLink="/signup" altLinkText="Sign up" />;
}

// Shared auth layout used by both login and signup
export function AuthLayout({ title, subtitle, onSubmit, error, loading, email, setEmail, password, setPassword, showPw, setShowPw, submitLabel, altText, altLink, altLinkText }: {
  title: string; subtitle: string; onSubmit: (e: React.FormEvent) => void;
  error: string; loading: boolean; email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void; showPw: boolean; setShowPw: (v: boolean) => void;
  submitLabel: string; altText: string; altLink: string; altLinkText: string;
}) {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-agent-soft border border-agent/20">
            <svg width="24" height="24" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <path d="M10 8h9a7 7 0 0 1 0 14h-7v8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-agent" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="auth-email">Email</Label>
            <Input id="auth-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auth-password">Password</Label>
            <div className="relative">
              <Input id="auth-password" type={showPw ? "text" : "password"} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPw ? "Hide password" : "Show password"}>
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full bg-agent text-white hover:bg-agent/90" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : submitLabel}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {altText}{" "}
          <a href={altLink} className="font-medium text-agent hover:underline">{altLinkText}</a>
        </p>
      </motion.div>
    </div>
  );
}
