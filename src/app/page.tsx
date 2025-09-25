"use client";

import { useLayoutEffect, useRef, useState } from "react";

type Pt = { x: number; y: number };
type Size = { w: number; h: number };
type Rect = { x: number; y: number; w: number; h: number };

// Intrinsic-pixel hotspot rectangles
const HOTSPOT_LEFT_INTRINSIC = {
  x1: 160,
  y1: 453,
  x2: 696,
  y2: 542,
};

const HOTSPOT_RIGHT_INTRINSIC = {
  x1: 2069,
  y1: 9497,
  x2: 13575,
  y2: 10520,
};

function MovableCard({
  id,
  initial,
  size,
  imageUrl,
  hotspot,
  linkHref,
}: {
  id: string;
  initial: Pt;
  size: Size;
  imageUrl: string;
  hotspot?: Rect;
  linkHref?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const pos = useRef<Pt>({ ...initial });
  const dragging = useRef(false);
  const dragOffset = useRef<Pt>({ x: 0, y: 0 });
  const rafId = useRef<number | null>(null);

  // apply initial placement and size
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.width = `${size.w}px`;
    el.style.height = `${size.h}px`;
    el.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0)`;
  }, [size.w, size.h]);

  const scheduleRender = () => {
    if (rafId.current != null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      const el = ref.current;
      if (!el) return;
      el.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0)`;
    });
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    pos.current = {
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y,
    };
    scheduleRender();
  };

  const stopDragging = () => {
    dragging.current = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDragging);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault(); // avoid scroll/selection interference
    (e.target as Element).setPointerCapture?.(e.pointerId);

    const rect = ref.current?.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    };
    dragging.current = true;

    // attach listeners only during the drag session
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", stopDragging, { passive: true });
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      role="group"
      aria-label={`Card ${id}`}
      className="absolute select-none shadow-xl cursor-grab"
      style={{
        left: 0,
        top: 0,
        willChange: "transform",
        touchAction: "none",
        userSelect: "none",
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: "contain",   // show entire image
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundColor: "white",
      }}
    >
      {hotspot && linkHref && (
        <a
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open link"
          // Let clicks win, but don't start a drag from the hotspot.
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute block z-10 group cursor-pointer
                     transition-colors duration-150
                     hover:bg-black/10 focus:bg-black/10
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70"
          style={{
            left: hotspot.x,
            top: hotspot.y,
            width: hotspot.w,
            height: hotspot.h,
          }}
        >
          {/* Hover/focus badge */}
          <span
            className="pointer-events-none absolute right-1 bottom-1
                       rounded px-1.5 py-0.5 text-[10px] font-medium
                       bg-black/60 text-white/95 opacity-0
                       transition-opacity duration-150
                       group-hover:opacity-100 group-focus:opacity-100"
          >
            Open
          </span>
          <span className="sr-only">Open link</span>
        </a>
      )}
    </div>
  );
}

export default function TwoImageCardsAutoSizeWithHotspot() {
  const [ready, setReady] = useState(false);
  const [bgUrl, setBgUrl] = useState<string | null>(null); // background image if present
  const [sizes, setSizes] = useState<{ left: Size; right: Size } | null>(null);
  const [centers, setCenters] = useState<{ left: Pt; right: Pt } | null>(null);
  const [hotspots, setHotspots] = useState<{ left: Rect; right: Rect } | null>(null);

  // Try to use /image3.png as page background; fall back to black if not found
  useLayoutEffect(() => {
    const img = new Image();
    img.onload = () => setBgUrl("/image3.png");
    img.onerror = () => setBgUrl(null);
    img.src = "/image3.png";
  }, []);

  useLayoutEffect(() => {
    const loadMeta = (src: string) =>
      new Promise<Size>((resolve, reject) => {
        const img = new Image();
        img.onload = () =>
          resolve({ w: img.naturalWidth || 360, h: img.naturalHeight || 240 });
        img.onerror = reject;
        img.src = src;
      });

    (async () => {
      const [metaLeft, metaRight] = await Promise.all([
        loadMeta("/image2.png"),
        loadMeta("/image.png"),
      ]);

      // scale down (never up) to fit viewport comfortably
      const margin = 24;
      const vw = Math.max(window.innerWidth - margin * 2, 300);
      const vh = Math.max(window.innerHeight - margin * 2, 300);

      const fit = (sz: Size): { size: Size; scale: number } => {
        const maxW = Math.min(vw * 0.45, vw);
        const maxH = Math.min(vh * 0.7, vh);
        const s = Math.min(maxW / sz.w, maxH / sz.h, 1);
        return { size: { w: Math.round(sz.w * s), h: Math.round(sz.h * s) }, scale: s };
      };

      const { size: leftSize, scale: sLeft } = fit(metaLeft);
      const { size: rightSize, scale: sRight } = fit(metaRight);
      setSizes({ left: leftSize, right: rightSize });

      // helper to scale intrinsic rect by scale factor
      const scaleRect = (
        r: { x1: number; y1: number; x2: number; y2: number },
        s: number
      ): Rect => ({
        x: r.x1 * s,
        y: r.y1 * s,
        w: (r.x2 - r.x1) * s,
        h: (r.y2 - r.y1) * s,
      });

      // scale each hotspot using its own image's scale
      const leftHotspot = scaleRect(HOTSPOT_LEFT_INTRINSIC, sLeft);
      const rightHotspot = scaleRect(HOTSPOT_RIGHT_INTRINSIC, sRight);
      setHotspots({ left: leftHotspot, right: rightHotspot });

      // place them side-by-side centered with a gap
      const gap = 24;
      const totalW = leftSize.w + gap + rightSize.w;
      const y = Math.max(
        margin,
        (window.innerHeight - Math.max(leftSize.h, rightSize.h)) / 2
      );
      const startX = Math.max(margin, (window.innerWidth - totalW) / 2);

      setCenters({
        left: { x: startX, y },
        right: { x: startX + leftSize.w + gap, y },
      });

      setReady(true);
    })().catch(() => {
      // fallback if image metadata fails
      const fallback: Size = { w: 360, h: 240 };
      setSizes({ left: fallback, right: fallback });
      setHotspots({
        left: { x: 10, y: 180, w: 340, h: 40 },
        right: { x: 10, y: 180, w: 340, h: 40 },
      });
      setCenters({
        left: { x: 40, y: 80 },
        right: { x: 40 + fallback.w + 24, y: 80 },
      });
      setReady(true);
    });
  }, []);

  if (!ready || !sizes || !centers || !hotspots) {
    return (
      <main
        className="min-h-screen w-full relative overflow-hidden"
        style={{ backgroundColor: "black" }}
      />
    );
  }

  return (
    <main
      className="min-h-screen w-full relative overflow-hidden"
      style={{
        backgroundColor: "black",
        backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Left = /image2.png → openai.com with custom hotspot */}
      <MovableCard
        id="Left"
        initial={centers.left}
        size={sizes.left}
        imageUrl="/image2.png"
        hotspot={hotspots.left}
        linkHref="https://bokcenter.harvard.edu/people/madeleine-woods"
      />
      {/* Right = /image.png → apple.com with original hotspot */}
      <MovableCard
        id="Right"
        initial={centers.right}
        size={sizes.right}
        imageUrl="/image.png"
        hotspot={hotspots.right}
        linkHref="https://www.linkedin.com/in/elisadiopweyer/"
      />
    </main>
  );
}
