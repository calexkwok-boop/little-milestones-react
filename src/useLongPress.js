import { useRef } from 'react';

export default function useLongPress(callback, ms = 500) {
  const timer = useRef(null);
  const didFire = useRef(false);
  const startPos = useRef(null);

  function onTouchStart(e) {
    if (!callback) return;
    didFire.current = false;
    startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    timer.current = setTimeout(() => { didFire.current = true; callback(); }, ms);
  }
  function onTouchMove(e) {
    if (!startPos.current) return;
    if (Math.abs(e.touches[0].clientX - startPos.current.x) > 8 ||
        Math.abs(e.touches[0].clientY - startPos.current.y) > 8) {
      clearTimeout(timer.current);
    }
  }
  function onTouchEnd() { clearTimeout(timer.current); startPos.current = null; }
  function wrapClick(handler) {
    return (e) => { if (didFire.current) { didFire.current = false; return; } handler?.(e); };
  }
  return { onTouchStart, onTouchMove, onTouchEnd, wrapClick, didFire };
}
