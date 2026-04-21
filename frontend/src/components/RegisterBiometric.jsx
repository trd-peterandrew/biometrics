// src/components/RegisterBiometric.jsx
//
// Allows a user to create a new WebAuthn credential (biometric key).
// In a QR-based attendance system this would run on first-time setup —
// the user scans a QR code, lands here, and registers their fingerprint
// or Face ID before subsequent check-ins use LoginBiometric.

import { useState } from 'react'
import { useWebAuthn } from '../hooks/useWebAuthn'
import StatusBox from './StatusBox'

export default function RegisterBiometric({ onRegistered }) {
  // A real user ID would come from your auth system or the QR payload.
  // For local testing we let the user type a simple username and derive
  // a deterministic UUID-like string from it.
  const [username, setUsername] = useState('')
  const { register, loading, error, success, reset } = useWebAuthn()

  // Derive a simple, deterministic fake UUID from the username so the demo
  // works without a real auth backend. Replace with your actual user.id.
  const deriveUserId = (name) => {
    // Pad / truncate to look like a UUID format (not cryptographically real)
    const base = name.padEnd(32, '0').slice(0, 32)
    return `${base.slice(0,8)}-${base.slice(8,12)}-4${base.slice(13,16)}-a${base.slice(17,20)}-${base.slice(20,32)}`
  }

  const handleRegister = async () => {
    if (!username.trim()) return
    const userId = deriveUserId(username.toLowerCase().replace(/\s+/g, '_'))
    const result = await register(userId, username)
    if (result.ok && onRegistered) onRegistered({ userId, username })
  }

  const handleInput = (e) => {
    setUsername(e.target.value)
    reset()  // clear previous feedback when user edits the field
  }

  return (
    <section className="auth-card" aria-label="Register biometric credential">
      {/* ── Card Header ── */}
      <div className="card-header">
        <div className="card-icon register" aria-hidden="true">🪪</div>
        <div>
          <h2 className="card-title">Register Biometric</h2>
          <p className="card-desc">
            Set up your fingerprint or Face ID for fast, secure attendance check-ins.
          </p>
        </div>
      </div>

      {/* ── Username Input ── */}
      <div className="input-group">
        <label className="input-label" htmlFor="register-username">
          Your Name / ID
        </label>
        <input
          id="register-username"
          type="text"
          className="input-field"
          placeholder="e.g. juan_dela_cruz"
          value={username}
          onChange={handleInput}
          disabled={loading}
          autoComplete="username"
          aria-describedby="register-hint"
        />
        <p id="register-hint" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
          Use the same name when authenticating later.
        </p>
      </div>

      {/* ── Register Button ── */}
      <button
        id="btn-register"
        className="btn btn-primary"
        onClick={handleRegister}
        disabled={loading || !username.trim()}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Processing…
          </>
        ) : (
          <>
            <span aria-hidden="true">🔑</span>
            Register Biometric
          </>
        )}
      </button>

      {/* ── Feedback ── */}
      <StatusBox loading={loading && !!success} error={error} success={success} />
    </section>
  )
}
