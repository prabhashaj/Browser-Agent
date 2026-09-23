/**
 * src/lib/api.ts
 * Typed fetch wrapper for the Pilot REST API.
 * Base URL comes from VITE_API_BASE env var.
 */

const BASE = (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "http://localhost:8000";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // ignore parse error
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export interface UserOut {
  id: string;
  email: string;
  created_at: string;
}

export const api = {
  auth: {
    signup: (email: string, password: string) =>
      request<UserOut>("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }),
    login: (email: string, password: string) =>
      request<UserOut>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    logout: () => request<void>("/api/auth/logout", { method: "POST" }),
    me: () => request<UserOut>("/api/auth/me"),
    wsTicket: () => request<{ ticket: string }>("/api/auth/ws-ticket"),
  },

  // ── Threads ────────────────────────────────────────────────────────────────
  threads: {
    list: () => request<ThreadOut[]>("/api/threads"),
    create: (title?: string) =>
      request<ThreadDetailOut>("/api/threads", { method: "POST", body: JSON.stringify({ title: title ?? "New conversation" }) }),
    get: (id: string) => request<ThreadDetailOut>(`/api/threads/${id}`),
    rename: (id: string, title: string) =>
      request<ThreadOut>(`/api/threads/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }),
    delete: (id: string) => request<void>(`/api/threads/${id}`, { method: "DELETE" }),
  },

  // ── Runs ───────────────────────────────────────────────────────────────────
  runs: {
    create: (thread_id: string, goal: string) =>
      request<RunOut>("/api/runs", { method: "POST", body: JSON.stringify({ thread_id, goal }) }),
    get: (id: string) => request<RunOut>(`/api/runs/${id}`),
    cancel: (id: string) => request<void>(`/api/runs/${id}`, { method: "DELETE" }),
  },
};

// ── Response types (mirrors backend Pydantic models) ──────────────────────────

export interface MessageOut {
  id: string;
  role: "user" | "assistant";
  text: string;
  result_json: string | null;
  run_id: string | null;
  created_at: string;
}

export interface ThreadOut {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ThreadDetailOut extends ThreadOut {
  messages: MessageOut[];
}

export interface RunOut {
  id: string;
  thread_id: string;
  goal: string;
  status: string;
  started_at: string;
  finished_at: string | null;
}

export { ApiError };
