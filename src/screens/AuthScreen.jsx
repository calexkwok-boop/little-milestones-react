import { useState } from 'react';
import { Icon } from '../icons';
import { supabase } from '../supabase.js';
import { getAuthRedirectUrl, ASSET_BASE } from '../constants.js';

function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkEmail, setCheckEmail] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit() {
    if (mode === 'reset') {
      if (!email) return;
      setLoading(true);
      setError('');
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getAuthRedirectUrl(),
      });
      setLoading(false);
      if (error) setError(error.message);
      else setResetSent(true);
      return;
    }
    if (!email || !password) return;
    setLoading(true);
    setError('');
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });
      if (error) setError(error.message);
      else setCheckEmail(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
    setLoading(false);
  }

  if (checkEmail) {
    return (
      <div className="screen">
        <div className="scroll-area">
          <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 560, textAlign: 'center', gap: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <Icon name="ti-mail-check" style={{ fontSize: 32, color: 'var(--accent)' }} />
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: 'var(--text)', margin: 0 }}>Check your inbox</h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.7, margin: 0 }}>
              We sent a confirmation link to<br />
              <strong style={{ color: 'var(--accent)' }}>{email}</strong>
            </p>
            <button onClick={() => setCheckEmail(false)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", marginTop: 8 }}>
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (resetSent) {
    return (
      <div className="screen">
        <div className="scroll-area">
          <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 560, textAlign: 'center', gap: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <Icon name="ti-mail-check" style={{ fontSize: 32, color: 'var(--accent)' }} />
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: 'var(--text)', margin: 0 }}>Check your inbox</h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.7, margin: 0 }}>
              If an account exists for<br />
              <strong style={{ color: 'var(--accent)' }}>{email}</strong>,<br />
              we sent a link to reset your password.
            </p>
            <button onClick={() => { setResetSent(false); setMode('signin'); }} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", marginTop: 8 }}>
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        <div style={{ padding: '60px 28px 48px', display: 'flex', flexDirection: 'column', minHeight: 560, justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <img src={`${ASSET_BASE}icon-192.png`} style={{ width: 76, height: 76, borderRadius: 17, display: 'block', margin: '0 auto 20px' }} alt="" />
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 32, margin: '0 0 10px', background: 'linear-gradient(180deg, #D4A84B, #B8872E)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent' }}>Patina</h1>
            <p style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 15, color: 'var(--text-3)', margin: 0, textAlign: 'center' }}>
              For all the things you wish they knew
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            <input
              className="input-field"
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              onKeyDown={e => e.key === 'Enter' && mode === 'reset' && handleSubmit()}
            />
            {mode !== 'reset' && (
              <input
                className="input-field"
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            )}
          </div>
          {mode === 'signin' && (
            <p style={{ textAlign: 'right', margin: '-8px 0 16px' }}>
              <button
                onClick={() => { setMode('reset'); setError(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: 0, fontFamily: "'Urbanist', sans-serif" }}
              >
                Forgot password?
              </button>
            </p>
          )}
          {error && (
            <p style={{ fontSize: 13, color: 'var(--coral)', marginBottom: 12, textAlign: 'center', lineHeight: 1.4 }}>{error}</p>
          )}
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: 16, opacity: loading || !email || (mode !== 'reset' && !password) ? 0.5 : 1 }}
            disabled={loading || !email || (mode !== 'reset' && !password)}
            onClick={handleSubmit}
          >
            {loading ? 'Please wait…' : mode === 'reset' ? 'Send reset link' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            {mode === 'reset'
              ? null
              : mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <button
              onClick={() => { setMode(mode === 'reset' ? 'signin' : mode === 'signup' ? 'signin' : 'signup'); setError(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 13, padding: 0, fontFamily: "'Urbanist', sans-serif" }}
            >
              {mode === 'reset' ? 'Back to sign in' : mode === 'signup' ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default AuthScreen;
