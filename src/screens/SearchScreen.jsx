import { useState, useEffect, useMemo } from 'react';
import { Icon } from '../icons';
import JournalEntryRow from '../JournalEntryRow.jsx';
import { milestoneInfo } from '../constants.js';

function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function SearchScreen({ entries, kids, onBack, onOpenEntry }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Coordinate-based home detection: the cluster center with the most neighbors within 25 miles
  const homePt = useMemo(() => {
    const pts = entries.filter(e => e.locationLat != null && e.locationLng != null);
    if (pts.length < 2) return null;
    let best = null, bestCount = 0;
    pts.forEach(p => {
      const count = pts.filter(q => haversine(p.locationLat, p.locationLng, q.locationLat, q.locationLng) <= 25).length;
      if (count > bestCount) { bestCount = count; best = p; }
    });
    if (!best || bestCount < 2) return null;
    return { lat: best.locationLat, lng: best.locationLng };
  }, [entries]);

  const matches = useMemo(() => debouncedQuery.trim() ? entries.filter(e => {
    const m = e.milestone ? milestoneInfo(e.milestone) : null;
    const kid = kids.find(k => k.id === e.kids[0]);
    const q = debouncedQuery.toLowerCase();
    const hasVideo = e.media?.some(m => m.type === 'video' || /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(m.url || ''));
    const isTrip = e.locationLat != null && homePt != null && haversine(homePt.lat, homePt.lng, e.locationLat, e.locationLng) > 25;
    return (e.text || '').toLowerCase().includes(q) || (m && m.label.toLowerCase().includes(q)) || kid?.name.toLowerCase().includes(q) || e.location?.toLowerCase().includes(q) || (hasVideo && 'video'.includes(q)) || (e.milestone && 'milestone'.includes(q)) || (e.favorited && 'favorites'.includes(q)) || (isTrip && 'trips'.includes(q)) || (e.people || []).some(p => p.toLowerCase().includes(q));
  }) : [], [debouncedQuery, entries, kids, homePt]);

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><Icon name="ti-arrow-left" /></button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 28, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 5px' }} />
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, color: 'var(--accent)', margin: 0, fontWeight: 700 }}>Search</h2>
            </div>
            <div style={{ width: 36 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px' }}>
            <Icon name="ti-search" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search moments, people, places..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', flex: 1, fontSize: 16, background: 'transparent', color: 'var(--accent)', fontFamily: 'Inter, sans-serif' }}
            />
          </div>
          {!query.trim() && (
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'video', icon: 'ti-video' },
                { label: 'trips', icon: 'ti-map-pin' },
                { label: 'milestone', icon: 'ti-star' },
                { label: 'favorites', icon: 'ti-heart' },
              ].map(({ label, icon }) => (
                <button key={label} onClick={() => setQuery(label)} className="chip" style={{ flex: 1, justifyContent: 'center', padding: '7px 6px', fontSize: 12 }}>
                  <Icon name={icon} style={{ fontSize: 12 }} />
                  {label}
                </button>
              ))}
            </div>
          )}
          {query.trim() && matches.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>No moments found</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: matches.length > 0 ? 14 : 0 }}>
            {matches.map(e => {
              const entryKids = (e.kids || []).map(id => kids.find(k => k.id === id)).filter(Boolean);
              return <JournalEntryRow key={e.id} entry={e} entryKids={entryKids} onOpen={onOpenEntry} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SearchScreen;
