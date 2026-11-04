import Image from "next/image";
import Link from "next/link";
import { CoffeeHero } from "@/components/coffee/CoffeeHero";
import { ContactSection } from "@/components/public/ContactSection";

const identity = [
  ["/brand/cup-ivory.png", "Стакан Ivory", "01 / Cup · Ivory"],
  ["/brand/cup-terracotta.png", "Стакан Terracotta", "02 / Cup · Terracotta"],
  ["/brand/kraft-bag.png", "Крафт-пакет Houston", "03 / Bag · Kraft"],
  ["/brand/menu-print.png", "Фирменное печатное меню", "04 / Menu · Print"],
  ["/brand/wood-sign.png", "Табличка «Хьюстон, у нас кофе»", "05 / Sign · Craft"],
] as const;

export default function HomePage() {
  return (
    <main id="main-content">
      <CoffeeHero />
      <div className="brand-marquee" aria-hidden="true">
        <span>Хьюстон, у нас кофе.</span><i>✦</i><span>Good coffee · Good mood</span><i>✦</i><span>Houston Coffee</span>
      </div>

      <section className="about-section" id="about" aria-labelledby="about-title">
        <figure className="about-photo">
          <Image src="/brand/brand-composition.png" width={1536} height={513} alt="Фирменные стаканы, крафт-пакет, меню, табличка и круассан Houston Coffee" />
          <figcaption>HOUSTON COFFEE · IDENTITY</figcaption>
        </figure>
        <div className="about-copy">
          <p className="eyebrow">О нас</p>
          <h2 id="about-title" className="section-title">История<br />начинается<br /><em>с чашки.</em></h2>
          <Image className="character-cup" src="/brand/character-cup.png" width={266} height={253} alt="Фирменная героиня Houston с чашкой" />
          <p>Houston Coffee — пространство, где фирменная чашка становится маленькой паузой в течение дня.</p>
          <p>Меню, расписание и контакты на сайте обновляются сотрудниками кофейни — без демонстрационных обещаний.</p>
          <Link className="line-link" href="/menu">Открыть актуальное меню <span>↗</span></Link>
        </div>
      </section>

      <section className="identity-section" aria-labelledby="identity-title">
        <div className="section-heading">
          <div><p className="eyebrow">Айдентика</p><h2 id="identity-title" className="section-title">Узнаваемы<br /><em>с первого</em><br />стакана.</h2></div>
          <p>Три цвета, один характер: Ivory для света, Terracotta для акцента, Espresso для главного.</p>
        </div>
        <div className="identity-gallery" tabIndex={0} aria-label="Фирменная коллекция Houston, прокручиваемая галерея">
          {identity.map(([src, alt, eyebrow]) => (
            <article className="identity-card" key={src}>
              <div className="identity-image"><Image src={src} width={435} height={484} alt={alt} /></div>
              <p className="eyebrow">{eyebrow}</p><h3>{alt}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="menu-preview" aria-labelledby="menu-preview-title">
        <div>
          <p className="eyebrow">Меню</p>
          <h2 id="menu-preview-title" className="section-title">Вкус <em>в каждой</em><br />детали.</h2>
          <p>Актуальные позиции, доступные объёмы, молоко и добавки загружаются из меню кофейни.</p>
          <Link className="pill light" href="/menu">Выбрать напиток</Link>
        </div>
        <Image src="/brand/croissant.png" width={388} height={202} alt="Круассан из фирменной композиции Houston" />
      </section>

      <section className="atmosphere-section" id="atmosphere" aria-labelledby="atmosphere-title">
        <div className="atmosphere-outline" aria-hidden="true">HOUSTON</div>
        <div className="atmosphere-copy">
          <p className="eyebrow">Атмосфера</p>
          <h2 id="atmosphere-title" className="section-title">Место, куда<br /><em>хочется</em><br />возвращаться.</h2>
          <p>Тёплый свет, спокойный ритм и фирменная чашка. Остальное лучше увидеть своими глазами.</p>
        </div>
        <figure><Image src="/brand/wood-sign.png" width={305} height={185} alt="Деревянная табличка «Хьюстон, у нас кофе»" /></figure>
        <figure><Image src="/brand/character-camera.png" width={277} height={251} alt="Фирменная героиня Houston с камерой" /></figure>
      </section>

      <ContactSection />
      <footer className="site-footer">
        <Link href="/" aria-label="Houston Coffee — наверх"><Image src="/brand/wordmark.png" width={180} height={52} alt="Houston Coffee" /></Link>
        <span>Хьюстон, у нас кофе.</span>
        <a href="#main-content">Наверх ↑</a>
      </footer>
    </main>
  );
}
