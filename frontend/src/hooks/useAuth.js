// src/hooks/useAuth.js
//
// Custom hook for managing password authentication state.
// Handles calling the service layer and storing/restoring the session
// using localStorage (Remember Me) or sessionStorage.

import { useState, useEffect } from 'react'
import { authService } from '../services/auth.service'

export function useAuth() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)

    const reset = () => { setError(null); setSuccess(null) }

    const register = async (username, password) => {
        reset()
        setLoading(true)
        try {
            setSuccess('Registering user...')
            await authService.registerWithPassword(username, password)
            setSuccess('Registration successful! Please login.')
            return { ok: true }
        } catch (err) {
            setError(err.message || 'An unexpected error occurred.')
            setSuccess(null)
            return { ok: false, error: err.message }
        } finally {
            setLoading(false)
        }
    }

    const login = async (username, password, rememberMe) => {
        reset()
        setLoading(true)
        try {
            setSuccess('Verifying credentials...')
            const result = await authService.loginWithPassword(username, password, rememberMe)
            setSuccess('Login successful!')
            
            // Note: Since this is purely a frontend hook meant to be used by components 
            // that bubble state up to App.jsx, we return the session here instead of 
            // managing global state in this hook. App.jsx will handle the authenticated state.
            return { 
                ok: true, 
                user: result.user, 
                session: result.session,
                rememberMe 
            }
        } catch (err) {
            setError(err.message || 'Invalid credentials.')
            setSuccess(null)
            return { ok: false, error: err.message }
        } finally {
            setLoading(false)
        }
    }

    return { register, login, loading, error, success, reset }
}
