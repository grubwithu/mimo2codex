// Thin fetch wrapper for the docbackend HTTP API. In production the docweb is
// served from the same origin as docbackend (nginx reverse-proxies /api/* into
// the container), so requests just go to relative `/api/...`. In dev `vite`
// serves docweb on :5174 and docbackend runs on :8080 — VITE_DOCBACKEND_BASE
// lets you override that target without rebuilding.

import { getClientId } from "../utils/clientId";

const BASE = import.meta.env.PROD
  ? ""
  : ((import.meta.env.VITE_DOCBACKEND_BASE as string | undefined) ?? "http://localhost:8080");

export interface SubmitIdeaPayload {
  title: string;
  body: string;
  background?: string;
  contact?: string;
  lang: "en" | "zh";
}

export interface PublicIdea {
  id: number;
  createdAt: string;
  title: string;
  body: string;
  background?: string;
  lang: "en" | "zh";
  commentCount: number;
}

export interface IdeasPage {
  total: number;
  items: PublicIdea[];
}

export interface SubmitCommentPayload {
  body: string;
}

export interface PublicComment {
  id: number;
  createdAt: string;
  body: string;
  /** True when this comment was posted by the current browser's clientId. */
  mine?: boolean;
}

export interface CommentsPage {
  total: number;
  items: PublicComment[];
}

export interface HealthResponse {
  status: string;
  docCount: number;
}

// ApiError carries the HTTP status so the UI can branch on 429 vs 4xx vs 5xx.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function authHeaders(): Record<string, string> {
  return { "X-Client-Id": getClientId() };
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      // body not JSON — keep the status line
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

export function getHealth(): Promise<HealthResponse> {
  return jsonRequest<HealthResponse>("/api/health");
}

export function submitIdea(payload: SubmitIdeaPayload): Promise<{ id: number }> {
  return jsonRequest("/api/ideas", {
    method: "POST",
    body: JSON.stringify({ ...payload, clientId: getClientId() }),
  });
}

export function listIdeas(page = 1, size = 20): Promise<IdeasPage> {
  const q = new URLSearchParams({ page: String(page), size: String(size) });
  return jsonRequest(`/api/ideas?${q.toString()}`);
}

export function getIdea(id: number): Promise<PublicIdea> {
  return jsonRequest(`/api/ideas/${id}`);
}

export function submitComment(ideaId: number, payload: SubmitCommentPayload): Promise<{ id: number }> {
  return jsonRequest(`/api/ideas/${ideaId}/comments`, {
    method: "POST",
    body: JSON.stringify({ ...payload, clientId: getClientId() }),
  });
}

export function listComments(ideaId: number, page = 1, size = 20): Promise<CommentsPage> {
  const q = new URLSearchParams({ page: String(page), size: String(size) });
  return jsonRequest(`/api/ideas/${ideaId}/comments?${q.toString()}`);
}

// SSE endpoint — caller uses fetch + XStream directly, not jsonRequest.
export function askEndpoint(): string {
  return `${BASE}/api/ask`;
}

// askHeaders returns the headers the AskDrawer should attach to its fetch
// call — kept here so the clientId plumbing lives in one place.
export function askHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Client-Id": getClientId(),
  };
}
