import { useState, useEffect, useRef, useMemo } from 'react';
import { Icon } from '../icons';
import SectionSwitcher from '../SectionSwitcher.jsx';
import JournalEntryRow from '../JournalEntryRow.jsx';
import { milestoneInfo, cloudinaryTransform, AVATAR_TRANSFORM_SM } from '../constants.js';

// Circular avatar filter, styled to match RecapScreen's kid-filter circles /
// Home's HomeKidFilter — "All" swaps to a solid fill since it has no photo,
// self/partner get an avatar + accent ring instead, dimming when someone
// else is the active filter.
function AuthorCircle({ selected, dimmed, onClick, avatarUrl, name }) {
  return (
    <button
      onClick={onClick}
      style={{ position: 'relative', width: 48, height: 48, borderRadius: '50%', border: selected ? '2.5px solid var(--accent)' : '2px solid transparent', padding: 0, cursor: 'pointer', flexShrink: 0, opacity: dimmed ? 0.4 : 1, transition: 'opacity 0.15s, border-color 0.15s' }}
    >
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
        {avatarUrl
          ? <img src={cloudinaryTransform(avatarUrl, AVATAR_TRANSFORM_SM)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" />
          : name?.charAt(0)?.toUpperCase() || '?'}
      </div>
    </button>
  );
}

function PartnerLettersScreen({ entries, kids, unseenIds, authorId, currentUserId, self, partner, onBack, onOpenEntry, onMarkAllRead, scrollPos, onSwitchSection }) {
  const scrollRef = useRef(null);
  const [activeAuthorId, setActiveAuthorId] = useState(authorId);
  // Independent of the author circles -- composes with whichever author is
  // selected (e.g. "Pearl" + star = just Pearl's milestone letters) rather
  // than being another exclusive option in that same row.
  const [starOnly, setStarOnly] = useState(false);
  const isSelf = activeAuthorId != null && currentUserId && activeAuthorId === currentUserId;
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  function matchesQuery(e) {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    if (q === 'note' || q === 'notes') return e.type === 'note' && !e.prompt;
    if (q === 'prompt' || q === 'prompts') return e.type === 'note' && !!e.prompt;
    const m = e.milestone ? milestoneInfo(e.milestone) : null;
    const entryKids = (e.kids || []).map(id => kids.find(k => k.id === id)).filter(Boolean);
    return (e.text || '').toLowerCase().includes(q)
      || (e.prompt || '').toLowerCase().includes(q)
      || (m && m.label.toLowerCase().includes(q))
      || entryKids.some(k => k.name.toLowerCase().includes(q))
      || e.location?.toLowerCase().includes(q)
      || (e.people || []).some(p => p.toLowerCase().includes(q));
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !scrollPos) return;
    requestAnimationFrame(() => { el.scrollTop = scrollPos.current; });
  }, []);

  function handleOpenEntry(entry) {
    if (scrollRef.current && scrollPos) scrollPos.current = scrollRef.current.scrollTop;
    onOpenEntry(entry);
  }
  const showAll = activeAuthorId === null;
  const partnerName = partner?.real_name || partner?.display_name || 'Partner';
  const unseenEntriesAll = useMemo(
    () => (isSelf || showAll) ? [] : entries.filter(e => unseenIds.includes(e.id) && (!starOnly || !!e.milestone)).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [entries, unseenIds, isSelf, showAll, starOnly]
  );
  const earlierEntriesAll = useMemo(
    () => entries
      .filter(e => showAll ? true : (activeAuthorId && e.authorId === activeAuthorId && (isSelf || !unseenIds.includes(e.id))))
      .filter(e => !starOnly || !!e.milestone)
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [entries, activeAuthorId, unseenIds, isSelf, showAll, starOnly]
  );
  const unseenEntries = useMemo(() => unseenEntriesAll.filter(matchesQuery), [unseenEntriesAll, query, kids]);
  const earlierEntries = useMemo(() => earlierEntriesAll.filter(matchesQuery), [earlierEntriesAll, query, kids]);
  const hasAny = unseenEntriesAll.length > 0 || earlierEntriesAll.length > 0;
  const hasMatches = unseenEntries.length > 0 || earlierEntries.length > 0;

  return (
    <div className="screen">
      <div className="scroll-area" ref={scrollRef}>
        <div className="scrollpad">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button className="icon-btn" onClick={onBack}><Icon name="ti-arrow-left" /></button>
              <div onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} style={{ textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ width: 28, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 5px' }} />
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Keepsakes</h2>
              </div>
              {hasAny ? (
                <button className="icon-btn" onClick={() => { if (showSearch) setQuery(''); setShowSearch(s => !s); }}>
                  <Icon name={showSearch ? 'ti-x' : 'ti-search'} />
                </button>
              ) : <div style={{ width: 36 }} />}
            </div>

            <div>
              <SectionSwitcher
                tabs={[{ id: 'recap', label: 'Recap', icon: 'ti-sparkles' }, { id: 'partner-letters', label: 'Letters', icon: 'ti-mail' }, { id: 'compare', label: 'Same age', icon: 'ti-arrows-diff' }, { id: 'reels', label: 'Reels', icon: 'ti-player-play' }]}
                active="partner-letters"
                onChange={onSwitchSection}
                fill
              />
            </div>
          </div>

          {partner && (
            <div className="scrollx" style={{ gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => setActiveAuthorId(null)}
                style={{ width: 48, height: 48, borderRadius: '50%', border: showAll ? '2.5px solid var(--accent)' : '2px solid var(--border)', background: showAll ? 'var(--accent)' : 'var(--bg-input)', color: showAll ? '#fff' : 'var(--text-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', flexShrink: 0 }}
              >All</button>
              {self && (
                <AuthorCircle
                  selected={isSelf}
                  dimmed={!showAll && !isSelf}
                  onClick={() => setActiveAuthorId(currentUserId)}
                  avatarUrl={self.avatar_url}
                  name={self.real_name || self.display_name}
                />
              )}
              <AuthorCircle
                selected={!showAll && !isSelf}
                dimmed={!showAll ? isSelf : false}
                onClick={() => setActiveAuthorId(partner.user_id)}
                avatarUrl={partner.avatar_url}
                name={partnerName}
              />
              {/* Not another author to filter by -- toggles on top of
                  whichever author is already selected, so "Pearl" + star
                  narrows to just Pearl's milestone letters. Gold rather than
                  the author circles' accent green, matching how milestones
                  are marked everywhere else (Trips pins, the milestone
                  reveal card on Home). */}
              <button
                onClick={() => setStarOnly(s => !s)}
                aria-label="Milestones only"
                style={{
                  width: 48, height: 48, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                  border: starOnly ? '2.5px solid #C8993E' : '2px solid var(--border)',
                  background: starOnly ? '#C8993E' : 'var(--bg-input)',
                  color: starOnly ? '#fff' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Icon name={starOnly ? 'ti-star-filled' : 'ti-star'} style={{ fontSize: 18 }} />
              </button>
            </div>
          )}

          {!hasAny && (
            <div className="empty-state">
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Icon name={starOnly ? 'ti-star' : 'ti-mail'} style={{ fontSize: 24, color: 'var(--text-muted)' }} />
              </div>
              {starOnly ? (
                <>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', margin: '0 0 6px' }}>No milestone letters yet</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>Tag a letter with a milestone when you write it, and it'll show up here.</p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', margin: '0 0 6px' }}>No letters yet</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>Letters you and your partner write will show up here.</p>
                </>
              )}
            </div>
          )}

          {hasAny && showSearch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px' }}>
              <Icon name="ti-search" style={{ color: 'var(--text-muted)' }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search these letters..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 15, background: 'transparent', color: 'var(--accent)', fontFamily: 'Inter, sans-serif' }}
              />
              {query && (
                <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                  <Icon name="ti-x" style={{ fontSize: 14 }} />
                </button>
              )}
            </div>
          )}

          {hasAny && !hasMatches && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>No letters match "{query}"</p>
          )}

          {unseenEntries.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', margin: 0 }}>New</p>
                <button onClick={onMarkAllRead} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: 0 }}>
                  Mark all as read
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {unseenEntries.map(e => {
                  const entryKids = (e.kids || []).map(id => kids.find(k => k.id === id)).filter(Boolean);
                  return <JournalEntryRow key={e.id} entry={e} entryKids={entryKids} onOpen={handleOpenEntry} />;
                })}
              </div>
            </>
          )}

          {earlierEntries.length > 0 && (
            <>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', margin: 0 }}>
                {unseenEntries.length > 0 ? 'Earlier' : query.trim() ? `${earlierEntries.length} letter${earlierEntries.length === 1 ? '' : 's'} found` : `All ${earlierEntries.length} letter${earlierEntries.length === 1 ? '' : 's'}`}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {earlierEntries.map(e => {
                  const entryKids = (e.kids || []).map(id => kids.find(k => k.id === id)).filter(Boolean);
                  return <JournalEntryRow key={e.id} entry={e} entryKids={entryKids} onOpen={handleOpenEntry} />;
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PartnerLettersScreen;
