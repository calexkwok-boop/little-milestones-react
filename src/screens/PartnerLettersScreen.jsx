import { useState, useEffect, useRef, useMemo } from 'react';
import { Icon } from '../icons';
import SectionSwitcher from '../SectionSwitcher.jsx';
import KidChip, { AuthorChip } from '../KidChip.jsx';
import JournalEntryRow from '../JournalEntryRow.jsx';
import { milestoneInfo } from '../constants.js';

function PartnerLettersScreen({ entries, kids, unseenIds, authorId, currentUserId, self, partner, onBack, onOpenEntry, onMarkAllRead, scrollPos, onSwitchSection }) {
  const scrollRef = useRef(null);
  const [activeAuthorId, setActiveAuthorId] = useState(authorId);
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
    () => (isSelf || showAll) ? [] : entries.filter(e => unseenIds.includes(e.id)).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [entries, unseenIds, isSelf, showAll]
  );
  const earlierEntriesAll = useMemo(
    () => entries
      .filter(e => showAll ? true : (activeAuthorId && e.authorId === activeAuthorId && (isSelf || !unseenIds.includes(e.id))))
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [entries, activeAuthorId, unseenIds, isSelf, showAll]
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
                tabs={[{ id: 'recap', label: 'Recap', icon: 'ti-sparkles' }, { id: 'partner-letters', label: 'All letters', icon: 'ti-mail' }, { id: 'compare', label: 'At the same age', icon: 'ti-arrows-diff' }, { id: 'reels', label: 'Reels', icon: 'ti-player-play' }]}
                active="partner-letters"
                onChange={onSwitchSection}
              />
            </div>
          </div>

          {partner && (
            <div className="scrollx">
              <KidChip active={showAll} onClick={() => setActiveAuthorId(null)} icon="ti-layout-list" label="All" />
              {self && <AuthorChip member={self} active={isSelf} onClick={() => setActiveAuthorId(currentUserId)} />}
              <AuthorChip member={partner} active={!showAll && !isSelf} onClick={() => setActiveAuthorId(partner.user_id)} />
            </div>
          )}

          {!hasAny && (
            <div className="empty-state">
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Icon name="ti-mail" style={{ fontSize: 24, color: 'var(--text-muted)' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', margin: '0 0 6px' }}>No letters yet</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>Letters you and your partner write will show up here.</p>
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
