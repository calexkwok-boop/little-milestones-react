import { useState, useEffect, useRef, useMemo } from 'react';
import { Icon } from '../icons';
import { supabase } from '../supabase.js';
import { useSession, useNotif } from '../contexts.js';
import SectionSwitcher from '../SectionSwitcher.jsx';
import FriendAvatar from '../FriendAvatar.jsx';
import triggerPush from '../triggerPush.js';
import {
  KID_ACCENTS, AVATAR_TRANSFORM_SM, VIDEO_DELIVERY_TRANSFORM, getAuthRedirectUrl,
  cloudinaryTransform, videoThumbUrl, entryBgStyle, exactAgeLabel, timeAgo, daysUntilBirthday, PHOTO_SQUARE,
} from '../constants.js';

function FriendsScreen({ friends, friendKids, friendEntries = [], familyMemberIds = [], familyMembers = [], onBack, onSearch, onSendRequest, onInviteFriend, onRespond, onUnfriend, onOpenFriendEntry, onFriendBirthdayClick, socialName, friendUserFamilyMap = {}, onSwitchSection, onOpenNotificationHistory }) {
  const { reactionNotifications = [], birthdayNotifications = [], friendRequests = [], onClearReactions, onDismissReaction, onDismissBirthday } = useNotif() ?? {};
  const { userId: currentUserId, session } = useSession() ?? {};
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef(null);
  const [sentIds, setSentIds] = useState(new Set());
  const [inviting, setInviting] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [selectedFriendUid, setSelectedFriendUid] = useState(null);
  const [friendViewer, setFriendViewer] = useState(null);
  const [viewerLikes, setViewerLikes] = useState([]);
  const [viewerComments, setViewerComments] = useState([]);
  const [viewerCommentText, setViewerCommentText] = useState('');
  const [showLikeAnim, setShowLikeAnim] = useState(false);
  const lastTapRef = useRef(0);
  const searchTimer = useRef(null);

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  // Merge birthday notifications with the same kid name into one card with combined family names
  const groupedBirthdayNotifs = useMemo(() => {
    const groups = new Map();
    for (const n of birthdayNotifications) {
      const key = n.kidName?.toLowerCase() || n.id;
      if (groups.has(key)) {
        const g = groups.get(key);
        if (n.familyName && !g.familyNames.includes(n.familyName)) g.familyNames.push(n.familyName);
        g.kidIds.push(n.kidId);
        g.ids.push(n.id);
      } else {
        groups.set(key, { ...n, familyNames: n.familyName ? [n.familyName] : [], kidIds: [n.kidId], ids: [n.id] });
      }
    }
    return Array.from(groups.values());
  }, [birthdayNotifications]);

  useEffect(() => {
    if (!friendViewer || !supabase) return;
    const id = friendViewer.entry.id;
    Promise.all([
      supabase.from('entry_likes').select('*').eq('entry_id', id),
      supabase.from('entry_comments').select('*').eq('entry_id', id).is('parent_id', null).order('created_at'),
    ]).then(([{ data: lks }, { data: cms }]) => {
      setViewerLikes(lks || []);
      setViewerComments(cms || []);
    });
  }, [friendViewer]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleViewerLike() {
    if (!supabase || !session || !friendViewer) return;
    const entryId = friendViewer.entry.id;
    const userId = session.user.id;
    const already = viewerLikes.some(l => l.user_id === userId);
    if (already) {
      setViewerLikes(p => p.filter(l => l.user_id !== userId));
      await supabase.from('entry_likes').delete().eq('entry_id', entryId).eq('user_id', userId);
    } else {
      const fake = { entry_id: entryId, user_id: userId, display_name: socialName || '' };
      setViewerLikes(p => [...p, fake]);
      await supabase.from('entry_likes').insert({ entry_id: entryId, user_id: userId, display_name: socialName || '' });
      if (friendViewer.entry.userId) triggerPush({ targetUserId: friendViewer.entry.userId, kind: 'like', entryId, fromName: socialName || '' });
    }
  }

  async function handleViewerComment() {
    if (!supabase || !session || !viewerCommentText.trim() || !friendViewer) return;
    const body = viewerCommentText.trim();
    setViewerCommentText('');
    const { data } = await supabase.from('entry_comments').insert({ entry_id: friendViewer.entry.id, user_id: session.user.id, display_name: socialName || '', body }).select().single();
    if (data) setViewerComments(p => [...p, data]);
    if (friendViewer.entry.userId) triggerPush({ targetUserId: friendViewer.entry.userId, kind: 'comment', entryId: friendViewer.entry.id, fromName: socialName || '', commentPreview: body });
  }

  const pendingIncoming = friendRequests.filter(r => r.addressee_id === currentUserId);
  const pendingOutgoing = friendRequests.filter(r => r.requester_id === currentUserId);

  // Whoever reacted/commented on an entry can be either an actual friend
  // (connected via friend_requests) OR a co-parent in your own family liking
  // something inside your shared journal — those are two entirely separate
  // relationships/tables (family_members has no overlap with friend_requests),
  // so both need to be folded in here or a family member's reaction silently
  // has no avatar/name to resolve to (same root cause as the earlier bug
  // where a co-parent's real name didn't show on the family profile card —
  // see [[project_rls_profiles_families]] — just resurfacing in a new spot).
  const friendAvatarMap = useMemo(() => {
    const map = {};
    friends.forEach(fr => {
      const isReq = fr.requester_id === currentUserId;
      const id = isReq ? fr.addressee_id : fr.requester_id;
      map[id] = isReq ? fr.addressee_avatar_url : fr.requester_avatar_url;
    });
    familyMembers.forEach(m => { if (m.user_id) map[m.user_id] = m.avatar_url; });
    return map;
  }, [friends, familyMembers, currentUserId]);

  // Notifications backfilled from notification_log (anything that arrived
  // while this session wasn't open to catch the realtime event) never had a
  // name to attach — the log only stores the pre-built body text, not who
  // sent it by name. Resolving it here means the avatar can fall back to an
  // initial instead of a bare "?" even when the photo itself fails to load.
  const friendNameMap = useMemo(() => {
    const map = {};
    friends.forEach(fr => {
      const isReq = fr.requester_id === currentUserId;
      const id = isReq ? fr.addressee_id : fr.requester_id;
      map[id] = isReq ? fr.addressee_display_name : fr.requester_display_name;
    });
    familyMembers.forEach(m => { if (m.user_id) map[m.user_id] = m.real_name || m.display_name; });
    return map;
  }, [friends, familyMembers, currentUserId]);

  function handleQueryChange(val) {
    setSearchQuery(val);
    clearTimeout(searchTimer.current);
    if (!val.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const results = await onSearch(val);
      setSearchResults(results);
      setSearching(false);
    }, 400);
  }

  function friendUserId(fr) {
    return fr.requester_id === currentUserId ? fr.addressee_id : fr.requester_id;
  }
  function friendDisplayName(fr) {
    return fr.requester_id === currentUserId ? fr.addressee_display_name : fr.requester_display_name;
  }

  async function handleInvite() {
    if (!onInviteFriend || inviting) return;
    setInviting(true);
    const code = await onInviteFriend();
    setInviting(false);
    if (!code) return;
    const link = `${getAuthRedirectUrl()}/?invite=${code}`;
    const shareData = {
      title: 'Join me on Patina',
      text: `I've been writing letters to my kids on Patina, and it seemed like something you and your family might enjoy. Join me?`,
      url: link,
    };
    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      try { await navigator.share(shareData); return; } catch (_) { /* user cancelled */ return; }
    }
    try {
      await navigator.clipboard.writeText(link);
      setInviteLinkCopied(true);
      setTimeout(() => setInviteLinkCopied(false), 2000);
    } catch (_) {}
  }

  return (
    <div className="screen" style={{ position: 'relative' }}>
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button className="icon-btn" onClick={onBack}><Icon name="ti-arrow-left" /></button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 28, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 5px' }} />
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Friends</h2>
              </div>
              <button className="icon-btn" onClick={() => { if (showSearch) { setSearchQuery(''); setSearchResults([]); } setShowSearch(s => !s); }}>
                <Icon name={showSearch ? 'ti-x' : 'ti-search'} />
              </button>
            </div>

            <div>
              <SectionSwitcher
                tabs={[{ id: 'circle-feed', label: 'Glimpse', icon: 'ti-eye' }, { id: 'friends', label: 'Activity', icon: 'ti-activity' }]}
                active="friends"
                onChange={onSwitchSection}
                fill
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div style={{ background: 'var(--accent)', borderRadius: 14, padding: '14px 12px' }}>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#C8993E', margin: 0, lineHeight: 1 }}>{friends.length}</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: '5px 0 0', fontWeight: 600 }}>friend{friends.length !== 1 ? 's' : ''}</p>
            </div>
            <div style={{ background: pendingIncoming.length > 0 ? 'var(--coral)' : 'rgba(var(--coral-rgb),0.12)', borderRadius: 14, padding: '14px 12px' }}>
              <p style={{ fontSize: 28, fontWeight: 800, color: pendingIncoming.length > 0 ? '#fff' : 'var(--coral)', margin: 0, lineHeight: 1 }}>{pendingIncoming.length}</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: pendingIncoming.length > 0 ? 'rgba(255,255,255,0.75)' : 'var(--coral)', margin: '5px 0 0' }}>requests</p>
            </div>
            <div style={{ background: (reactionNotifications.length + birthdayNotifications.length) > 0 ? '#C8993E' : 'rgba(200,153,62,0.12)', borderRadius: 14, padding: '14px 12px' }}>
              <p style={{ fontSize: 28, fontWeight: 800, color: (reactionNotifications.length + birthdayNotifications.length) > 0 ? '#fff' : '#C8993E', margin: 0, lineHeight: 1 }}>{reactionNotifications.length + birthdayNotifications.length}</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: (reactionNotifications.length + birthdayNotifications.length) > 0 ? 'rgba(255,255,255,0.75)' : '#C8993E', margin: '5px 0 0' }}>new activity</p>
            </div>
          </div>

          <button onClick={handleInvite} disabled={inviting} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, cursor: inviting ? 'default' : 'pointer', fontFamily: "'Urbanist', sans-serif", opacity: inviting ? 0.75 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(var(--accent-rgb),0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="ti-user-plus" style={{ fontSize: 16, color: 'var(--accent)' }} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{inviting ? 'Generating invite…' : inviteLinkCopied ? 'Link copied!' : 'Invite a friend'}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>Growing alone, but walking together</p>
              </div>
            </div>
            <Icon name="ti-chevron-right" style={{ fontSize: 14, color: 'var(--text-muted)', flexShrink: 0 }} />
          </button>

          {showSearch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <Icon name="ti-search" style={{ color: 'var(--text-muted)', fontSize: 16 }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search by name…"
                value={searchQuery}
                onChange={e => handleQueryChange(e.target.value)}
                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 16, background: 'transparent', color: 'var(--text)', fontFamily: 'Inter, sans-serif' }}
              />
              {searching && <Icon name="ti-loader-2" style={{ fontSize: 14, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}
              {searchQuery && !searching && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                  <Icon name="ti-x" style={{ fontSize: 14 }} />
                </button>
              )}
            </div>
          )}

          {searchResults.length > 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {searchResults.map((user, idx) => {
                const isFriend = friends.some(f => friendUserId(f) === user.id);
                const isPending = pendingOutgoing.some(r => r.addressee_id === user.id) || sentIds.has(user.id);
                const isFamily = familyMemberIds.includes(user.id);
                return (
                  <div key={user.id} style={{ padding: '12px 16px', borderBottom: idx < searchResults.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <FriendAvatar name={user.display_name} avatarUrl={user.avatar_url} />
                      <p style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{user.display_name || 'User'}</p>
                      {isFamily ? (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Family</span>
                      ) : isFriend ? (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Friends</span>
                      ) : isPending ? (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sent</span>
                      ) : (
                        <button
                          style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                          onClick={async () => {
                            const { error } = await onSendRequest(user.id, user.display_name, user.avatar_url);
                            if (!error) setSentIds(prev => new Set([...prev, user.id]));
                          }}
                        >
                          Add
                        </button>
                      )}
                    </div>
                    {user.kid_names?.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, paddingLeft: 44 }}>
                        {user.kid_names.map((name, i) => (
                          <span key={i} style={{ fontSize: 11, color: 'var(--text-2)', background: 'var(--bg-elevated)', borderRadius: 999, padding: '3px 10px' }}>
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {searchQuery && !searching && searchResults.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>No users found</p>
          )}

          {(reactionNotifications.length > 0 || birthdayNotifications.length > 0) && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Activity</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                {(reactionNotifications.length > 0 || birthdayNotifications.length > 0) && <button onClick={() => { onClearReactions?.(); birthdayNotifications.forEach(n => onDismissBirthday?.(n.id)); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: 0 }}>Mark all as read</button>}
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                {groupedBirthdayNotifs.map((n, idx) => {
                  const kid = friendKids.find(k => k.id === n.kidId) || { id: n.kidId, name: n.kidName, birthdate: n.birthdate };
                  const isToday = n.ts ? new Date(n.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) === new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : false;
                  const familyLabel = n.familyNames.length > 1
                    ? n.familyNames.slice(0, -1).join(', ') + ' and ' + n.familyNames.slice(-1) + "'s family"
                    : n.familyNames[0] ? `${n.familyNames[0]}'s family` : null;
                  return (
                    <div key={n.id} onClick={() => { n.ids.forEach(id => onDismissBirthday?.(id)); onFriendBirthdayClick?.(kid); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: (idx < groupedBirthdayNotifs.length - 1 || reactionNotifications.length > 0) ? '1px solid var(--border)' : 'none', cursor: 'pointer', background: 'rgba(var(--accent-rgb),0.08)' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(var(--accent-rgb),0.15)', border: '1px solid rgba(var(--accent-rgb),0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="ti-cake" style={{ fontSize: 16, color: 'var(--accent)' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
                          <strong>{n.kidName}</strong> turned {n.age} {isToday ? 'today' : n.ts ? 'on ' + new Date(n.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'recently'}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                          {familyLabel ? `${familyLabel} · ` : ''}{n.ts ? timeAgo(n.ts) : 'Recently'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(200,153,62,0.12)', border: '1px solid rgba(200,153,62,0.3)', borderRadius: '50%', width: 28, height: 28, flexShrink: 0 }}>
                        <Icon name="ti-player-play-filled" style={{ fontSize: 11, color: '#C8993E' }} />
                      </div>
                    </div>
                  );
                })}
                {reactionNotifications.map((n, idx) => (
                  <div key={n.id} onClick={() => {
                    if (onDismissReaction) onDismissReaction(n.id);
                    if (onOpenFriendEntry) onOpenFriendEntry(n.entryId);
                  }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: idx < reactionNotifications.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <FriendAvatar name={n.fromName || friendNameMap[n.fromUserId]} avatarUrl={friendAvatarMap[n.fromUserId]} size={36} />
                      <span style={{ position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: '50%', background: n.type === 'like' ? '#E05C6A' : n.type === 'reply' ? '#7A6A8A' : 'var(--accent)', border: '1.5px solid var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={n.type === 'like' ? 'ti-heart-filled' : n.type === 'reply' ? 'ti-arrow-back-up' : 'ti-message-circle'} style={{ fontSize: 8, color: '#fff' }} />
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
                        {n.fromLog ? (
                          // Backfilled from notification_log — body is already the
                          // fully-formatted text built server-side (buildPayload),
                          // not separate fromName/kidNames fields to reconstruct from.
                          n.body
                        ) : (
                          <>
                            <strong>{n.fromName}</strong>
                            {n.type === 'like' ? ` liked ${n.kidNames}'s photo` : n.type === 'reply' ? ` replied to your comment` : ` commented on ${n.kidNames}'s photo`}
                          </>
                        )}
                      </p>
                      {!n.fromLog && (n.type === 'comment' || n.type === 'reply') && n.body && (
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-2)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>&ldquo;{n.body}&rdquo;</p>
                      )}
                      {n.ts && <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(n.ts)}</p>}
                    </div>
                    <Icon name="ti-chevron-right" style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }} />
                  </div>
                ))}
              </div>
              {onOpenNotificationHistory && (
                <button onClick={onOpenNotificationHistory} style={{ display: 'block', width: '100%', textAlign: 'center', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 500, padding: '10px 0 0' }}>
                  View full history
                </button>
              )}
            </div>
          )}

          {pendingIncoming.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Friend Requests</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 11, color: 'var(--border-light)', fontWeight: 600 }}>{pendingIncoming.length}</span>
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                {pendingIncoming.map((req, idx) => (
                  <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: idx < pendingIncoming.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <FriendAvatar name={req.requester_display_name} avatarUrl={req.requester_avatar_url} />
                    <p style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{req.requester_display_name || 'User'}</p>
                    <button onClick={() => onRespond(req.id, true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Accept</button>
                    <button onClick={() => onRespond(req.id, false)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Decline</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {friends.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>My Friends</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 11, color: 'var(--border-light)', fontWeight: 600 }}>{friends.length}</span>
              </div>
              {friends.map(fr => {
                const uid = friendUserId(fr);
                const name = friendDisplayName(fr);
                const avatar = fr.requester_id === currentUserId ? fr.addressee_avatar_url : fr.requester_avatar_url;
                const friendFamilyId = friendUserFamilyMap[uid];
                const theirKids = friendKids.filter(k => friendFamilyId ? k.familyId === friendFamilyId : k.userId === uid);
                const kidsBirthdayToday = theirKids.filter(k => k.birthdate && daysUntilBirthday(k.birthdate) === 0);
                return (
                  <div key={fr.id} onClick={() => setSelectedFriendUid(uid)} style={{ background: 'var(--bg-card)', border: kidsBirthdayToday.length > 0 ? '1px solid rgba(200,153,62,0.4)' : '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 10, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: theirKids.length > 0 ? 10 : 0 }}>
                      <FriendAvatar name={name} avatarUrl={avatar} />
                      <p style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{name || 'Friend'}</p>
                      <Icon name="ti-chevron-right" style={{ fontSize: 14, color: 'var(--text-muted)' }} />
                    </div>
                    {theirKids.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {theirKids.map(k => {
                          const isBirthday = k.birthdate && daysUntilBirthday(k.birthdate) === 0;
                          return (
                            <span key={k.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: isBirthday ? '#C8993E' : 'var(--text-2)', fontWeight: isBirthday ? 700 : 400, background: isBirthday ? 'rgba(200,153,62,0.15)' : 'var(--bg-elevated)', border: isBirthday ? '1px solid rgba(200,153,62,0.35)' : 'none', borderRadius: 999, padding: '3px 10px 3px 4px' }}>
                              <span style={{ width: 20, height: 20, borderRadius: '50%', background: k.accent || KID_ACCENTS[0], overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {k.avatar
                                  ? <img src={cloudinaryTransform(k.avatar, AVATAR_TRANSFORM_SM)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" />
                                  : <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{k.name?.[0]?.toUpperCase()}</span>}
                              </span>
                              {k.name}
                              {isBirthday && <Icon name="ti-cake" style={{ fontSize: 11 }} />}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {friends.length === 0 && pendingIncoming.length === 0 && reactionNotifications.length === 0 && birthdayNotifications.length === 0 && !searchQuery && (
            <div className="empty-state">
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Icon name="ti-users" style={{ fontSize: 24, color: 'var(--text-muted)' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', margin: '0 0 6px' }}>No friends yet</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>We believe that your personal letters should stay between you and your family. Friends will only see your photos and a little context, nothing more.</p>
            </div>
          )}
        </div>
      </div>

      {selectedFriendUid && (() => {
        const fr = friends.find(f => friendUserId(f) === selectedFriendUid);
        if (!fr) return null;
        const name = friendDisplayName(fr);
        const avatar = fr.requester_id === currentUserId ? fr.addressee_avatar_url : fr.requester_avatar_url;
        const selectedFamilyId = friendUserFamilyMap[selectedFriendUid];
        const theirKids = friendKids.filter(k => selectedFamilyId ? k.familyId === selectedFamilyId : k.userId === selectedFriendUid);
        const theirKidIds = new Set(theirKids.map(k => k.id));
        const theirEntries = selectedFamilyId
          ? friendEntries.filter(e => e.media?.length > 0 && e.familyId === selectedFamilyId)
          : friendEntries.filter(e => e.media?.length > 0 && e.kids.some(kid => theirKidIds.has(kid)));
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.4)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }} onClick={() => setSelectedFriendUid(null)}>
            <div className="quick-sheet" style={{ background: 'var(--bg)', borderRadius: '24px 24px 0 0', width: '100%', maxHeight: '88%', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', margin: '12px auto 4px' }} />

              <div style={{ padding: '16px 20px 14px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid var(--border)' }}>
                <FriendAvatar name={name} avatarUrl={avatar} size={54} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: '0 0 5px' }}>{name || 'Friend'}</p>
                  {theirKids.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {theirKids.map(k => (
                        <span key={k.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-2)', background: 'var(--bg-elevated)', borderRadius: 999, padding: '3px 10px 3px 4px' }}>
                          <span style={{ width: 20, height: 20, borderRadius: '50%', background: k.accent || KID_ACCENTS[0], overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {k.avatar
                              ? <img src={cloudinaryTransform(k.avatar, AVATAR_TRANSFORM_SM)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" loading="lazy" />
                              : <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{k.name?.[0]?.toUpperCase()}</span>}
                          </span>
                          {k.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => { setSelectedFriendUid(null); onUnfriend(fr.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: 0, flexShrink: 0 }}>Remove</button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {theirEntries.length === 0 ? (
                  <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                    <Icon name="ti-camera-off" style={{ fontSize: 28, color: 'var(--border)', display: 'block', marginBottom: 10 }} />
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No shared photos yet</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, padding: 2 }}>
                    {theirEntries.map(e => {
                      const m = e.media[0];
                      const isVideo = m.type === 'video';
                      const thumbSrc = isVideo
                        ? videoThumbUrl(m.url, `so_0,${PHOTO_SQUARE}`)
                        : cloudinaryTransform(m.url, PHOTO_SQUARE);
                      return (
                        <div key={e.id} style={{ aspectRatio: '1', overflow: 'hidden', cursor: 'pointer', position: 'relative', background: 'var(--bg-elevated)' }}
                          onClick={() => { const entryKids = theirKids.filter(k => (e.kids || []).includes(k.id)); setFriendViewer({ entry: e, entryKids: entryKids.length ? entryKids : theirKids, friendName: name, friendAvatar: avatar }); }}>
                          <img src={thumbSrc} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" loading="lazy" />
                          {isVideo && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Icon name="ti-player-play-filled" style={{ color: '#fff', fontSize: 12 }} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {friendViewer && (() => {
        const { entry, entryKids, friendName, friendAvatar } = friendViewer;
        const bgStyle = entryBgStyle(entry);
        const kidLabel = entryKids.map(k => k.name).join(' & ');
        const age = entryKids[0]?.birthdate ? exactAgeLabel(entryKids[0].birthdate, entry.date) : null;
        const entryDate = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const userHasLiked = viewerLikes.some(l => l.user_id === session?.user?.id);
        return (
          <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 12px', flexShrink: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>
                {friendAvatar ? <img src={cloudinaryTransform(friendAvatar, AVATAR_TRANSFORM_SM)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" /> : friendName?.charAt(0) || '?'}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{friendName || 'Friend'}</p>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>{entryDate}</p>
              </div>
              <button onClick={() => { setFriendViewer(null); setViewerLikes([]); setViewerComments([]); }} style={{ background: 'var(--bg-elevated)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-2)', fontSize: 14, flexShrink: 0 }}>
                <Icon name="ti-x" />
              </button>
            </div>
            {/* Photo */}
            <div onClick={() => { const now = Date.now(); if (now - lastTapRef.current < 320) { handleViewerLike(); setShowLikeAnim(true); setTimeout(() => setShowLikeAnim(false), 800); } lastTapRef.current = now; }} style={{ width: '100%', aspectRatio: '4/3', flexShrink: 0, ...bgStyle, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', cursor: 'pointer' }}>
              {entry.media?.[0]?.type === 'video' && <video src={cloudinaryTransform(entry.media[0].url, VIDEO_DELIVERY_TRANSFORM)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} controls playsInline onClick={e => e.stopPropagation()} />}
              {showLikeAnim && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}><Icon name="ti-heart-filled" style={{ fontSize: 80, color: '#fff', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))', animation: 'likeHeartPop 0.8s ease forwards' }} /></div>}
            </div>
            {/* Kid + like */}
            <div style={{ padding: '12px 16px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, borderBottom: viewerComments.length > 0 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 1px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{kidLabel}</p>
                {age && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>{age}</p>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                <button onClick={handleViewerLike} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: userHasLiked ? '#E05C6A' : 'var(--text-3)', padding: 0 }}>
                  <Icon name={userHasLiked ? 'ti-heart-filled' : 'ti-heart'} style={{ fontSize: 22 }} />
                  {viewerLikes.length > 0 && <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>{viewerLikes.length}</span>}
                </button>
                {viewerLikes.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Inter, sans-serif' }}>
                    {viewerLikes.length >= 3
                      ? `${viewerLikes.length} likes`
                      : viewerLikes.length === 2
                        ? viewerLikes.map(l => l.display_name?.split(' ')[0] || 'Someone').join(' & ')
                        : viewerLikes[0]?.display_name || 'Someone'}
                  </span>
                )}
              </div>
            </div>
            {/* Comments */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '8px 16px' }}>
              {viewerComments.map(c => (
                <div key={c.id} style={{ marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>{c.user_id === session?.user?.id ? (socialName || c.display_name) : (c.display_name || 'Someone')}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{c.body}</span>
                  </div>
                  {c.user_id === session?.user?.id && (
                    <button onClick={async () => { setViewerComments(p => p.filter(x => x.id !== c.id)); await supabase.from('entry_comments').delete().eq('id', c.id).eq('user_id', session.user.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '1px 0', flexShrink: 0 }}>
                      <Icon name="ti-trash" style={{ fontSize: 13 }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {/* Comment input */}
            <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <input value={viewerCommentText} onChange={e => setViewerCommentText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleViewerComment()} placeholder="Add a comment…" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--text)', fontFamily: "'Urbanist', sans-serif" }} />
              {viewerCommentText.trim() && <button onClick={handleViewerComment} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif" }}>Post</button>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default FriendsScreen;
