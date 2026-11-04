export function csrfToken() {
  if (typeof document === "undefined") return "";
  const item = document.cookie.split("; ").find((part) => part.startsWith("houston_csrf="));
  return item ? decodeURIComponent(item.slice("houston_csrf=".length)) : "";
}

export async function adminRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-csrf-token", csrfToken());
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(url, { ...init, headers });
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error === "object" && "message" in payload.error
      ? String(payload.error.message)
      : "Операция не выполнена";
    throw new Error(message);
  }
  return payload as T;
}
