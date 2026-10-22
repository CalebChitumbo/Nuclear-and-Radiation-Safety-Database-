"use client";

import { useEffect, useState } from "react";

/**
 * "On this page" — a row of links to a long page's sections, kept in view
 * under the top bar so an officer can jump straight to a panel instead of
 * scrolling the whole page for it, and jump again from wherever they are.
 *
 * Each link points at an element id; give the section that id (a `Panel` takes
 * an `id`, anything else can be wrapped in `<JumpTarget>`). A link whose
 * section is not on the page — a panel shown only to one section, say — is
 * left out, so the bar never offers a jump to nothing. The link for the
 * section being read is highlighted as the page scrolls.
 */
export interface JumpLink {
  id: string;
  label: string;
}

export function JumpLinks({ links }: { links: JumpLink[] }) {
  const [present, setPresent] = useState<JumpLink[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const key = links.map((l) => l.id).join("|");

  // Which sections are actually rendered — re-checked when the page's content
  // settles (data loads, a panel appears for this account).
  useEffect(() => {
    const check = () =>
      setPresent((prev) => {
        // A wrapper whose content rendered nothing is no destination either.
        const next = links.filter(
          (l) => (document.getElementById(l.id)?.offsetHeight ?? 0) > 0,
        );
        const same =
          next.length === prev.length && next.every((l, i) => l.id === prev[i]?.id);
        return same ? prev : next;
      });
    check();
    const observer = new MutationObserver(check);
    const main = document.querySelector("main") || document.body;
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The section being read: the last one whose top has passed under the bar.
  useEffect(() => {
    if (!present.length) return;
    const onScroll = () => {
      const line = 150;
      let current: string | null = present[0].id;
      for (const l of present) {
        const el = document.getElementById(l.id);
        if (el && el.getBoundingClientRect().top <= line) current = l.id;
      }
      // At the very bottom the last short section may never reach the line.
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4
      ) {
        current = present[present.length - 1].id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [present]);

  // Keep the highlighted link visible when the row scrolls sideways (phones).
  // The row is scrolled itself: scrollIntoView on the link would cancel the
  // page's own smooth scroll to the section.
  useEffect(() => {
    if (!active) return;
    const link = document.querySelector<HTMLElement>(`[data-jump="${active}"]`);
    const track = link?.parentElement;
    if (!link || !track) return;
    const left = link.offsetLeft - track.offsetLeft;
    const right = left + link.offsetWidth;
    if (left < track.scrollLeft || right > track.scrollLeft + track.clientWidth - 24) {
      track.scrollTo({ left: Math.max(0, left - 16), behavior: "smooth" });
    }
  }, [active]);

  if (present.length < 2) return null;

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    history.replaceState(null, "", `#${id}`);
    setActive(id);
  };

  return (
    <nav className="jump-nav no-print" aria-label="On this page">
      <span className="jump-label">On this page</span>
      <div className="jump-track">
        {present.map((l) => (
          <a
            key={l.id}
            href={`#${l.id}`}
            data-jump={l.id}
            className="jump-link"
            aria-current={active === l.id ? "true" : undefined}
            onClick={(e) => {
              e.preventDefault();
              jump(l.id);
            }}
          >
            {l.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

/** A jump destination for content that is not a single `Panel`. */
export function JumpTarget({
  id,
  children,
  className = "",
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div id={id} className={`jump-target ${className}`}>
      {children}
    </div>
  );
}
