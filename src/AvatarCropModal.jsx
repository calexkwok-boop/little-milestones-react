import { useRef, useEffect } from 'react';

function AvatarCropModal({ imageSrc, onConfirm, onCancel }) {
  const DISPLAY = 296;
  const CIRCLE_R = 128;
  const OUTPUT = 400;

  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  // All mutable state lives in a plain object via ref to avoid stale-closure issues
  const st = useRef({
    scale: 1, ox: 0, oy: 0, nw: 0, nh: 0, minScale: 0.1,
    dragging: false, lx: 0, ly: 0, pd: null, ps: 1, loaded: false,
  }).current;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    imgRef.current = img;
    let raf = null;

    function draw() {
      ctx.clearRect(0, 0, DISPLAY, DISPLAY);
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, DISPLAY, DISPLAY);
      if (!st.loaded) return;
      const dw = st.nw * st.scale;
      const dh = st.nh * st.scale;
      const dx = DISPLAY / 2 - dw / 2 + st.ox;
      const dy = DISPLAY / 2 - dh / 2 + st.oy;
      ctx.drawImage(img, dx, dy, dw, dh);
      // Dark overlay outside crop circle using evenodd fill
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, DISPLAY, DISPLAY);
      ctx.arc(DISPLAY / 2, DISPLAY / 2, CIRCLE_R, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(0,0,0,0.58)';
      ctx.fill('evenodd');
      ctx.restore();
      // Circle border
      ctx.strokeStyle = 'rgba(255,255,255,0.72)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(DISPLAY / 2, DISPLAY / 2, CIRCLE_R, 0, Math.PI * 2);
      ctx.stroke();
    }

    function schedule() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    }

    img.onload = () => {
      st.nw = img.naturalWidth;
      st.nh = img.naturalHeight;
      st.loaded = true;
      const shorter = Math.min(st.nw, st.nh);
      st.minScale = (CIRCLE_R * 2) / shorter;
      st.scale = st.minScale;
      st.ox = 0; st.oy = 0;
      schedule();
    };
    img.src = imageSrc;

    function onWheel(e) {
      e.preventDefault();
      st.scale = Math.min(10, Math.max(st.minScale, st.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      schedule();
    }
    function onMouseDown(e) { st.dragging = true; st.lx = e.clientX; st.ly = e.clientY; }
    function onMouseMove(e) {
      if (!st.dragging) return;
      st.ox += e.clientX - st.lx; st.oy += e.clientY - st.ly;
      st.lx = e.clientX; st.ly = e.clientY;
      schedule();
    }
    function onMouseUp() { st.dragging = false; }

    function onTouchStart(e) {
      if (e.touches.length === 1) {
        st.dragging = true; st.pd = null;
        st.lx = e.touches[0].clientX; st.ly = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        st.dragging = false;
        st.pd = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
        st.ps = st.scale;
      }
    }
    function onTouchMove(e) {
      e.preventDefault();
      if (e.touches.length === 1 && st.dragging) {
        st.ox += e.touches[0].clientX - st.lx; st.oy += e.touches[0].clientY - st.ly;
        st.lx = e.touches[0].clientX; st.ly = e.touches[0].clientY;
        schedule();
      } else if (e.touches.length === 2 && st.pd !== null) {
        const d = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
        st.scale = Math.min(10, Math.max(st.minScale, st.ps * (d / st.pd)));
        schedule();
      }
    }
    function onTouchEnd() { st.dragging = false; st.pd = null; }

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConfirm() {
    const img = imgRef.current;
    if (!img || !st.loaded) return;
    const out = document.createElement('canvas');
    out.width = OUTPUT; out.height = OUTPUT;
    const ctx = out.getContext('2d');
    const dw = st.nw * st.scale;
    const dh = st.nh * st.scale;
    const imgLeft = DISPLAY / 2 - dw / 2 + st.ox;
    const imgTop = DISPLAY / 2 - dh / 2 + st.oy;
    const cropLeft = DISPLAY / 2 - CIRCLE_R;
    const cropTop = DISPLAY / 2 - CIRCLE_R;
    const srcX = (cropLeft - imgLeft) / st.scale;
    const srcY = (cropTop - imgTop) / st.scale;
    const srcSize = (CIRCLE_R * 2) / st.scale;
    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT, OUTPUT);
    out.toBlob(blob => { if (blob) onConfirm(blob); }, 'image/jpeg', 0.92);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '0 20px' }}>
      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, margin: '0 0 14px', fontFamily: 'Inter, sans-serif' }}>
        Drag to reposition · Pinch or scroll to zoom
      </p>
      <canvas
        ref={canvasRef}
        width={DISPLAY}
        height={DISPLAY}
        style={{ display: 'block', borderRadius: 12, cursor: 'grab', touchAction: 'none', maxWidth: '100%' }}
      />
      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button onClick={onCancel} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, padding: '12px 28px', borderRadius: 12, cursor: 'pointer' }}>
          Cancel
        </button>
        <button onClick={handleConfirm} style={{ background: 'var(--accent)', border: 'none', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, padding: '12px 28px', borderRadius: 12, cursor: 'pointer' }}>
          Use Photo
        </button>
      </div>
    </div>
  );
}

export default AvatarCropModal;
