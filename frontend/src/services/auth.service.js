// src/services/auth.service.js
//
// Handles API calls to the Supabase Edge Function for password-based authentication.

const FUNCTION_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webauthn`

async function callEdgeFunction(path, body) {
    let res
    try {
        res = await fetch(`${FUNCTION_BASE}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify(body),
        })
    } catch (networkErr) {
        throw new Error(`Network error calling ${path}: ${networkErr.message}`)
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status} ${res.statusText}` }))
        throw new Error(`${err.error || res.statusText}`)
    }

    return res.json()
}

export const authService = {
    async registerWithPassword(username, password) {
        return callEdgeFunction('/password-register', { username, password })
    },

    async loginWithPassword(username, password, rememberMe) {
        return callEdgeFunction('/password-login', { username, password, rememberMe })
    }
}
