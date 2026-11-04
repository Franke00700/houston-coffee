import { db } from "@/lib/server/db";
import { CatalogManager } from "@/components/admin/CatalogManager";
import { currentStaff } from "@/lib/server/security";

export default async function CatalogPage() {
  const [{ user }, categories, products, images] = await Promise.all([currentStaff(), db.category.findMany({ where: { archived: false }, orderBy: { sortOrder: "asc" } }), db.product.findMany({ where: { archived: false }, include: { variants: { where: { archived: false }, orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } }), db.productImage.findMany({ orderBy: { createdAt: "desc" } })]);
  return <main className="admin-main"><p className="eyebrow">Каталог</p><h1 className="admin-title">Меню и наличие</h1><CatalogManager role={user.role} initialCategories={categories} initialProducts={products} initialImages={images} /></main>;
}
