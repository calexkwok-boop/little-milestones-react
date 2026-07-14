import { useState, useEffect } from 'react';
import { supabase } from '../supabase.js';
import { cloudinaryTransform, exactAgeLabel } from '../constants.js';

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
  const kidLabel = (entry.kid_names || []).map(k => k.name).join(' & ');
  const age = entry.kid_names?.[0]?.birthdate ? exactAgeLabel(entry.kid_names[0].birthdate, entry.date) : null;

  return (
    <div className="app-root" data-theme={theme} style={{ overflowY: 'auto' }}>
      <div style={{ padding: '20px 20px 40px' }}>
        <p style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: 20, color: 'var(--accent)', margin: '0 0 24px', textAlign: 'center' }}>Patina</p>

        {entry.media?.[0] && (
          <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 18 }}>
            {entry.media[0].type === 'video' ? (
              <video src={entry.media[0].url} controls playsInline style={{ width: '100%', display: 'block' }} />
            ) : (
              <img src={cloudinaryTransform(entry.media[0].url, 'w_1000,q_auto,f_auto')} style={{ width: '100%', display: 'block' }} alt="" />
            )}
          </div>
        )}

        <div style={{ marginBottom: 18 }}>
          {kidLabel && <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>{kidLabel}</p>}
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>{dateLabel}{age ? ` · ${age}` : ''}</p>
        </div>

        {entry.text && (
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 16, lineHeight: 1.7, color: 'var(--text)', margin: '0 0 32px', whiteSpace: 'pre-wrap' }}>
            {entry.text}
          </p>
        )}

        <a
          href="/"
          style={{ display: 'block', textAlign: 'center', padding: '14px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--accent)', fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}
        >
          Start your own family journal on Patina
        </a>
      </div>
    </div>
  );
}

export default SharedEntryScreen;
