import { useState, useEffect } from 'react';
import { Icon } from '../icons';
import { supabase } from '../supabase.js';

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return new Date(ts).toLocaleDateString('en-US', { weekday: 'short' });
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const KIND_ICON = {
  like: 'heart',
  comment: 'message-circle',
  reply: 'message-circle',
  friend_request: 'user-plus',
  birthday: 'cake',
  prompt_nudge: 'sparkles',
  partner_entry: 'mail',
};

function NotificationHistoryScreen({ currentUserId, onBack, onOpenEntry, onOpenBirthdayKid }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !currentUserId) { setLoading(false); return; }
    let cancelled = false;
    supabase.from('notification_log').select('*').eq('user_id', currentUserId).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { if (!cancelled) { setItems(data || []); setLoading(false); } });
    return () => { cancelled = true; };
  }, [currentUserId]);

  function markRead(id) {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n));
    if (supabase) supabase.from('notification_log').update({ read_at: new Date().toISOString() }).eq('id', id).then(() => {});
  }

  function markAllRead() {
    const unreadIds = items.filter(n => !n.read_at).map(n => n.id);
    if (unreadIds.length === 0) return;
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: new Date().toISOString() }));
    if (supabase) supabase.from('notification_log').update({ read_at: new Date().toISOString() }).in('id', unreadIds).then(() => {});
  }

  function handleOpen(n) {
    markRead(n.id);
    if (!n.url) return;
    try {
      const parsed = new URL(n.url, window.location.origin);
      const entryId = parsed.searchParams.get('open');
      const birthdayKidId = parsed.searchParams.get('openBirthday');
      if (entryId) { onOpenEntry?.(entryId); onBack(); return; }
      if (birthdayKidId) { onOpenBirthdayKid?.(birthdayKidId); onBack(); return; }
    } catch {}
  }

  const unreadCount = items.filter(n => !n.read_at).length;

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <button className="icon-btn" onClick={onBack}><Icon name="ti-arrow-left" /></button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 28, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 5px' }} />
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, color: 'var(--accent)', margin: 0, fontWeight: 700 }}>Notifications</h2>
            </div>
            {unreadCount > 0 ? (
              <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", fontWeight: 500, padding: 0 }}>Mark all read</button>
            ) : <div style={{ width: 24 }} />}
          </div>

          {loading ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginTop: 40 }}>Loading…</p>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: 60 }}>
              <Icon name="ti-bell-off" style={{ fontSize: 28, color: 'var(--text-muted)' }} />
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '10px 0 0' }}>Nothing here yet.</p>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginTop: 8 }}>
              {items.map((n, idx) => (
                <div
                  key={n.id}
                  onClick={() => handleOpen(n)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 14px',
                    borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
                    cursor: n.url ? 'pointer' : 'default',
                    background: n.read_at ? 'transparent' : 'rgba(107,158,109,0.07)',
                  }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <Icon name={`ti-${KIND_ICON[n.kind] || 'bell'}`} style={{ fontSize: 15, color: 'var(--accent)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: n.read_at ? 500 : 700, color: 'var(--text)', margin: 0 }}>{n.title}</p>
                    <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '3px 0 0', lineHeight: 1.5 }}>{n.body}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '5px 0 0' }}>{timeAgo(new Date(n.created_at).getTime())}</p>
                  </div>
                  {!n.read_at && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 6 }} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default NotificationHistoryScreen;
