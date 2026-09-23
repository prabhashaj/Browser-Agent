import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { api, ApiError } from "@/lib/api";
import { AuthLayout } from "./login";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await api.auth.signup(email, password);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create account"
      subtitle="Start using Pilot for free"
      onSubmit={submit}
      error={error}
      loading={loading}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      showPw={showPw}
      setShowPw={setShowPw}
      submitLabel="Create account"
      altText="Already have an account?"
      altLink="/login"
      altLinkText="Sign in"
    />
  );
}
