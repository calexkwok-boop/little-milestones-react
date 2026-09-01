import { useState, useEffect, useRef } from 'react';
import { Icon } from '../icons';
import { supabase } from '../supabase.js';

// Full-screen "search the web for a photo" sheet, offered as a third option
// alongside "Take a photo" / "Upload from library" in the media menu. Results
// come from Google's Custom Search JSON API via the `image-search` edge
// function (keeps the API key server-side). Picking a result doesn't try to
// fetch the image into the browser first — most image hosts don't send CORS
// headers, so a client-side fetch() would fail for a large fraction of
// results. Instead the parent hands the picked URL straight to
// uploadToCloudinary(), which Cloudinary fetches server-side, same as a
// normal file upload just with a URL instead of bytes.
export default function ImageSearchSheet({ onClose, onSelect, adding }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [pickedUrl, setPickedUrl] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setError(''); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      setError('');
      try {
        const { data, error: fnError } = await supabase.functions.invoke('image-search', { body: { query: q, limit: 10 } });
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        setResults(data?.results || []);
      } catch (err) {
        setError(err?.message || 'Search failed');
        setResults([]);
      }
      setSearching(false);
    }, 500);
    return () => clearTimeout(t);
  }, [query]);

  function pick(result) {
    if (adding) return;
    setPickedUrl(result.imageUrl);
    onSelect(result);
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)', zIndex: 13, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px 12px', flexShrink: 0 }}>
        <button className="icon-btn" onClick={onClose} disabled={adding}>
          <Icon name="ti-x" />
        </button>
        <div style={{ position: 'relative', flex: 1 }}>
          <Icon name="ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14, pointerEvents: 'none' }} />
          <input
            ref={inputRef}
            className="input-field"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search for a photo…"
            disabled={adding}
            style={{ paddingLeft: 34 }}
          />
          {searching && (
            <Icon name="ti-loader-2" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', animation: 'spin 1s linear infinite', color: 'var(--text-muted)', fontSize: 16 }} />
          )}
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 20px 12px', flexShrink: 0 }}>
        Results from across the web — pick one and it'll be added like any other photo.
      </p>

      <div className="scroll-area" style={{ flex: 1, padding: '0 20px 20px' }}>
        {error && (
          <p style={{ fontSize: 13, color: 'var(--coral)', textAlign: 'center', marginTop: 24 }}>{error}</p>
        )}

        {!error && !searching && query.trim().length >= 2 && results.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginTop: 24 }}>No results for "{query.trim()}"</p>
        )}

        {results.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {results.map((r, i) => {
              const isPicked = adding && pickedUrl === r.imageUrl;
              return (
                <button
                  key={r.imageUrl + i}
                  onClick={() => pick(r)}
                  disabled={adding}
                  style={{
                    position: 'relative', aspectRatio: '1', padding: 0, border: 'none', borderRadius: 10,
                    overflow: 'hidden', background: 'var(--bg-elevated)', cursor: adding ? 'default' : 'pointer',
                    opacity: adding && !isPicked ? 0.4 : 1,
                  }}
                >
                  <img src={r.thumbnailUrl} alt={r.title || ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {isPicked && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="ti-loader-2" style={{ animation: 'spin 1s linear infinite', color: '#fff', fontSize: 22 }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
