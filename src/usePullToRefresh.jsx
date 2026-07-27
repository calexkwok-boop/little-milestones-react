import { useRef, useState } from 'react';
import { Icon } from './icons';

export default function usePullToRefresh(scrollRef, onRefresh) {
  const startY = useRef(null);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshing = useRef(false);

  const handlers = {
    onTouchStart(e) {
      if (isRefreshing.current || (scrollRef.current?.scrollTop ?? 1) > 0) return;
      startY.current = e.touches[0].clientY;
    },
    onTouchMove(e) {
      if (startY.current === null || isRefreshing.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { startY.current = null; setPullY(0); return; }
      setPullY(Math.min(dy * 0.45, 64));
    },
    onTouchEnd() {
      if (isRefreshing.current) return;
      const py = pullY;
      startY.current = null;
      setPullY(0);
      if (py >= 52) {
        isRefreshing.current = true;
        setRefreshing(true);
        Promise.resolve(onRefresh?.()).finally(() => { isRefreshing.current = false; setRefreshing(false); });
      }
    },
  };

  const indicator = (pullY > 0 || refreshing) ? (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: refreshing ? 52 : pullY, flexShrink: 0, overflow: 'hidden', transition: pullY > 0 ? 'none' : 'height 0.25s ease' }}>
      <Icon name={refreshing ? 'ti-loader-2' : 'ti-refresh'} style={{ fontSize: 20, color: 'var(--accent)', animation: refreshing ? 'spin 1s linear infinite' : 'none', transform: !refreshing ? `rotate(${(pullY / 64) * 360}deg)` : 'none', opacity: refreshing ? 1 : Math.min(pullY / 30, 1) }} />
    </div>
  ) : null;

  return { handlers, indicator };
}
