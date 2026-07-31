import { useState, useRef, useCallback, useLayoutEffect } from 'react';

// `cropY` is saved as "the point in the photo that should stay centered" (0-100, top-to-bottom),
// not a raw scroll-percentage — so it has to be re-projected into an `object-position` value
// specific to THIS container's actual measured size, otherwise a crop chosen in the (tall) editor
// frame shows a completely different slice of the photo in a short card (e.g. a 140px note thumb).
// Works for <img>, CSS background-image, and <video> alike — all it needs is the URL (to preload
// and read its natural size) and a ref to the container it's actually being rendered into.
export function useImageCropPosition(url, cropY, containerRef) {
  const [objY, setObjY] = useState(cropY);
  const dimsRef = useRef(null);
  const [inView, setInView] = useState(false);

  const recompute = useCallback(() => {
    const container = containerRef.current;
    const dims = dimsRef.current;
    if (!container || !dims) return;
    const cw = container.clientWidth, ch = container.clientHeight;
    if (!cw || !ch) return;
    const scale = Math.max(cw / dims.w, ch / dims.h);
    const scaledH = dims.h * scale;
    const extra = scaledH - ch;
    if (extra <= 0.5) { setObjY(50); return; }
    const focusPx = (cropY / 100) * scaledH;
    const top = Math.min(extra, Math.max(0, focusPx - ch / 2));
    setObjY((top / extra) * 100);
  }, [cropY, containerRef]);

  // Wait until the container is actually near the viewport before touching
  // the network/decoder at all — otherwise every row in a long list (a
  // family's whole journal history, say) force-decodes its full photo the
  // instant it mounts regardless of scroll position, which can exhaust
  // memory on mobile Safari and crash the whole tab to a blank white screen.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); io.disconnect(); }
    }, { rootMargin: '600px' });
    io.observe(container);
    return () => io.disconnect();
  }, [containerRef]);

  useLayoutEffect(() => {
    if (!url || !inView) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      dimsRef.current = { w: img.naturalWidth, h: img.naturalHeight };
      recompute();
    };
    img.src = url;
    return () => { cancelled = true; };
  }, [url, inView, recompute]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [recompute]);

  return { objY, inView };
}

// Native `loading="lazy"` is what actually used to gate the real <img>'s own
// fetch/decode here — but Safari has a long-standing bug where it only
// honors that attribute reliably for images scrolled by the *document*,
// not ones inside a custom `overflow`-scrolling container (which is what
// every screen in this app uses instead of window scroll). Inside one of
// those, Safari loads/decodes the image the instant it mounts regardless of
// position — silently defeating lazy-loading for every row at once, which
// is exactly the "force-decode the whole list" crash the inView gate above
// was meant to prevent. `inView` already comes from a real IntersectionObserver
// (unaffected by that Safari bug), so gating the <img>'s `src` on it directly
// — not just the hook's own internal preload — is what actually fixes it.
function CroppedImg({ src, cropY = 50, alt = '', fade = false, onClick, onError, style, className }) {
  const containerRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const { objY, inView } = useImageCropPosition(src, cropY, containerRef);

  return (
    <div ref={containerRef} className={className} style={{ width: '100%', height: '100%', ...style }}>
      <img
        src={inView ? src : undefined}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onClick={onClick}
        onError={onError}
        loading="lazy"
        style={{
          width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${objY}%`, display: 'block',
          ...(fade ? { opacity: loaded ? 1 : 0, transition: 'opacity 0.35s ease' } : {}),
        }}
      />
    </div>
  );
}

export function CroppedBg({ src, cropY = 50, style, className, children }) {
  const containerRef = useRef(null);
  const { objY, inView } = useImageCropPosition(src, cropY, containerRef);
  return (
    <div ref={containerRef} className={className} style={{ ...style, backgroundImage: inView ? `url('${src}')` : 'none', backgroundSize: 'cover', backgroundPosition: `center ${objY}%` }}>
      {children}
    </div>
  );
}

export default CroppedImg;
