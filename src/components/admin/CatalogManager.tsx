"use client";

import { useState } from "react";
import { adminRequest } from "./api";

type Category = { id: string; name: string; slug: string; published: boolean; sortOrder: number };
type Variant = { id: string; name: string; priceMinor: number; available: boolean };
type Product = { id: string; categoryId: string; name: string; slug: string; description: string; available: boolean; published: boolean; delivery: boolean; archived: boolean; imageId: string | null; variants: Variant[] };
type ImageItem = { id: string; alt: string; storageKey: string; width: number; height: number; bytes: number };

export function CatalogManager({ initialCategories, initialProducts, initialImages, role }: { initialCategories: Category[]; initialProducts: Product[]; initialImages: ImageItem[]; role: "ADMIN" | "OPERATOR" }) {
  const [categories, setCategories] = useState(initialCategories);
  const [products, setProducts] = useState(initialProducts);
  const [images, setImages] = useState(initialImages);
  const [message, setMessage] = useState("");
  async function patchProduct(id: string, patch: Partial<Product>) {
    setMessage("Сохраняем товар…");
    try { const saved = await adminRequest<Product>(`/api/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(patch) }); setProducts((current) => current.map((item) => item.id === id ? { ...item, ...saved } : item)); setMessage("Товар сохранён"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка сохранения"); }
  }
  async function createCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { const created = await adminRequest<Category>("/api/admin/categories", { method: "POST", body: JSON.stringify({ name: form.get("name"), slug: form.get("slug"), sortOrder: categories.length, published: false }) }); setCategories((current) => [...current, created]); event.currentTarget.reset(); setMessage("Категория создана как черновик"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка создания"); }
  }
  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { const created = await adminRequest<Product>("/api/admin/products", { method: "POST", body: JSON.stringify({ categoryId: form.get("categoryId"), slug: form.get("slug"), name: form.get("name"), description: form.get("description"), published: false, available: false, delivery: true, sortOrder: products.length, variants: [{ name: form.get("variantName") || "Стандарт", priceMinor: Math.round(Number(form.get("price")) * 100), sortOrder: 0 }] }) }); setProducts((current) => [...current, created]); event.currentTarget.reset(); setMessage("Товар создан как недоступный черновик"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка создания"); }
  }
  async function updateVariant(productId: string, variant: Variant, price: number) {
    try { const saved = await adminRequest<Variant>(`/api/admin/variants/${variant.id}`, { method: "PATCH", body: JSON.stringify({ priceMinor: Math.round(price * 100) }) }); setProducts((current) => current.map((item) => item.id === productId ? { ...item, variants: item.variants.map((value) => value.id === saved.id ? saved : value) } : item)); setMessage("Цена сохранена"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка цены"); }
  }
  async function uploadImage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { const created = await adminRequest<ImageItem>("/api/admin/images", { method: "POST", body: form }); setImages((current) => [created, ...current]); event.currentTarget.reset(); setMessage("Изображение проверено, перекодировано и загружено"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка загрузки"); }
  }
  async function createModifier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const productId = String(form.get("productId"));
    try { await adminRequest("/api/admin/modifiers", { method: "POST", body: JSON.stringify({ name: form.get("name"), kind: form.get("kind"), minSelect: 0, maxSelect: Number(form.get("maxSelect")), productIds: [productId], options: [{ name: form.get("optionName"), priceMinor: Math.round(Number(form.get("optionPrice")) * 100), sortOrder: 0 }] }) }); event.currentTarget.reset(); setMessage("Группа модификаторов создана"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка модификатора"); }
  }
  return <>
    <p className="admin-live" aria-live="polite">{message}</p>
    {role === "ADMIN" && <div className="admin-create-grid">
      <form className="admin-panel" onSubmit={createCategory}><h2>Новая категория</h2><label>Название<input name="name" required minLength={2} /></label><label>Slug<input name="slug" required pattern="[a-z0-9-]{2,80}" /></label><button className="admin-action">Создать черновик</button></form>
      <form className="admin-panel" onSubmit={createProduct}><h2>Новый товар</h2><label>Категория<select name="categoryId" required>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Название<input name="name" required /></label><label>Slug<input name="slug" required pattern="[a-z0-9-]{2,80}" /></label><label>Описание<input name="description" /></label><label>Вариант<input name="variantName" defaultValue="Стандарт" required /></label><label>Цена, ₽<input name="price" type="number" min="0" step="1" required /></label><button className="admin-action">Создать черновик</button></form>
      <form className="admin-panel" onSubmit={uploadImage}><h2>Изображение</h2><label>Файл<input name="file" type="file" accept="image/jpeg,image/png,image/webp" required /></label><label>Alt-текст<input name="alt" minLength={2} maxLength={180} required /></label><button className="admin-action">Проверить и загрузить</button><small>До 5 МБ; файл перекодируется в WebP без EXIF.</small></form>
      <form className="admin-panel" onSubmit={createModifier}><h2>Молоко или добавка</h2><label>Товар<select name="productId" required>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Название группы<input name="name" required /></label><label>Тип<select name="kind"><option value="MILK">Молоко</option><option value="ADD_ON">Добавка</option></select></label><label>Первый вариант<input name="optionName" required /></label><label>Доплата, ₽<input name="optionPrice" type="number" min="0" defaultValue="0" required /></label><label>Максимум вариантов<input name="maxSelect" type="number" min="1" max="20" defaultValue="1" required /></label><button className="admin-action">Создать группу</button></form>
    </div>}
    <div className="admin-catalog">{categories.map((category) => <section key={category.id} className="admin-category"><h2>{category.name} {!category.published && <small>черновик</small>}</h2>{products.filter((product) => product.categoryId === category.id).map((product) => <article key={product.id} className="admin-product"><header><div><strong>{product.name}</strong><small>{product.slug}</small></div><button onClick={() => void patchProduct(product.id, { available: !product.available })}>{product.available ? "Снять с наличия" : "Вернуть в наличие"}</button></header>{role === "ADMIN" && <>
        <div className="admin-inline-fields"><label><input type="checkbox" checked={product.published} onChange={(event) => void patchProduct(product.id, { published: event.target.checked })} /> Опубликован</label><label><input type="checkbox" checked={product.delivery} onChange={(event) => void patchProduct(product.id, { delivery: event.target.checked })} /> Доставка</label><label>Изображение<select value={product.imageId ?? ""} onChange={(event) => void patchProduct(product.id, { imageId: event.target.value || null })}><option value="">Без изображения</option>{images.map((image) => <option key={image.id} value={image.id}>{image.alt}</option>)}</select></label></div>
        <div className="variant-list">{product.variants.map((variant) => <label key={variant.id}>{variant.name}, ₽<input type="number" min="0" defaultValue={variant.priceMinor / 100} onBlur={(event) => void updateVariant(product.id, variant, Number(event.target.value))} /></label>)}</div>
        <button className="danger" onClick={() => { if (window.confirm(`Архивировать «${product.name}»?`)) void patchProduct(product.id, { archived: true }); }}>Архивировать</button>
      </>}</article>)}{!products.some((product) => product.categoryId === category.id) && <p>В категории пока нет товаров.</p>}</section>)}</div>
  </>;
}
