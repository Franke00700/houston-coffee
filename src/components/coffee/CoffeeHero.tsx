"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

const drinks = [
  { name: "Эспрессо", slug: "espresso", color: "ivory", note: "Чистый вкус сегодняшнего зерна." },
  { name: "Латте", slug: "latte", color: "terracotta", note: "Мягкая чашка с молоком." },
  { name: "Колд брю", slug: "cold-brew", color: "espresso", note: "Прохладный кофе без спешки." },
] as const;

const BREW_DURATION = 4800;

export function CoffeeHero() {
  const trackRef = useRef<HTMLElement>(null);
  const animationRef = useRef<number>(0);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [brewProgress, setBrewProgress] = useState(0);
  const [phase, setPhase] = useState<"choose" | "brewing" | "ready">("choose");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let scheduled = false;
    const update = () => {
      scheduled = false;
      const element = trackRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const distance = Math.max(1, element.offsetHeight - window.innerHeight);
      setScrollProgress(Math.min(1, Math.max(0, -rect.top / distance)));
    };
    const onScroll = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => () => cancelAnimationFrame(animationRef.current), []);

  const choose = (index: number) => {
    if (phase === "brewing") return;
    setSelected((index + drinks.length) % drinks.length);
    setPhase("choose");
    setBrewProgress(0);
  };

  const startBrew = () => {
    cancelAnimationFrame(animationRef.current);
    setPhase("brewing");
    setBrewProgress(0.01);
    if (reducedMotion) {
      setBrewProgress(1);
      setPhase("ready");
      return;
    }
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / BREW_DURATION);
      setBrewProgress(progress);
      if (progress < 1) animationRef.current = requestAnimationFrame(tick);
      else setPhase("ready");
    };
    animationRef.current = requestAnimationFrame(tick);
  };

  const cancelBrew = () => {
    cancelAnimationFrame(animationRef.current);
    setPhase("choose");
    setBrewProgress(0);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phase === "brewing") return;
    pointerRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)) choose(selected + (dx < 0 ? 1 : -1));
  };

  const drink = drinks[selected];
  const presentation = reducedMotion ? 1 : Math.min(1, scrollProgress * 1.6);
  const sceneLabel = phase === "ready" ? "Твоя чашка готова" : phase === "brewing" ? "Готовим чашку" : drink.note;

  return (
    <section ref={trackRef} className="coffee-track" aria-labelledby="hero-title">
      <div className="coffee-hero">
        <div className="hero-outline" aria-hidden="true">HOUSTON</div>
        <div className="hero-copy">
          <p className="eyebrow">Кофе без лишнего шума</p>
          <h1 id="hero-title">Хьюстон,<br />у нас <em>кофе.</em></h1>
          <p>Фирменная чашка, тёплый свет и пауза, которую можно взять с собой.</p>
          <div className="hero-actions">
            <Link className="pill" href="/menu">Открыть меню</Link>
            <a className="text-link" href="#about">Познакомиться</a>
          </div>
        </div>

        <div className="coffee-experience" style={{ "--presentation": presentation } as CSSProperties}>
          <div
            className={`cup-stage cup-${drink.color} phase-${phase}`}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { pointerRef.current = null; }}
            role="group"
            aria-label={`Интерактивный стакан. Выбрано: ${drink.name}`}
          >
            <div className="pour-stream" style={{ opacity: brewProgress > 0.08 && brewProgress < 0.82 ? 1 : 0 }} />
            <div className="steam" aria-hidden="true"><i /><i /><i /></div>
            <div className="cup-shadow" aria-hidden="true" />
            <div className="paper-cup">
              <div className="coffee-fill" style={{ height: `${Math.max(0, brewProgress - 0.12) * 105}%` }} />
              <div className="cup-rim" />
              <Image className="cup-logo" src="/brand/wordmark.png" width={150} height={44} alt="" />
            </div>
            <div className="cup-lid" aria-hidden="true" />
          </div>

          <div className="coffee-controls">
            <p className="eyebrow">Выбери настроение</p>
            <div className="drink-selector">
              <button type="button" className="arrow-button" onClick={() => choose(selected - 1)} disabled={phase === "brewing"} aria-label="Предыдущий напиток">←</button>
              <strong>{drink.name}</strong>
              <button type="button" className="arrow-button" onClick={() => choose(selected + 1)} disabled={phase === "brewing"} aria-label="Следующий напиток">→</button>
            </div>
            <div className="drink-tabs" aria-label="Напитки">
              {drinks.map((item, index) => (
                <button
                  key={item.slug}
                  type="button"
                  aria-pressed={index === selected}
                  aria-label={`Выбрать ${item.name}`}
                  onClick={() => choose(index)}
                  disabled={phase === "brewing"}
                ><i className={`swatch-${item.color}`} /><span>0{index + 1}</span></button>
              ))}
            </div>
            {phase === "brewing" ? (
              <div className="brew-state">
                <p>{sceneLabel} — {Math.round(brewProgress * 100)}%</p>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label="Приготовление напитка"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(brewProgress * 100)}
                ><i style={{ width: `${brewProgress * 100}%` }} /></div>
                <button type="button" className="text-button" onClick={cancelBrew}>Отменить</button>
              </div>
            ) : (
              <div className="brew-actions">
                <button type="button" className="pill" onClick={startBrew}>{phase === "ready" ? "Повторить" : selected === 2 ? "Наполнить чашку" : "Заварить кофе"}</button>
                <Link className="pill outline" href={`/menu?focus=${drink.slug}`}>Настроить и заказать</Link>
              </div>
            )}
            <p className="scene-status" aria-live="polite">{sceneLabel}</p>
          </div>
        </div>
        <p className="scroll-cue" aria-hidden="true">Прокрути — стакан появится <span>↓</span></p>
      </div>
    </section>
  );
}
