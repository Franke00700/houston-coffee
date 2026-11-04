"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) });
    if (!response.ok) { const body = await response.json().catch(() => null); setError(body?.error?.message ?? "Не удалось войти"); setBusy(false); return; }
    router.replace("/admin"); router.refresh();
  }
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#40271F", color: "#F3EBDB", padding: 24 }}>
    <form onSubmit={submit} style={{ width: "min(420px,100%)", display: "grid", gap: 16, border: "1px solid #B76148", padding: 32 }}>
      <p style={{ letterSpacing: ".16em", textTransform: "uppercase" }}>Houston Coffee · Staff</p><h1 style={{ fontFamily: "Georgia,serif", fontSize: 44, margin: 0 }}>Вход</h1>
      <label>Почта<input name="email" type="email" autoComplete="username" required style={{ width: "100%", padding: 12, marginTop: 6 }} /></label>
      <label>Пароль<input name="password" type="password" autoComplete="current-password" minLength={8} required style={{ width: "100%", padding: 12, marginTop: 6 }} /></label>
      {error && <p role="alert">{error}</p>}<button disabled={busy} style={{ padding: 14, background: "#B76148", color: "#F3EBDB", border: 0 }}>{busy ? "Проверяем…" : "Войти"}</button>
    </form>
  </main>;
}
