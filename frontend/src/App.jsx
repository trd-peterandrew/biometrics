// src/App.jsx
//
// Root component that manages the session state.
// Shows: Register → Login → Authenticated dashboard

import { useState, useEffect } from 'react'
import RegisterBiometric from './components/RegisterBiometric'
import LoginBiometric    from './components/LoginBiometric'
import RegisterPassword  from './components/RegisterPassword'
import LoginPassword     from './components/LoginPassword'
import './index.css'

export default function App() {
  // null = not authenticated; { userId, username, session } = authenticated
  const [session, setSession] = useState(null)
  // 'login' | 'register'
  const [view, setView] = useState('login')
  // 'biometric' | 'password'
  const [authMethod, setAuthMethod] = useState('biometric')

  useEffect(() => {
    // Try to restore session on mount
    const storedSession = localStorage.getItem('auth_session') || sessionStorage.getItem('auth_session')
    if (storedSession) {
      try {
        setSession(JSON.parse(storedSession))
      } catch (e) {
        // ignore invalid JSON
      }
    }
  }, [])

  const handleAuthenticated = (sessionData, rememberMe = false) => {
    setSession(sessionData)
    const storage = rememberMe ? localStorage : sessionStorage
    storage.setItem('auth_session', JSON.stringify(sessionData))
  }

  const handleLogout = () => {
    setSession(null)
    setView('login')
    localStorage.removeItem('auth_session')
    sessionStorage.removeItem('auth_session')
  }

  return (
    <div className="app-wrapper">
      <div className="app-container">

        {/* ── Header ── */}
        <header className="app-header">
          <div className="app-logo" aria-hidden="true">🔐</div>
          <h1 className="app-title">Biometric Auth</h1>
          <p className="app-subtitle">
            WebAuthn-based fingerprint &amp; Face ID authentication<br />
            <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
              Powered by SimpleWebAuthn + Supabase
            </span>
          </p>
        </header>

        {/* ── Session Badge (shown when authenticated) ── */}
        {session && (
          <div className="session-badge" role="status">
            <div className="dot" />
            <div className="session-info">
              <div className="session-label">Authenticated</div>
              <div className="session-user">{session.username} · {session.userId.slice(0, 8)}…</div>
            </div>
            <button
              id="btn-logout"
              className="session-logout"
              onClick={handleLogout}
              aria-label="Sign out"
            >
              Sign out
            </button>
          </div>
        )}

        {/* ── Main Content ── */}
        {!session ? (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
              <button 
                onClick={() => setAuthMethod('biometric')}
                className={`btn ${authMethod === 'biometric' ? 'btn-primary' : ''}`}
                style={authMethod !== 'biometric' ? { background: 'transparent', color: 'var(--text-secondary)', boxShadow: 'none' } : { padding: '0.6rem 1rem' }}
              >
                🖐️ Biometric
              </button>
              <button 
                onClick={() => setAuthMethod('password')}
                className={`btn ${authMethod === 'password' ? 'btn-primary' : ''}`}
                style={authMethod !== 'password' ? { background: 'transparent', color: 'var(--text-secondary)', boxShadow: 'none' } : { padding: '0.6rem 1rem' }}
              >
                🔑 Password
              </button>
            </div>

            {/* Tab switcher */}
            <div className="divider">
              {view === 'login' ? (
                <>
                  <span>Don&apos;t have a credential?</span>
                  <button
                    id="tab-register"
                    onClick={() => setView('register')}
                    style={{
                      background: 'none', border: 'none',
                      color: 'var(--accent-primary)', cursor: 'pointer',
                      fontWeight: 600, fontSize: '0.8125rem', padding: 0,
                    }}
                  >
                    Register here →
                  </button>
                </>
              ) : (
                <>
                  <span>Already registered?</span>
                  <button
                    id="tab-login"
                    onClick={() => setView('login')}
                    style={{
                      background: 'none', border: 'none',
                      color: 'var(--accent-success)', cursor: 'pointer',
                      fontWeight: 600, fontSize: '0.8125rem', padding: 0,
                    }}
                  >
                    Login instead →
                  </button>
                </>
              )}
            </div>

            {/* Active component */}
            {view === 'login' ? (
              authMethod === 'biometric'
                ? <LoginBiometric onAuthenticated={handleAuthenticated} />
                : <LoginPassword onAuthenticated={handleAuthenticated} />
            ) : (
              authMethod === 'biometric'
                ? <RegisterBiometric onRegistered={() => setView('login')} />
                : <RegisterPassword onRegistered={() => setView('login')} />
            )}
          </>
        ) : (
          /* ── Post-authentication dashboard ── */
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🎉</div>
            <h2 className="card-title" style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>
              Identity Verified!
            </h2>
            <p className="card-desc" style={{ marginBottom: '1.5rem' }}>
              Welcome back, <strong style={{ color: 'var(--text-primary)' }}>{session.username}</strong>.<br />
              Your biometric check-in has been recorded.
            </p>
            <div style={{
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              textAlign: 'left',
              wordBreak: 'break-all',
              marginBottom: '1.5rem',
            }}>
              <div><span style={{ color: 'var(--accent-success)' }}>user_id:</span> {session.userId}</div>
              <div><span style={{ color: 'var(--accent-success)' }}>verified_at:</span> {new Date().toISOString()}</div>
              {session.session && (
                <div><span style={{ color: 'var(--accent-success)' }}>token:</span> {JSON.stringify(session.session).slice(0, 80)}…</div>
              )}
            </div>
            <button id="btn-logout-main" className="btn btn-primary" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        )}

        <footer className="app-footer">
          <p>WebAuthn runs entirely in the browser — your biometrics never leave your device.</p>
        </footer>
      </div>
    </div>
  )
}
