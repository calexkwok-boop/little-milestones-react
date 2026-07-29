import { useState, useEffect, useRef } from 'react';
import { Icon } from '../icons';
import { supabase } from '../supabase.js';
import AvatarCropModal from '../AvatarCropModal.jsx';
import KidThumb from '../KidThumb.jsx';
import { Coachmark } from '../Coachmark.jsx';
import usePushNotifications from '../usePushNotifications.js';
import { cloudinaryTransform, AVATAR_TRANSFORM_LG, AVATAR_TRANSFORM_SM } from '../constants.js';

const NOTIFICATION_PREF_KEYS = ['birthday_reminders', 'friend_activity', 'partner_activity', 'prompt_nudges'];
const NOTIFICATION_PREF_DEFAULTS = { birthday_reminders: true, friend_activity: true, partner_activity: true, prompt_nudges: true };

// Per-category push mute state. No row in the DB means "everything on" —
// a row is only written once the user actually flips a toggle.
function useNotificationPreferences(currentUserId) {
  const [prefs, setPrefs] = useState(NOTIFICATION_PREF_DEFAULTS);

  useEffect(() => {
    if (!supabase || !currentUserId) return;
    let cancelled = false;
    supabase.from('notification_preferences').select(NOTIFICATION_PREF_KEYS.join(',')).eq('user_id', currentUserId).maybeSingle()
      .then(({ data }) => { if (!cancelled && data) setPrefs({ ...NOTIFICATION_PREF_DEFAULTS, ...data }); });
    return () => { cancelled = true; };
  }, [currentUserId]);

  async function setPref(key, value) {
    if (!supabase || !currentUserId) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await supabase.from('notification_preferences').upsert(
      { user_id: currentUserId, ...next, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  }

  return { prefs, setPref };
}

function AvatarImg({ src, alt, fallback }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  if (!src || broken) return fallback;
  return <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setBroken(true)} loading="lazy" />;
}

function ProfileScreen({ kids, entries, onBack, onAvatarUpload, onSignOut, familyMembers, myDisplayName, familyName, onUpdateFamilyName, onInvite, onUpdateDisplayName, onUpdateRealName, onAddKid, onFamilyAvatarUpload, avatarUploading, currentUserId, onRenameKid, onUpdateKidSex, onUpdateKidWishlist, onArchiveKid, onRestoreKid, onEraseKid, onOpenGrowth, patinaJarEntries = [], onOpenPatinaJar, onCreateBook, onDeleteAccount, hasPartner, darkMode, onToggleDarkMode, onSetDarkMode, discoverable, onToggleDiscoverable, onHidePostsFromFriends, onShowPrivacy, onShowTerms, onViewKidMoments, onViewKidMilestones }) {
  const fileInputRef = useRef(null);
  const familyAvatarInputRef = useRef(null);
  const patinaJarBtnRef = useRef(null);
  const [uploadKidId, setUploadKidId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showHidePostsPrompt, setShowHidePostsPrompt] = useState(false);
  const [justEnabledNotifs, setJustEnabledNotifs] = useState(false);
  const [hidingPosts, setHidingPosts] = useState(false);
  const [activeFamilyAvatarId, setActiveFamilyAvatarId] = useState(null);
  const [inviteCode, setInviteCode] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(myDisplayName);
  const [editingRealName, setEditingRealName] = useState(false);
  const [realNameInput, setRealNameInput] = useState('');
  const [editingFamilyName, setEditingFamilyName] = useState(false);
  const [familyNameInput, setFamilyNameInput] = useState('');
  const [editingKid, setEditingKid] = useState(null);
  const [kidNameInput, setKidNameInput] = useState('');
  const [kidSexInput, setKidSexInput] = useState(null);
  const [kidWishlistInput, setKidWishlistInput] = useState('');
  const [removeChoiceKid, setRemoveChoiceKid] = useState(null);
  const [erasingKid, setErasingKid] = useState(null);
  const [eraseNameInput, setEraseNameInput] = useState('');
  const [addingKid, setAddingKid] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBdMonth, setNewBdMonth] = useState('');
  const [newBdDay, setNewBdDay] = useState('');
  const [newBdYear, setNewBdYear] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [newSex, setNewSex] = useState(null);
  const [cropState, setCropState] = useState(null);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [pickerStep, setPickerStep] = useState('type');
  const [pickerRole, setPickerRole] = useState(null);
  const newBirthdate = (newBdMonth && newBdDay && newBdYear && newBdYear.length === 4)
    ? `${newBdYear}-${newBdMonth}-${newBdDay.padStart(2, '0')}` : '';

  const { status: notifStatus, busy: notifBusy, error: notifError, enable: handleEnableNotifications, disable: handleDisableNotifications } = usePushNotifications(currentUserId);
  const { prefs: notifPrefs, setPref: setNotifPref } = useNotificationPreferences(currentUserId);

  async function handleSaveNewKid() {
    if (!newName.trim() || !newBirthdate) return;
    setAddSaving(true);
    await onAddKid({ name: newName.trim(), birthdate: newBirthdate, sex: newSex });
    setAddingKid(false);
    setNewName(''); setNewBdMonth(''); setNewBdDay(''); setNewBdYear(''); setNewSex(null);
    setAddSaving(false);
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file || !uploadKidId) return;
    const kidId = uploadKidId;
    setCropState({
      src: URL.createObjectURL(file),
      onConfirm: blob => onAvatarUpload(kidId, new File([blob], 'avatar.jpg', { type: 'image/jpeg' })),
    });
    setUploadKidId(null);
    e.target.value = '';
  }

  function handleFamilyAvatarFile(e) {
    const file = e.target.files[0];
    if (!file || !activeFamilyAvatarId) return;
    const memberId = activeFamilyAvatarId;
    setCropState({
      src: URL.createObjectURL(file),
      onConfirm: blob => onFamilyAvatarUpload?.(memberId, new File([blob], 'avatar.jpg', { type: 'image/jpeg' })),
    });
    setActiveFamilyAvatarId(null);
    e.target.value = '';
  }

  async function handleInvite() {
    setInviteLoading(true);
    const code = await onInvite();
    setInviteCode(code);
    setInviteLoading(false);
  }

  async function handlePickerInvite(role) {
    setPickerRole(role);
    setPickerStep('invite-code');
    setInviteLoading(true);
    const code = await onInvite();
    setInviteCode(code);
    setInviteLoading(false);
  }

  function handleSaveName() {
    if (nameInput.trim()) onUpdateDisplayName(nameInput.trim());
    setEditingName(false);
  }

  const selfMember = familyMembers?.find(m => m.user_id === currentUserId);
  const otherMembers = familyMembers?.filter(m => m.user_id !== currentUserId) || [];
  const sectionLabel = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '4px 0 8px 2px' };

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><Icon name="ti-arrow-left" /></button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 28, height: 1, background: 'rgba(200,153,62,0.4)', margin: '0 auto 5px' }} />
              <h2
                onClick={onUpdateFamilyName ? () => { setFamilyNameInput(familyName || ''); setEditingFamilyName(true); } : undefined}
                style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, color: 'var(--accent)', margin: 0, fontWeight: 700, cursor: onUpdateFamilyName ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                {familyName || 'Your Family'}
                {onUpdateFamilyName && <Icon name="ti-pencil" style={{ fontSize: 12, color: 'var(--text-muted)' }} />}
              </h2>
            </div>
            <div style={{ width: 36 }} />
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
          <input ref={familyAvatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFamilyAvatarFile} />

          {/* ── Kids ── */}
          {kids.filter(k => !k.archivedAt).map((k, i) => {
            const kEntries = entries.filter(e => e.kids.includes(k.id));
            const kMilestones = kEntries.filter(e => e.milestone).length;
            const bornLabel = (() => { const [y,m,d] = k.birthdate.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); })();
            return (
              <div key={k.id} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 16px 16px', textAlign: 'center' }}>
                <div
                  className="avatar-upload-zone"
                  style={{ width: 84, height: 84, margin: '0 auto 12px', position: 'relative', border: k.avatar ? 'none' : undefined }}
                  onClick={() => { setUploadKidId(k.id); fileInputRef.current?.click(); }}
                  title="Tap to change photo"
                >
                  <AvatarImg src={cloudinaryTransform(k.avatar, AVATAR_TRANSFORM_LG)} alt={k.name} fallback={<Icon name="ti-camera" />} />
                  {avatarUploading && uploadKidId === k.id && (
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(44,56,40,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="ti-loader-2" style={{ fontSize: 22, color: '#fff', animation: 'spin 1s linear infinite' }} />
                    </div>
                  )}
                </div>
                <p
                  style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', margin: '0 0 2px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  onClick={() => { setEditingKid(k); setKidNameInput(k.name); setKidSexInput(k.sex ?? null); setKidWishlistInput(k.wishlistUrl || ''); }}
                >
                  {k.name} <Icon name="ti-pencil" style={{ fontSize: 12, color: 'var(--text-muted)' }} />
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>Born {bornLabel}</p>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <div
                    className="stat-tile"
                    onClick={() => onViewKidMoments?.(k.id)}
                    style={{ cursor: onViewKidMoments ? 'pointer' : undefined, background: 'var(--accent)' }}
                  >
                    <p style={{ fontSize: 18, color: '#C8993E', margin: 0, fontWeight: 700 }}>{kEntries.length}</p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: '3px 0 0', fontWeight: 600 }}>moments</p>
                  </div>
                  <div
                    className="stat-tile"
                    onClick={() => onViewKidMilestones?.(k.id)}
                    style={{ cursor: onViewKidMilestones ? 'pointer' : undefined, background: '#D4856A' }}
                  >
                    <p style={{ fontSize: 18, color: '#fff', margin: 0, fontWeight: 700 }}>{kMilestones}</p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', margin: '3px 0 0', fontWeight: 600 }}>milestones</p>
                  </div>
                </div>
                <button
                  ref={i === 0 ? patinaJarBtnRef : undefined}
                  className="btn btn-outline"
                  style={{ width: '100%', fontSize: 13, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}
                  onClick={() => onOpenPatinaJar?.(k.id)}
                >
                  <span style={{ width: 20, height: 20, borderRadius: '50%', overflow: 'hidden', background: k.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <AvatarImg src={cloudinaryTransform(k.avatar, AVATAR_TRANSFORM_SM)} alt={k.name} fallback={<span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 10, color: '#fff' }}>{k.name[0]}</span>} />
                  </span>
                  Patina Jar
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                    {patinaJarEntries.filter(r => r.kidId === k.id && r.year === new Date().getFullYear()).length}/12
                  </span>
                </button>
                {i === 0 && (
                  <Coachmark
                    id="profile-patina-jar"
                    userId={currentUserId}
                    active={true}
                    targetRef={patinaJarBtnRef}
                    placement="bottom"
                    text="New feature: ask a quick question every month and see how their answers change throughout the years."
                  />
                )}
              </div>
            );
          })}

          {onRestoreKid && kids.some(k => k.archivedAt) && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <p style={{ ...sectionLabel, margin: 0, padding: '12px 16px 0' }}>Archived</p>
              {kids.filter(k => k.archivedAt).map((k, i, arr) => (
                <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <KidThumb kid={k} size={32} />
                  <p style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{k.name}</p>
                  <button
                    onClick={() => onRestoreKid?.(k.id)}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', fontFamily: "'Urbanist', sans-serif" }}
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Parents card ── */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            {[selfMember, ...otherMembers].filter(Boolean).map((m, i, arr) => {
              const isSelf = m.user_id === currentUserId;
              return (
                <div key={m.id || m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div
                    onClick={() => { if (!isSelf) return; setActiveFamilyAvatarId(m.id || m.user_id); familyAvatarInputRef.current?.click(); }}
                    style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: isSelf ? 'pointer' : 'default', flexShrink: 0, position: 'relative' }}
                  >
                    <AvatarImg src={cloudinaryTransform(m.avatar_url, AVATAR_TRANSFORM_LG)} alt={m.display_name} fallback={<Icon name="ti-user" style={{ fontSize: 16, color: 'var(--accent)' }} />} />
                    {avatarUploading && isSelf && <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(44,56,40,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="ti-loader-2" style={{ fontSize: 14, color: '#fff', animation: 'spin 1s linear infinite' }} /></div>}
                  </div>
                  <div
                    style={{ flex: 1, cursor: isSelf ? 'pointer' : 'default' }}
                    onClick={() => { if (!isSelf) return; setNameInput(myDisplayName); setRealNameInput(m.real_name || ''); setEditingName(true); }}
                  >
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {m.real_name || m.display_name}
                      {isSelf && <Icon name="ti-pencil" style={{ fontSize: 11, color: 'var(--text-muted)' }} />}
                    </p>
                    {m.real_name && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '1px 0 0' }}>{m.display_name}</p>}
                  </div>
                </div>
              );
            })}
          </div>

          <button className="btn btn-primary" onClick={() => { setMemberPickerOpen(true); setPickerStep('type'); setPickerRole(null); setInviteCode(null); }}>
            <Icon name="ti-plus" />Add a family member
          </button>

          {/* ── Discoverable ── */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '13px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Discoverable</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{discoverable ? 'A shared journey, just different chapters.' : 'A quiet journey, just your close ones.'}</p>
              </div>
              <div onClick={() => {
                const next = !discoverable;
                onToggleDiscoverable?.(next);
                if (!next) setShowHidePostsPrompt(true);
              }} style={{ width: 44, height: 26, borderRadius: 13, background: discoverable ? 'var(--accent)' : 'var(--border)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 3, left: discoverable ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '10px 0 0', paddingTop: 10, borderTop: '1px solid var(--border)', lineHeight: 1.55 }}>
              Your <strong>letters</strong> are always kept private between you and your family (added via share link).
            </p>
          </div>

          {/* ── Appearance ── */}
          <div>
            <p style={sectionLabel}>Appearance</p>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px' }}>
              <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 10, padding: 3 }}>
                {[['light', 'sun', 'Light'], ['auto', 'clock', 'Auto'], ['dark', 'moon', 'Dark']].map(([mode, icon, label]) => (
                  <button key={mode} onClick={() => onSetDarkMode(mode)} style={{ flex: 1, padding: '8px 4px', border: 'none', borderRadius: 8, background: darkMode === mode ? 'var(--bg-input)' : 'transparent', color: darkMode === mode ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", transition: 'background 0.15s' }}>
                    <Icon name={`ti-${icon}`} style={{ fontSize: 17 }} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Notifications ── */}
          {notifStatus !== 'unsupported' && (
            <div>
              <p style={sectionLabel}>Notifications</p>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
                {notifStatus === 'ios-need-install' ? (
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>Add Patina to your Home Screen</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                      iPhone only delivers notifications to installed apps. Tap the Share icon, then "Add to Home Screen" — then come back here to turn them on.
                    </p>
                  </div>
                ) : notifStatus === 'denied' ? (
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>Notifications are blocked</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                      You've blocked notifications for Patina in your browser. Open your browser or device settings, allow notifications for this site, then come back here.
                    </p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 2px' }}>Push notifications</p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Birthdays, friend activity, and gentle nudges</p>
                      </div>
                      <button
                        onClick={() => { if (notifStatus === 'on') { handleDisableNotifications(); } else { handleEnableNotifications(); setJustEnabledNotifs(true); } }}
                        disabled={notifBusy || notifStatus === 'checking'}
                        style={{ width: 46, height: 27, borderRadius: 999, border: 'none', background: notifStatus === 'on' ? 'var(--accent)' : 'var(--border)', position: 'relative', cursor: 'pointer', flexShrink: 0, opacity: notifBusy ? 0.6 : 1 }}
                      >
                        <div style={{ width: 21, height: 21, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: notifStatus === 'on' ? 22 : 3, transition: 'left 0.15s' }} />
                      </button>
                    </div>
                    {/* A one-time nudge right after enabling, not a permanent settings
                        drawer — stays open while adjusting multiple categories, closes
                        on "Done" (or if push gets turned back off). */}
                    {notifStatus === 'on' && justEnabledNotifs && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                        <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 10px' }}>What would you like to hear about?</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                          {[['birthday_reminders', 'Birthdays'], ['friend_activity', 'Friend activity'], ['partner_activity', 'Partner activity'], ['prompt_nudges', 'Gentle nudges']].map(([key, label]) => (
                            <button
                              key={key}
                              onClick={() => setNotifPref(key, !notifPrefs[key])}
                              style={{
                                border: `1px solid ${notifPrefs[key] ? 'var(--accent)' : 'var(--border)'}`,
                                borderRadius: 10, padding: '10px 8px', fontSize: 12.5, fontWeight: 600,
                                fontFamily: "'Urbanist', sans-serif", cursor: 'pointer',
                                background: notifPrefs[key] ? 'var(--accent)' : 'var(--bg-input)',
                                color: notifPrefs[key] ? '#fff' : 'var(--text-2)',
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setJustEnabledNotifs(false)}
                          className="btn btn-outline"
                          style={{ width: '100%', fontSize: 13, padding: '9px 16px' }}
                        >
                          Done
                        </button>
                      </div>
                    )}
                  </>
                )}
                {notifError && (
                  <p style={{ fontSize: 11.5, color: '#D4856A', margin: '10px 0 0', lineHeight: 1.5 }}>{notifError}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Create a book ── */}
          {onCreateBook && (
            <button onClick={onCreateBook} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 18px', background: darkMode ? 'linear-gradient(180deg, #2E4A34 0%, #1E3425 100%)' : 'linear-gradient(180deg, #3A4D40 0%, #1E2E24 100%)', border: darkMode ? '1px solid rgba(107,158,109,0.18)' : 'none', borderRadius: 14, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", boxShadow: darkMode ? '0 2px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 3px 10px rgba(20,35,25,0.38), inset 0 1px 0 rgba(255,255,255,0.08)' }} onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.opacity = '0.88'; }} onMouseUp={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.opacity = ''; }} onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.opacity = ''; }} onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.opacity = '0.88'; }} onTouchEnd={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.opacity = ''; }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="ti-book" style={{ fontSize: 18, color: '#C8993E' }} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>Create a book</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>The entries were for you. The book is for them.</p>
                </div>
              </div>
              <Icon name="ti-arrow-right" style={{ fontSize: 16, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
            </button>
          )}

          {/* ── Account ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 4 }}>
            <button onClick={onSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", padding: '8px 0', fontWeight: 600 }}>
              Sign out
            </button>
            {onDeleteAccount && (
              <button onClick={() => setShowDeleteConfirm(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#C4A09C', fontFamily: "'Urbanist', sans-serif", padding: '4px 0', fontWeight: 500 }}>
                Delete account
              </button>
            )}
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingTop: 4, paddingBottom: 8 }}>
              <button onClick={onShowPrivacy} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", padding: 0 }}>Privacy Policy</button>
              <span style={{ fontSize: 11, color: 'var(--border)' }}>·</span>
              <button onClick={onShowTerms} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", padding: 0 }}>Terms of Service</button>
            </div>
          </div>

          {/* Member type picker */}
          {memberPickerOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 20 }} onClick={() => setMemberPickerOpen(false)}>
              <div style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 480 }} onClick={e => e.stopPropagation()}>
                {pickerStep === 'type' ? (
                  <>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 18px' }}>Who are you adding?</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[
                        { icon: 'ti-heart', label: 'A child', sub: 'Newborn, toddler, or older kid', action: () => { setMemberPickerOpen(false); setAddingKid(true); } },
                        { icon: 'ti-users', label: 'Your partner', sub: 'Invite them to co-author your family journal', action: () => handlePickerInvite('partner') },
                      ].map(opt => (
                        <button key={opt.label} onClick={opt.action} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 13, cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: "'Urbanist', sans-serif" }}>
                          <div style={{ width: 42, height: 42, borderRadius: 11, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Icon name={opt.icon} style={{ fontSize: 20, color: 'var(--accent)' }} />
                          </div>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{opt.label}</p>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{opt.sub}</p>
                          </div>
                          <Icon name="ti-chevron-right" style={{ fontSize: 14, color: 'var(--border)', marginLeft: 'auto' }} />
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                      <button onClick={() => setPickerStep('type')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, padding: 0, display: 'flex' }}><Icon name="ti-arrow-left" /></button>
                      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Invite your partner</p>
                    </div>
                    {inviteLoading ? (
                      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>Generating invite code…</div>
                    ) : inviteCode ? (
                      <div style={{ padding: '20px 16px', background: 'var(--bg-input)', borderRadius: 14, border: '1px solid var(--border)', textAlign: 'center' }}>
                        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 10px', fontWeight: 600 }}>Share this code with your partner</p>
                        <p style={{ fontSize: 30, fontWeight: 700, color: 'var(--accent)', letterSpacing: 5, margin: '0 0 14px', fontFamily: "'Urbanist', sans-serif" }}>{inviteCode}</p>
                        <p style={{ fontSize: 11, color: 'var(--border-light)', margin: '0 0 14px', lineHeight: 1.5 }}>They'll enter this code during sign-up to join your family journal.</p>
                        <button onClick={() => { navigator.clipboard?.writeText(inviteCode); }} style={{ background: 'var(--bg-card)', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--accent)', fontFamily: "'Urbanist', sans-serif", padding: '10px 20px', borderRadius: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Icon name="ti-copy" style={{ fontSize: 14 }} />Copy code
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Add kid sheet */}
          {addingKid && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: '0 16px' }} onClick={() => setAddingKid(false)}>
              <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Add a child</p>
                <input
                  className="input-field"
                  placeholder="Name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  style={{ marginBottom: 10, fontSize: 16 }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  <div style={{ position: 'relative', flex: 2.2 }}>
                    <select value={newBdMonth} onChange={e => setNewBdMonth(e.target.value)} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '13px 32px 13px 14px', fontSize: 15, outline: 'none', background: 'var(--bg-input)', color: newBdMonth ? 'var(--text)' : 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
                      <option value="" disabled>Month</option>
                      {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                        <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                      ))}
                    </select>
                    <Icon name="ti-chevron-down" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12, pointerEvents: 'none' }} />
                  </div>
                  <input type="number" placeholder="Day" value={newBdDay} min={1} max={31} onChange={e => setNewBdDay(e.target.value)} style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 10, padding: '13px 8px', fontSize: 15, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", textAlign: 'center' }} />
                  <input type="number" placeholder="Year" value={newBdYear} min={1900} max={2030} onChange={e => setNewBdYear(e.target.value)} style={{ flex: 1.5, border: '1px solid var(--border)', borderRadius: 10, padding: '13px 8px', fontSize: 15, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", textAlign: 'center' }} />
                </div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '12px 0 8px' }}>Sex <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — improves growth chart accuracy)</span></p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  {[['M', 'Boy'], ['F', 'Girl']].map(([val, label]) => (
                    <button key={val} onClick={() => setNewSex(newSex === val ? null : val)} style={{ flex: 1, border: `1px solid ${newSex === val ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, padding: '11px 0', fontSize: 14, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", background: newSex === val ? 'var(--accent)' : 'var(--bg-input)', color: newSex === val ? '#fff' : 'var(--text-2)', cursor: 'pointer' }}>{label}</button>
                  ))}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', opacity: newName.trim() && newBirthdate && !addSaving ? 1 : 0.4 }}
                  disabled={!newName.trim() || !newBirthdate || addSaving}
                  onClick={handleSaveNewKid}
                >
                  {addSaving ? 'Saving…' : 'Add'}
                </button>
              </div>
            </div>
          )}

          {/* Edit kid sheet */}
          {editingKid && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: '0 16px' }} onClick={() => setEditingKid(null)}>
              <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Edit {editingKid.name}</p>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Name</p>
                <input
                  className="input-field"
                  value={kidNameInput}
                  onChange={e => setKidNameInput(e.target.value)}
                  placeholder="Name"
                  style={{ marginBottom: 16, fontSize: 16 }}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter' && kidNameInput.trim()) { onRenameKid(editingKid.id, kidNameInput.trim()); onUpdateKidSex?.(editingKid.id, kidSexInput); setEditingKid(null); } }}
                />
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Sex <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(for growth chart percentiles)</span></p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  {[['M', 'Boy'], ['F', 'Girl']].map(([val, label]) => (
                    <button key={val} onClick={() => setKidSexInput(kidSexInput === val ? null : val)} style={{ flex: 1, border: `1px solid ${kidSexInput === val ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, padding: '11px 0', fontSize: 14, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", background: kidSexInput === val ? 'var(--accent)' : 'var(--bg-input)', color: kidSexInput === val ? '#fff' : 'var(--text-2)', cursor: 'pointer' }}>{label}</button>
                  ))}
                </div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Amazon wishlist <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — shown to friends near their birthday)</span></p>
                <input
                  className="input-field"
                  type="url"
                  value={kidWishlistInput}
                  onChange={e => setKidWishlistInput(e.target.value)}
                  placeholder="https://www.amazon.com/hz/wishlist/ls/..."
                  style={{ marginBottom: 20, fontSize: 14 }}
                />
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', opacity: kidNameInput.trim() ? 1 : 0.4 }}
                  disabled={!kidNameInput.trim()}
                  onClick={() => { onRenameKid(editingKid.id, kidNameInput.trim()); onUpdateKidSex?.(editingKid.id, kidSexInput); onUpdateKidWishlist?.(editingKid.id, kidWishlistInput.trim() || null); setEditingKid(null); }}
                >
                  Save
                </button>
                {onArchiveKid && (
                  <button
                    onClick={() => { setRemoveChoiceKid(editingKid); setEditingKid(null); }}
                    style={{ display: 'block', width: '100%', textAlign: 'center', background: 'none', border: 'none', color: '#D4856A', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", marginTop: 16, padding: 0 }}
                  >
                    Remove from family
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Archive vs. delete-completely choice sheet */}
          {removeChoiceKid && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 21, padding: '0 16px' }} onClick={() => setRemoveChoiceKid(null)}>
              <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Remove {removeChoiceKid.name} from your family?</p>
                <button
                  onClick={() => { onArchiveKid?.(removeChoiceKid.id); setRemoveChoiceKid(null); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', marginBottom: 10 }}
                >
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 3px' }}>Archive</p>
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>{removeChoiceKid.name} won't show up for new letters, but everything you've already written stays exactly as it is.</p>
                </button>
                <button
                  onClick={() => { setErasingKid(removeChoiceKid); setRemoveChoiceKid(null); setEraseNameInput(''); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'rgba(212,133,106,0.1)', border: '1px solid rgba(212,133,106,0.35)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', marginBottom: 14 }}
                >
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#D4856A', margin: '0 0 3px' }}>Delete completely</p>
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>Permanently deletes {removeChoiceKid.name} and every photo/letter that's only about them. Letters shared with a sibling keep the sibling's side but lose theirs. This can't be undone.</p>
                </button>
                <button onClick={() => setRemoveChoiceKid(null)} style={{ display: 'block', width: '100%', textAlign: 'center', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", padding: 0 }}>
                  Never mind
                </button>
              </div>
            </div>
          )}

          {/* Delete-completely confirmation — requires typing the kid's name */}
          {erasingKid && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 21, padding: '0 16px' }} onClick={() => setErasingKid(null)}>
              <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#D4856A', margin: '0 0 4px' }}>Delete {erasingKid.name} completely?</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>This can't be undone. Type <strong>{erasingKid.name}</strong> to confirm.</p>
                <input
                  className="input-field"
                  value={eraseNameInput}
                  onChange={e => setEraseNameInput(e.target.value)}
                  placeholder={erasingKid.name}
                  style={{ marginBottom: 20, fontSize: 16 }}
                  autoFocus
                />
                <button
                  className="btn"
                  style={{ width: '100%', background: '#D4856A', color: '#fff', opacity: eraseNameInput.trim() === erasingKid.name ? 1 : 0.4 }}
                  disabled={eraseNameInput.trim() !== erasingKid.name}
                  onClick={() => { onEraseKid?.(erasingKid.id); setErasingKid(null); }}
                >
                  Delete completely
                </button>
              </div>
            </div>
          )}

          {/* Edit name sheet */}
          {editingName && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: '0 16px' }} onClick={() => setEditingName(false)}>
              <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>Your name</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>How friends find you on Patina</p>
                <input
                  className="input-field"
                  value={realNameInput}
                  onChange={e => setRealNameInput(e.target.value)}
                  placeholder="e.g. Alex, Pearl…"
                  style={{ marginBottom: 20, fontSize: 18 }}
                  autoFocus
                />
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>What do your kids call you?</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>Shown in journal entries</p>
                <input
                  className="input-field"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Mom, Dad, Mama…"
                  style={{ marginBottom: 20, fontSize: 18 }}
                />
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => {
                    if (realNameInput.trim()) onUpdateRealName?.(realNameInput.trim());
                    if (nameInput.trim()) onUpdateDisplayName(nameInput.trim());
                    setEditingName(false);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Edit family name sheet */}
          {editingFamilyName && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: '0 16px' }} onClick={() => setEditingFamilyName(false)}>
              <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>Family name</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>Shown just to you, for now</p>
                <input
                  className="input-field"
                  value={familyNameInput}
                  onChange={e => setFamilyNameInput(e.target.value)}
                  placeholder="e.g. The Smiths"
                  style={{ marginBottom: 20, fontSize: 18 }}
                  autoFocus
                />
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => { onUpdateFamilyName?.(familyNameInput.trim()); setEditingFamilyName(false); }}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Edit real name sheet */}
          {editingRealName && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: '0 16px' }} onClick={() => setEditingRealName(false)}>
              <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>Your name</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>How friends will find you on Patina.</p>
                <input
                  className="input-field"
                  value={realNameInput}
                  onChange={e => setRealNameInput(e.target.value)}
                  placeholder="e.g. Meg, Alex…"
                  style={{ marginBottom: 16, fontSize: 18 }}
                  autoFocus
                />
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', opacity: realNameInput.trim() ? 1 : 0.4 }}
                  disabled={!realNameInput.trim()}
                  onClick={() => { onUpdateRealName?.(realNameInput.trim()); setEditingRealName(false); }}
                >
                  Save
                </button>
              </div>
            </div>
          )}


        </div>
      </div>

      {cropState && (
        <AvatarCropModal
          imageSrc={cropState.src}
          onConfirm={blob => { cropState.onConfirm(blob); setCropState(null); }}
          onCancel={() => setCropState(null)}
        />
      )}

      {showDeleteConfirm && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.4)', display: 'flex', alignItems: 'flex-end', zIndex: 20 }} onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', padding: '28px 24px 44px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(212,133,106,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="ti-trash" style={{ fontSize: 20, color: '#D4856A' }} />
            </div>
            <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px', textAlign: 'center' }}>Delete your account?</p>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', textAlign: 'center', lineHeight: 1.55 }}>
              {hasPartner
                ? "You'll be removed from the family, but all your posts and photos will stay — your partner won't lose anything."
                : "This permanently deletes all your entries, photos, and kids' profiles. This cannot be undone."}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</button>
              <button
                className="btn"
                style={{ flex: 1, background: '#D4856A', color: '#fff', opacity: deleting ? 0.6 : 1 }}
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  await onDeleteAccount();
                  setDeleting(false);
                  setShowDeleteConfirm(false);
                }}
              >
                {deleting ? <><Icon name="ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> Deleting…</> : 'Delete everything'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHidePostsPrompt && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,56,40,0.4)', display: 'flex', alignItems: 'flex-end', zIndex: 20 }} onClick={() => !hidingPosts && setShowHidePostsPrompt(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', padding: '28px 24px 44px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="ti-eye-off" style={{ fontSize: 20, color: 'var(--accent)' }} />
            </div>
            <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px', textAlign: 'center' }}>Hide your previous posts from friends?</p>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', textAlign: 'center', lineHeight: 1.55 }}>
              Turning off discoverable only stops new people from finding you — friends you already have can still see what you've shared with them. Hiding your past posts removes them from friends only; your partner and family keep seeing everything.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowHidePostsPrompt(false)} disabled={hidingPosts}>Keep them visible</button>
              <button
                className="btn"
                style={{ flex: 1, background: '#D4856A', color: '#fff', opacity: hidingPosts ? 0.6 : 1 }}
                disabled={hidingPosts}
                onClick={async () => {
                  setHidingPosts(true);
                  await onHidePostsFromFriends?.();
                  setHidingPosts(false);
                  setShowHidePostsPrompt(false);
                }}
              >
                {hidingPosts ? <><Icon name="ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> Hiding…</> : 'Hide from friends'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileScreen;
