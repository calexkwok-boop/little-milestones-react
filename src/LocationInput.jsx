import { useState, useRef } from 'react';
import { Icon } from './icons';

// Google Places autocomplete text input -- self-contained (fetches directly
// off VITE_GOOGLE_PLACES_KEY) so it's reusable anywhere a location needs
// typing, not just the entry composer it was originally built for.
function LocationInput({ value, onChange, onChangeCoords, placeholder = 'e.g. Disneyland, California', autoFocus, inline, compact }) {
  const [suggestions, setSuggestions] = useState([]);
  const [placesUnavailable, setPlacesUnavailable] = useState(false);
  const debounceRef = useRef(null);
  const blurRef = useRef(null);

  function handleChange(e) {
    const q = e.target.value;
    onChange(q);
    onChangeCoords?.(null, null);
    clearTimeout(debounceRef.current);
    if (placesUnavailable || q.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': import.meta.env.VITE_GOOGLE_PLACES_KEY,
            'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text',
          },
          body: JSON.stringify({ input: q }),
        });
        if (!res.ok) {
          if (res.status === 403) {
            setPlacesUnavailable(true);
            setSuggestions([]);
            console.warn('Google Places autocomplete is unavailable. Check that the Places API (New) is enabled, billing is active, and this origin is allowed for your API key.');
            return;
          }
          throw new Error(`Places autocomplete failed with ${res.status}`);
        }
        const data = await res.json();
        setSuggestions((data.suggestions || []).map(s => {
          const p = s.placePrediction;
          const main = p?.structuredFormat?.mainText?.text;
          const secondary = p?.structuredFormat?.secondaryText?.text;
          return { label: [main, secondary].filter(Boolean).join(', ') || p?.text?.text || '', placeId: p?.placeId };
        }).filter(s => s.label));
      } catch {}
    }, 350);
  }

  async function pick(s) {
    onChange(s.label);
    setSuggestions([]);
    if (placesUnavailable || !s.placeId || !onChangeCoords) return;
    try {
      const res = await fetch(`https://places.googleapis.com/v1/places/${s.placeId}`, {
        headers: {
          'X-Goog-Api-Key': import.meta.env.VITE_GOOGLE_PLACES_KEY,
          'X-Goog-FieldMask': 'location',
        },
      });
      if (!res.ok) throw new Error(`Place details failed with ${res.status}`);
      const data = await res.json();
      if (data.location) onChangeCoords(data.location.latitude, data.location.longitude);
    } catch {}
  }

  const hasSuggestions = suggestions.length > 0;

  if (compact) {
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bg-card)', borderRadius: hasSuggestions ? '8px 8px 0 0' : 8, padding: '5px 10px' }}>
          <Icon name="ti-map-pin" style={{ fontSize: 12, color: 'var(--text-2)', flexShrink: 0 }} />
          <input
            autoFocus={autoFocus}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 16, color: 'var(--text-2)', fontFamily: "'Urbanist', sans-serif", fontWeight: 500, width: value ? Math.max(80, Math.min(value.length * 9, 200)) : 90 }}
            onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') setSuggestions([]); }}
            onBlur={() => { blurRef.current = setTimeout(() => setSuggestions([]), 150); }}
            onFocus={() => clearTimeout(blurRef.current)}
          />
          {value && <button onMouseDown={e => e.preventDefault()} onClick={() => { onChange(''); setSuggestions([]); onChangeCoords?.(null, null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}><Icon name="ti-x" style={{ fontSize: 11 }} /></button>}
        </div>
        {hasSuggestions && (
          <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '0 8px 8px 8px', overflow: 'hidden', zIndex: 50, boxShadow: '0 4px 16px rgba(44,56,40,0.12)', minWidth: 220 }}>
            {suggestions.map((s, i) => (
              <div key={i} onMouseDown={e => { e.preventDefault(); pick(s); }} style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text)', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid #F0F4EE' : 'none', display: 'flex', alignItems: 'center', gap: 7 }}>
                <Icon name="ti-map-pin" style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }} />
                {s.label}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: inline ? undefined : 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: hasSuggestions && inline ? '10px 10px 0 0' : 10, padding: '11px 14px' }}>
        <Icon name="ti-map-pin" style={{ color: 'var(--text-muted)', fontSize: 15, flexShrink: 0 }} />
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          style={{ border: 'none', outline: 'none', flex: 1, fontSize: 16, background: 'transparent', color: 'var(--text)', fontFamily: 'Inter, sans-serif' }}
          onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') setSuggestions([]); }}
          onBlur={() => { blurRef.current = setTimeout(() => setSuggestions([]), 150); }}
          onFocus={() => clearTimeout(blurRef.current)}
        />
        {value ? <button onMouseDown={e => e.preventDefault()} onClick={() => { onChange(''); setSuggestions([]); onChangeCoords?.(null, null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}><Icon name="ti-x" style={{ fontSize: 14 }} /></button> : null}
      </div>
      {hasSuggestions && (
        <div style={inline ? {
          border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden', background: 'var(--bg-input)',
        } : {
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', zIndex: 50, boxShadow: '0 4px 16px rgba(44,56,40,0.12)', maxHeight: 200, overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => (
            <div key={i} onMouseDown={e => { e.preventDefault(); pick(s); }} style={{ padding: '12px 14px', fontSize: 14, color: 'var(--text)', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid #F0F4EE' : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="ti-map-pin" style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default LocationInput;
