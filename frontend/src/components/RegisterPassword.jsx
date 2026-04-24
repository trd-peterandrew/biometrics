import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import StatusBox from './StatusBox'

export default function RegisterPassword({ onRegistered }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [validationError, setValidationError] = useState(null)
  
  const { register, loading, error, success, reset } = useAuth()

  const handleRegister = async () => {
    if (!username.trim() || !password || !confirmPassword) return
    
    if (password !== confirmPassword) {
      setValidationError("Passwords do not match")
      return
    }

    if (password.length < 6) {
      setValidationError("Password must be at least 6 characters")
      return
    }

    const result = await register(username, password)
    if (result.ok && onRegistered) {
      // Small delay to let user read success message before switching to login
      setTimeout(() => {
        onRegistered()
      }, 1500)
    }
  }

  const handleInputChange = (setter) => (e) => {
    setter(e.target.value)
    reset()
    setValidationError(null)
  }

  const displayError = validationError || error

  return (
    <section className="auth-card" aria-label="Register with password">
      <div className="card-header">
        <div className="card-icon register" aria-hidden="true">📝</div>
        <div>
          <h2 className="card-title">Register Password</h2>
          <p className="card-desc">
            Create an account with a username and password.
          </p>
        </div>
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="register-pwd-username">
          Username
        </label>
        <input
          id="register-pwd-username"
          type="text"
          className="input-field"
          placeholder="e.g. juan_dela_cruz"
          value={username}
          onChange={handleInputChange(setUsername)}
          disabled={loading}
          autoComplete="username"
        />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="register-pwd-input">
          Password
        </label>
        <div className="password-wrapper" style={{ position: 'relative' }}>
          <input
            id="register-pwd-input"
            type={showPassword ? "text" : "password"}
            className="input-field"
            placeholder="••••••••"
            value={password}
            onChange={handleInputChange(setPassword)}
            disabled={loading}
            autoComplete="new-password"
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

      <div className="input-group">
        <label className="input-label" htmlFor="register-pwd-confirm">
          Confirm Password
        </label>
        <input
          id="register-pwd-confirm"
          type={showPassword ? "text" : "password"}
          className="input-field"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={handleInputChange(setConfirmPassword)}
          disabled={loading}
          autoComplete="new-password"
        />
      </div>

      <button
        id="btn-register-pwd"
        className="btn btn-primary"
        onClick={handleRegister}
        disabled={loading || !username.trim() || !password || !confirmPassword}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Processing…
          </>
        ) : (
          <>
            <span aria-hidden="true">➕</span>
            Register Account
          </>
        )}
      </button>

      <StatusBox loading={loading && !!success} error={displayError} success={success} />
    </section>
  )
}
