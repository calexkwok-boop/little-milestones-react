import { useState, useMemo, useRef, useEffect } from 'react';
import { Icon } from '../icons';
import { TODAY, milestoneInfo, cloudinaryTransform, videoThumbUrl, photoCropY } from '../constants.js';
import KidThumb from '../KidThumb.jsx';
import SectionSwitcher from '../SectionSwitcher.jsx';
import CroppedImg from '../CroppedImg.jsx';

function RecapEntryRow({ entry, kids, onOpenEntry, nextIsMilestone }) {
  const entryKids = (entry.kids || []).map(id => kids.find(k => k.id === id)).filter(Boolean);
  if (entryKids.length === 0) return null;
  const m = entry.milestone ? milestoneInfo(entry.milestone) : null;
  const dayLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const snippet = (entry.text || '').slice(0, 120) + (entry.text?.length > 120 ? '…' : '');
  const nameLabel = entryKids.map(k => k.name).join(' & ');
  return (
    <div
      onClick={() => onOpenEntry(entry)}
      className={m ? 'journal-entry milestone-entry' : undefined}
      style={m
        ? { cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start', margin: '10px 0' }
        : { cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 0', borderBottom: nextIsMilestone ? 'none' : '1px solid #EEF2EA' }}
    >
      <div style={{ display: 'flex', flexShrink: 0 }}>
        {entryKids.map((kid, i) => (
          <div key={kid.id} style={{ marginLeft: i > 0 ? -8 : 0, zIndex: entryKids.length - i, position: 'relative' }}>
            <KidThumb kid={kid} size={30} />
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: snippet ? 3 : 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{nameLabel}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
            {entry.favorited && <Icon name="ti-star-filled" style={{ fontSize: 11, color: '#C8993E' }} />}
            <span style={{ fontSize: 11, color: 'var(--border-light)' }}>{dayLabel}</span>
          </div>
        </div>
        {snippet && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {snippet}
          </p>
        )}
        {m && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 5, fontSize: 10, fontWeight: 700, color: '#C8993E' }}>
            {m.label}
          </span>
        )}
      </div>
    </div>
  );
}

// One cell per entry, photo or not — replaces the old split where only the
// "photos" filter got a grid and everything else (including the default
// view) got a text list. A photo/video entry shows its media; a text-only
// entry gets a small tinted card (entry.palette, the same colors used
// everywhere else an entry has no photo) with an excerpt, so it still shows
// up rather than only existing in the old list view. Milestones keep a
// gold ring + star regardless of which kind of cell they are.
function RecapGridCell({ entry, onOpenEntry }) {
  const m = entry.milestone ? milestoneInfo(entry.milestone) : null;
  const media = entry.media?.[0];
  const isVideo = media?.type === 'video';
  return (
    <div
      onClick={() => onOpenEntry(entry)}
      style={{ aspectRatio: '1', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', position: 'relative', background: media ? 'var(--bg-card)' : entry.palette.bg, boxShadow: m ? '0 0 0 2px #C8993E' : 'none' }}
    >
      {media ? (
        <>
          {isVideo ? (
            <CroppedImg src={videoThumbUrl(media.url, 'so_0,w_240,q_auto,f_auto')} cropY={photoCropY(entry.media, 0, entry)} fade />
          ) : (
            <CroppedImg src={cloudinaryTransform(media.url, 'w_240,q_auto,f_auto')} cropY={photoCropY(entry.media, 0, entry)} fade />
          )}
          {isVideo && (
            <div style={{ position: 'absolute', bottom: 5, right: 5, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="ti-player-play-filled" style={{ fontSize: 8, color: '#fff' }} />
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: '9px 8px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, lineHeight: 0.6, color: entry.palette.tint, opacity: 0.55 }}>"</span>
          <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 10, lineHeight: 1.4, margin: '5px 0 0', color: entry.palette.tint, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>
            {(entry.text || '').slice(0, 100)}
          </p>
        </div>
      )}
      {m && (
        <Icon name="ti-star-filled" style={{ position: 'absolute', top: 5, right: 5, fontSize: 13, color: '#C8993E', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }} />
      )}
    </div>
  );
}

function RecapScreen({ entries, kids, onBack, onOpenEntry, onSwitchSection, initialTarget }) {
  const [viewMode, setViewMode] = useState(initialTarget?.viewMode || 'month');
  const [selectedMonth, setSelectedMonth] = useState(initialTarget?.month || TODAY.slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(TODAY.slice(0, 4));
  const [recapFilter, setRecapFilter] = useState(initialTarget?.recapFilter || null);
  const [kidFilter, setKidFilter] = useState(initialTarget?.kidFilter || null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  function entryMatchesSearch(e) {
    const q = searchQuery.trim().toLowerCase();
    if (q === 'note' || q === 'notes') return e.type === 'note' && !e.prompt;
    if (q === 'prompt' || q === 'prompts') return e.type === 'note' && !!e.prompt;
    const m = e.milestone ? milestoneInfo(e.milestone) : null;
    const entryKids = (e.kids || []).map(id => kids.find(k => k.id === id)).filter(Boolean);
    return (e.text || '').toLowerCase().includes(q)
      || (e.prompt || '').toLowerCase().includes(q)
      || (m && m.label.toLowerCase().includes(q))
      || e.location?.toLowerCase().includes(q)
      || (e.people || []).some(p => p.toLowerCase().includes(q))
      || entryKids.some(k => k.name.toLowerCase().includes(q));
  }

  const isSearching = searchQuery.trim().length > 0;
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    return [...entries].filter(entryMatchesSearch).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [entries, searchQuery, kids]); // eslint-disable-line react-hooks/exhaustive-deps

  const segTabStyle = (tab) => ({
    border: 'none', background: 'none', padding: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    color: viewMode === tab ? 'var(--accent)' : 'var(--text-muted)',
    opacity: viewMode === tab ? 1 : 0.55,
  });

  const monthLabel = new Date(selectedMonth + '-15T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const canGoNextMonth = selectedMonth < TODAY.slice(0, 7);
  const canGoNextYear = selectedYear < TODAY.slice(0, 4);

  function prevMonth() {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  function nextMonth() {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (next <= TODAY.slice(0, 7)) setSelectedMonth(next);
  }

  const monthEntries = useMemo(() => {
    const filtered = kidFilter ? entries.filter(e => e.date.startsWith(selectedMonth) && e.kids.includes(kidFilter)) : entries.filter(e => e.date.startsWith(selectedMonth));
    return [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [entries, selectedMonth, kidFilter]);

  const { yearEntries, yearGroups } = useMemo(() => {
    const filtered = kidFilter ? entries.filter(e => e.date.startsWith(selectedYear) && e.kids.includes(kidFilter)) : entries.filter(e => e.date.startsWith(selectedYear));
    const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
    const groups = [];
    let cur = null;
    for (const e of sorted) {
      const label = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long' });
      if (label !== cur) { cur = label; groups.push({ label, entries: [] }); }
      groups[groups.length - 1].entries.push(e);
    }
    return { yearEntries: sorted, yearGroups: groups };
  }, [entries, selectedYear, kidFilter]);

  const { allEntries, allGroups } = useMemo(() => {
    const sorted = kidFilter ? [...entries].filter(e => e.kids.includes(kidFilter)) : [...entries];
    sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
    const groups = [];
    let cur = null;
    for (const e of sorted) {
      const label = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (label !== cur) { cur = label; groups.push({ label, entries: [] }); }
      groups[groups.length - 1].entries.push(e);
    }
    return { allEntries: sorted, allGroups: groups };
  }, [entries, kidFilter]);

  const periodEntries = viewMode === 'month' ? monthEntries : viewMode === 'year' ? yearEntries : allEntries;

  const { momentCount, milestoneCount, photoCount, favoriteCount } = useMemo(() => {
    let milestoneCount = 0, photoCount = 0, favoriteCount = 0;
    for (const e of periodEntries) {
      if (e.milestone) milestoneCount++;
      if (e.favorited) favoriteCount++;
      photoCount += e.media?.length || 0;
    }
    return { momentCount: periodEntries.length, milestoneCount, photoCount, favoriteCount };
  }, [periodEntries]);
  const periodEmpty = viewMode === 'month' ? `No moments logged in ${monthLabel}.` : viewMode === 'year' ? `No moments logged in ${selectedYear}.` : 'No moments logged yet.';

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button className="icon-btn" onClick={onBack}><Icon name="ti-arrow-left" /></button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 28, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 5px' }} />
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Keepsakes</h2>
              </div>
              <button className="icon-btn" onClick={() => { if (showSearch) setSearchQuery(''); setShowSearch(s => !s); }}>
                <Icon name={showSearch ? 'ti-x' : 'ti-search'} />
              </button>
            </div>

            <div>
              <SectionSwitcher
                tabs={[{ id: 'recap', label: 'Recap', icon: 'ti-sparkles' }, { id: 'partner-letters', label: 'Letters', icon: 'ti-mail' }, { id: 'compare', label: 'Same age', icon: 'ti-arrows-diff' }, { id: 'reels', label: 'Reels', icon: 'ti-player-play' }]}
                active="recap"
                onChange={onSwitchSection}
                fill
              />
            </div>
          </div>

          {showSearch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <Icon name="ti-search" style={{ color: 'var(--text-muted)', fontSize: 16 }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search moments..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 16, background: 'transparent', color: 'var(--accent)', fontFamily: 'Inter, sans-serif' }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                  <Icon name="ti-x" style={{ fontSize: 14 }} />
                </button>
              )}
            </div>
          )}

          {isSearching ? (
            searchResults.length === 0 ? (
              <div className="empty-state">
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <Icon name="ti-search" style={{ fontSize: 24, color: 'var(--text-muted)' }} />
                </div>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', margin: '0 0 6px' }}>No matches</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>Nothing matches "{searchQuery}".</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {searchResults.map(e => <RecapEntryRow key={e.id} entry={e} kids={kids} onOpenEntry={onOpenEntry} />)}
              </div>
            )
          ) : (
          <>

          {kids.length > 1 && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
              <button
                onClick={() => setKidFilter(null)}
                style={{ width: 48, height: 48, borderRadius: '50%', border: kidFilter === null ? '2.5px solid var(--accent)' : '2px solid var(--border)', background: kidFilter === null ? 'var(--accent)' : 'var(--bg-input)', color: kidFilter === null ? '#fff' : 'var(--text-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', flexShrink: 0 }}
              >All</button>
              {kids.map(kid => (
                <button
                  key={kid.id}
                  onClick={() => setKidFilter(f => f === kid.id ? null : kid.id)}
                  style={{ width: 48, height: 48, borderRadius: '50%', border: kidFilter === kid.id ? '2.5px solid var(--accent)' : '2px solid transparent', padding: 0, cursor: 'pointer', overflow: 'hidden', flexShrink: 0, opacity: kidFilter !== null && kidFilter !== kid.id ? 0.4 : 1, transition: 'opacity 0.15s, border-color 0.15s' }}
                >
                  <KidThumb kid={kid} size={48} />
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: viewMode === 'all' ? 'center' : 'space-between', gap: 8 }}>
            {viewMode !== 'all' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={viewMode === 'month' ? prevMonth : () => setSelectedYear(y => String(Number(y) - 1))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 15, padding: 4, display: 'flex', flexShrink: 0 }}
                >
                  <Icon name="ti-chevron-left" />
                </button>
                <h2 style={{ fontSize: 15, color: 'var(--accent)', margin: 0, fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {viewMode === 'month' ? monthLabel : selectedYear}
                </h2>
                <button
                  onClick={viewMode === 'month' ? nextMonth : () => { if (canGoNextYear) setSelectedYear(y => String(Number(y) + 1)); }}
                  style={{ background: 'none', border: 'none', cursor: (viewMode === 'month' ? canGoNextMonth : canGoNextYear) ? 'pointer' : 'default', color: (viewMode === 'month' ? canGoNextMonth : canGoNextYear) ? 'var(--text-muted)' : 'transparent', fontSize: 15, padding: 4, display: 'flex', flexShrink: 0 }}
                >
                  <Icon name="ti-chevron-right" />
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button title="Month" style={segTabStyle('month')} onClick={() => setViewMode('month')}><Icon name="ti-calendar" style={{ fontSize: 16 }} /></button>
              <button title="Year" style={segTabStyle('year')} onClick={() => setViewMode('year')}><Icon name="ti-calendar-event" style={{ fontSize: 16 }} /></button>
              <button title="All" style={segTabStyle('all')} onClick={() => setViewMode('all')}><Icon name="ti-layout-list" style={{ fontSize: 16 }} /></button>
            </div>
          </div>

          {momentCount === 0 ? (
            <div className="empty-state">
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Icon name="ti-calendar" style={{ fontSize: 24, color: 'var(--text-muted)' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', margin: 0 }}>{periodEmpty}</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div onClick={() => setRecapFilter(null)} style={{ background: 'var(--accent)', borderRadius: 14, padding: '14px 16px', opacity: recapFilter !== null ? 0.65 : 1, transition: 'opacity 0.15s', cursor: recapFilter !== null ? 'pointer' : 'default' }}>
                  <p style={{ fontSize: 32, fontWeight: 800, color: '#C8993E', margin: 0, lineHeight: 1 }}>{momentCount}</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: '5px 0 0', fontWeight: 600 }}>moment{momentCount !== 1 ? 's' : ''} logged</p>
                </div>
                <div
                  onClick={() => setRecapFilter(f => f === 'milestones' ? null : 'milestones')}
                  style={{ background: recapFilter === 'milestones' ? '#D4856A' : 'rgba(212,133,106,0.12)', borderRadius: 14, padding: '14px 16px', cursor: milestoneCount > 0 ? 'pointer' : 'default', opacity: recapFilter !== null && recapFilter !== 'milestones' ? 0.65 : 1, transition: 'opacity 0.15s' }}
                >
                  <p style={{ fontSize: 32, fontWeight: 800, color: recapFilter === 'milestones' ? '#fff' : '#D4856A', margin: 0, lineHeight: 1 }}>{milestoneCount}</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: recapFilter === 'milestones' ? 'rgba(255,255,255,0.75)' : '#D4856A', margin: '5px 0 0' }}>milestones</p>
                </div>
                <div
                  onClick={() => setRecapFilter(f => f === 'photos' ? null : 'photos')}
                  style={{ background: recapFilter === 'photos' ? '#A09080' : 'rgba(160,144,128,0.16)', borderRadius: 14, padding: '14px 16px', cursor: photoCount > 0 ? 'pointer' : 'default', opacity: recapFilter !== null && recapFilter !== 'photos' ? 0.65 : 1, transition: 'opacity 0.15s' }}
                >
                  <p style={{ fontSize: 32, fontWeight: 800, color: recapFilter === 'photos' ? '#fff' : '#A09080', margin: 0, lineHeight: 1 }}>{photoCount}</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: recapFilter === 'photos' ? 'rgba(255,255,255,0.75)' : '#A09080', margin: '5px 0 0' }}>photos</p>
                </div>
                <div
                  onClick={() => setRecapFilter(f => f === 'favorites' ? null : 'favorites')}
                  style={{ background: recapFilter === 'favorites' ? '#C8993E' : 'rgba(200,153,62,0.12)', borderRadius: 14, padding: '14px 16px', cursor: favoriteCount > 0 ? 'pointer' : 'default', opacity: recapFilter !== null && recapFilter !== 'favorites' ? 0.65 : 1, transition: 'opacity 0.15s' }}
                >
                  <p style={{ fontSize: 32, fontWeight: 800, color: recapFilter === 'favorites' ? '#fff' : '#C8993E', margin: 0, lineHeight: 1 }}>{favoriteCount}</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: recapFilter === 'favorites' ? 'rgba(255,255,255,0.75)' : '#C8993E', margin: '5px 0 0' }}>favorites</p>
                </div>
              </div>

              {(() => {
                // One grid, filtered — replaces the old split where "photos" got
                // a grid (of individual media items) and everything else got a
                // text list (of entries). Filtering now always narrows the same
                // entry grid, so tapping a stat tile never swaps the whole layout.
                const filterByRecap = (list) => {
                  if (recapFilter === 'milestones') return list.filter(e => e.milestone);
                  if (recapFilter === 'favorites') return list.filter(e => e.favorited);
                  if (recapFilter === 'photos') return list.filter(e => e.media?.length > 0);
                  return list;
                };
                const nothingHere = <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>Nothing here yet.</p>;

                if (viewMode === 'month') {
                  const filtered = filterByRecap(monthEntries);
                  return filtered.length === 0 ? nothingHere : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      {filtered.map(e => <RecapGridCell key={e.id} entry={e} onOpenEntry={onOpenEntry} />)}
                    </div>
                  );
                }
                const groups = (viewMode === 'year' ? yearGroups : allGroups)
                  .map(group => ({ ...group, entries: filterByRecap(group.entries) }))
                  .filter(group => group.entries.length > 0);
                return groups.length === 0 ? nothingHere : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {groups.map(group => (
                      <div key={group.label} style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.4, textTransform: 'uppercase' }}>{group.label}</span>
                          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                          <span style={{ fontSize: 11, color: 'var(--border-light)', fontWeight: 600 }}>{group.entries.length}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                          {group.entries.map(e => <RecapGridCell key={e.id} entry={e} onOpenEntry={onOpenEntry} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </>
          )}
          </>
          )}

        </div>
      </div>
    </div>
  );
}

export default RecapScreen;
