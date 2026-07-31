import { useState } from 'react';
import { Icon } from '../icons';
import { supabase } from '../supabase.js';

function UpdatePasswordScreen({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!password || password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords don’t match.'); return; }
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="screen">
        <div className="scroll-area">
          <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 560, textAlign: 'center', gap: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <Icon name="ti-circle-check" style={{ fontSize: 32, color: 'var(--accent)' }} />
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: 'var(--text)', margin: 0 }}>Password updated</h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.7, margin: 0 }}>
              You're all set — continue into your journal.
            </p>
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={onDone}>Continue</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', minHeight: 560, justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <img src="/icon-192.png" style={{ width: 76, height: 76, borderRadius: 17, display: 'block', margin: '0 auto 20px' }} alt="" />
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: 'var(--text)', margin: '0 0 10px' }}>Set a new password</h1>
            <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
              Choose a new password for your account.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            <input
              className="input-field"
              type="password"
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <input
              className="input-field"
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          {error && (
            <p style={{ fontSize: 13, color: 'var(--coral)', marginBottom: 12, textAlign: 'center', lineHeight: 1.4 }}>{error}</p>
          )}
          <button
            className="btn btn-primary"
            style={{ width: '100%', opacity: loading || !password || !confirm ? 0.5 : 1 }}
            disabled={loading || !password || !confirm}
            onClick={handleSubmit}
          >
            {loading ? 'Please wait…' : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default UpdatePasswordScreen;
