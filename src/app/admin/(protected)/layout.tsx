import Link from "next/link";
import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/server/security";
import { LogoutButton } from "@/components/admin/LogoutButton";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  let staff; try { staff = await currentStaff(); } catch { redirect("/admin/login"); }
  return <div className="admin-shell"><header className="admin-header"><strong>HOUSTON / ADMIN</strong><nav><Link href="/admin">Сводка</Link><Link href="/admin/orders">Заказы</Link><Link href="/admin/catalog">Меню</Link>{staff.user.role === "ADMIN" && <><Link href="/admin/settings">Настройки</Link><Link href="/admin/audit">Журнал</Link></>}</nav><span>{staff.user.name} · {staff.user.role}</span><LogoutButton /></header>{children}</div>;
}
