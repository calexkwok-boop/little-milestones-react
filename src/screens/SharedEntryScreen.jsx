import { useState, useEffect } from 'react';
import { supabase } from '../supabase.js';
import { cloudinaryTransform, exactAgeLabel, AVATAR_TRANSFORM_SM } from '../constants.js';

function SharedEntryScreen({ token, effectiveDark }) {
  const theme = effectiveDark ? 'dark' : undefined;
  const [status, setStatus] = useState('loading'); // 'loading' | 'not-found' | 'ready'
  const [entry, setEntry] = useState(null);

  useEffect(() => {
    if (!supabase || !token) { setStatus('not-found'); return; }
    let cancelled = false;
    supabase.rpc('get_shared_entry', { p_token: token }).then(({ data, error }) => {
      if (cancelled) return;
      const row = data?.[0];
      if (error || !row) { setStatus('not-found'); return; }
      setEntry(row);
      setStatus('ready');
    });
    return () => { cancelled = true; };
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="app-root" data-theme={theme} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <i className="ti ti-loader-2" style={{ fontSize: 32, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (status === 'not-found') {
    return (
      <div className="app-root" data-theme={theme} style={{ alignItems: 'center', justifyContent: 'center', padding: '0 32px', textAlign: 'center' }}>
        <i className="ti ti-link-off" style={{ fontSize: 32, color: 'var(--text-muted)', marginBottom: 14 }} />
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>This link isn't available anymore</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>It may have been revoked by the person who shared it.</p>
      </div>
    );
  }

  const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const kids = entry.kid_names || [];
  const kidLabel = kids.map(k => k.name).join(' & ');
  const age = kids[0]?.birthdate ? exactAgeLabel(kids[0].birthdate, entry.date) : null;
  const bodyText = (entry.text || '').replace(/^dear\s+[\w\s,&]+[,.]?\s*/i, '').trim();

  return (
    <div className="app-root" data-theme={theme} style={{ overflowY: 'auto' }}>
      <div style={{ padding: '20px 20px 40px' }}>
        <p style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 22, color: '#C8993E', margin: '0 0 24px', textAlign: 'center' }}>Patina</p>

        {entry.media?.[0] && (
          <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 18 }}>
            {entry.media[0].type === 'video' ? (
              <video src={entry.media[0].url} controls playsInline style={{ width: '100%', display: 'block' }} />
            ) : (
              <img src={cloudinaryTransform(entry.media[0].url, 'w_1000,q_auto,f_auto')} style={{ width: '100%', display: 'block' }} alt="" loading="lazy" />
            )}
          </div>
        )}

        {kids.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ display: 'flex', flexShrink: 0 }}>
              {kids.map((k, i) => (
                <span key={i} style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--bg)', marginLeft: i > 0 ? -14 : 0, background: k.accent || '#C8993E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {k.avatarUrl
                    ? <img src={cloudinaryTransform(k.avatarUrl, AVATAR_TRANSFORM_SM)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" />
                    : <span style={{ color: '#fff', fontWeight: 700, fontSize: 16, fontFamily: "'Urbanist', sans-serif" }}>{k.name?.[0]?.toUpperCase()}</span>}
                </span>
              ))}
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>Dear {kidLabel},</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>{age ? `${age} old · ` : ''}{dateLabel}</p>
            </div>
          </div>
        )}

        {bodyText && (
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 16, lineHeight: 1.7, color: 'var(--text)', margin: '0 0 32px', whiteSpace: 'pre-wrap' }}>
            {bodyText}
          </p>
        )}

        <a
          href="/"
          style={{ display: 'block', textAlign: 'center', padding: '14px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--accent)', fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}
        >
          Never forget a moment, start your own family journal on Patina
        </a>
      </div>
    </div>
  );
}

export default SharedEntryScreen;
