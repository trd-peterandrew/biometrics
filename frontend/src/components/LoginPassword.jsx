import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import StatusBox from './StatusBox'

export default function LoginPassword({ onAuthenticated }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  const { login, loading, error, success, reset } = useAuth()

  const handleLogin = async () => {
    if (!username.trim() || !password) return
    const result = await login(username, password, rememberMe)
    if (result.ok && onAuthenticated) {
      onAuthenticated({
        userId: result.user.id,
        username: result.user.username,
        session: result.session
      }, rememberMe)
    }
  }

  return (
    <section className="auth-card" aria-label="Login with password">
      <div className="card-header">
        <div className="card-icon login" aria-hidden="true">🔑</div>
        <div>
          <h2 className="card-title">Password Login</h2>
          <p className="card-desc">
            Sign in with your username and password.
          </p>
        </div>
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="login-password-username">
          Username
        </label>
        <input
          id="login-password-username"
          type="text"
          className="input-field"
          placeholder="e.g. juan_dela_cruz"
          value={username}
          onChange={(e) => { setUsername(e.target.value); reset() }}
          disabled={loading}
          autoComplete="username"
        />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="login-password-input">
          Password
        </label>
        <div className="password-wrapper" style={{ position: 'relative' }}>
          <input
            id="login-password-input"
            type={showPassword ? "text" : "password"}
            className="input-field"
            placeholder="••••••••"
            value={password}
            onChange={(e) => { setPassword(e.target.value); reset() }}
            disabled={loading}
            autoComplete="current-password"
            style={{ paddingRight: '2.5rem' }}
          />
          <button 
            type="button" 
            onClick={() => setShowPassword(!showPassword)}
            className="password-toggle"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "🙈" : "👁️"}
          </button>
        </div>
      </div>

      <div className="input-group remember-me-group">
        <label className="checkbox-label">
          <input 
            type="checkbox" 
            checked={rememberMe} 
            onChange={(e) => setRememberMe(e.target.checked)} 
            disabled={loading}
          />
          <span className="checkbox-text">Remember me</span>
        </label>
      </div>

      <button
        id="btn-login-pwd"
        className="btn btn-success"
        onClick={handleLogin}
        disabled={loading || !username.trim() || !password}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Signing in…
          </>
        ) : (
          <>
            <span aria-hidden="true">➡️</span>
            Sign in
          </>
        )}
      </button>

      <StatusBox loading={loading && !!success} error={error} success={success} />
    </section>
  )
}
