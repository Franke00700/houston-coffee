"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminRequest } from "./api";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button className="admin-link-button" disabled={busy} onClick={async () => {
    setBusy(true);
    try { await adminRequest("/api/admin/auth/logout", { method: "POST" }); } finally { router.replace("/admin/login"); router.refresh(); }
  }}>{busy ? "Выходим…" : "Выйти"}</button>;
}
