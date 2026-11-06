export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const res = await fetch("/api" + path, {
    credentials: "include",
    ...opts,
    headers: isForm ? {} : { "Content-Type": "application/json" },
  });
  if (res.status === 401 && !path.startsWith("/auth")) {
    window.location.href = "/login";
    throw new Error("Please log in");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data as T;
}

export const post = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
