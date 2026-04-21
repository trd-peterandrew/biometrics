// src/components/LoginBiometric.jsx
//
// Authenticates a returning user via their registered biometric credential.
// In the QR attendance system: user scans QR → lands here → touches
// fingerprint sensor → server verifies → attendance is recorded.

import { useState } from 'react'
import { useWebAuthn } from '../hooks/useWebAuthn'
import StatusBox from './StatusBox'

export default function LoginBiometric({ onAuthenticated }) {
  const [username, setUsername] = useState('')
  const { authenticate, loading, error, success, reset } = useWebAuthn()

  // Must match the same derivation used in RegisterBiometric
  const deriveUserId = (name) => {
    const base = name.padEnd(32, '0').slice(0, 32)
    return `${base.slice(0,8)}-${base.slice(8,12)}-4${base.slice(13,16)}-a${base.slice(17,20)}-${base.slice(20,32)}`
  }

  const handleLogin = async () => {
    if (!username.trim()) return
    const userId = deriveUserId(username.toLowerCase().replace(/\s+/g, '_'))
    const result = await authenticate(userId)
    if (result.ok && onAuthenticated) {
      onAuthenticated({
        userId,
        username,
        // Server returns a lightweight session token / metadata on success
        session: result.session,
      })
    }
  }

  const handleInput = (e) => {
    setUsername(e.target.value)
    reset()
  }

  return (
    <section className="auth-card" aria-label="Login with biometric credential">
      {/* ── Card Header ── */}
      <div className="card-header">
        <div className="card-icon login" aria-hidden="true">👁️</div>
        <div>
          <h2 className="card-title">Biometric Login</h2>
          <p className="card-desc">
            Verify your identity using the biometric credential you registered.
          </p>
        </div>
      </div>

      {/* ── Username Input ── */}
      <div className="input-group">
        <label className="input-label" htmlFor="login-username">
          Your Name / ID
        </label>
        <input
          id="login-username"
          type="text"
          className="input-field"
          placeholder="e.g. juan_dela_cruz"
          value={username}
          onChange={handleInput}
          disabled={loading}
          autoComplete="username"
        />
      </div>

      {/* ── Authenticate Button ── */}
      <button
        id="btn-login"
        className="btn btn-success"
        onClick={handleLogin}
        disabled={loading || !username.trim()}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Verifying…
          </>
        ) : (
          <>
            <span aria-hidden="true">🖐️</span>
            Authenticate
          </>
        )}
      </button>

      {/* ── Feedback ── */}
      <StatusBox loading={loading && !!success} error={error} success={success} />
    </section>
  )
}
