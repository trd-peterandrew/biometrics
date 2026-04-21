// src/hooks/useWebAuthn.js
//
// Custom React hook that encapsulates all WebAuthn registration
// and authentication logic. It communicates with Supabase Edge
// Functions for server-side challenge generation and verification.
//
// @simplewebauthn/browser wraps navigator.credentials.create()
// and navigator.credentials.get() and handles all the complex
// ArrayBuffer ↔ Base64URL encoding/decoding internally.

import { useState } from 'react'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import { supabase } from '../lib/supabaseClient'

// Base URL for our Supabase Edge Function.
// The single "webauthn" function handles all four routes via URL path.
const FUNCTION_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webauthn`

/**
 * Helper: calls a Supabase Edge Function route with a JSON body.
 * Attaches the anon key as Authorization header (required by Supabase).
 */
async function callEdgeFunction(path, body) {
    const res = await fetch(`${FUNCTION_BASE}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            // Supabase Edge Functions require the anon key for public access.
            // For authenticated routes you would use the user's JWT instead.
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || `HTTP ${res.status}`)
    }

    return res.json()
}

export function useWebAuthn() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)

    // ── Reset feedback state ─────────────────────────────────────
    const reset = () => { setError(null); setSuccess(null) }

    // ================================================================
    // REGISTRATION FLOW
    // Step 1: Get options (challenge) from server
    // Step 2: Call navigator.credentials.create() via SimpleWebAuthn
    // Step 3: Send response to server for verification + storage
    // ================================================================
    const register = async (userId, username) => {
        reset()
        setLoading(true)

        try {
            // ── Step 1: Fetch registration options from Edge Function ──
            // The server generates a random challenge and returns all the
            // WebAuthn PublicKeyCredentialCreationOptions fields.
            setSuccess('Fetching registration options…')
            const options = await callEdgeFunction('/register-options', { userId, username })

            // Guard: startRegistration internally calls .replace() on challenge & user.id.
            // If the server returned malformed options (undefined fields), validate here
            // to surface a readable error instead of a cryptic crash.
            const missingRegFields = []
            if (typeof options?.challenge !== 'string') missingRegFields.push('challenge')
            if (typeof options?.user?.id !== 'string') missingRegFields.push('user.id')
            if (missingRegFields.length > 0) {
                throw new Error(
                    `Server returned invalid registration options (missing: ${missingRegFields.join(', ')}). ` +
                    `Raw: ${JSON.stringify(options)}`
                )
            }

            // ── Step 2: Trigger the browser/OS biometric prompt ──
            // startRegistration() calls navigator.credentials.create() under
            // the hood and returns the attestation response as JSON-serialisable
            // objects (Base64URL strings, not raw ArrayBuffers).
            setSuccess('Waiting for biometric prompt… (touch the sensor or scan your face)')
            const attResp = await startRegistration(options)

            // ── Step 3: Send attestation response to server ──
            // The server verifies the challenge matches, extracts the public key
            // from the authenticator data, and stores it in the database.
            setSuccess('Verifying credential with server…')
            const result = await callEdgeFunction('/register', { userId, username, attResp })

            setSuccess(`✓ ${result.message || 'Biometric registered successfully!'}`)
            return { ok: true }
        } catch (err) {
            // Common errors:
            //  - NotAllowedError: user cancelled or timed out
            //  - NotSupportedError: device does not support WebAuthn
            //  - InvalidStateError: credential already registered
            const msg =
                err.name === 'NotAllowedError' ? 'Biometric prompt was cancelled or timed out.' :
                    err.name === 'NotSupportedError' ? 'WebAuthn is not supported on this device/browser.' :
                        err.name === 'InvalidStateError' ? 'This credential is already registered.' :
                            (typeof err.message === 'string' && err.message) ? err.message :
                                (typeof err === 'string') ? err :
                                    'An unexpected error occurred. Please try again.'
            setError(msg)
            setSuccess(null)
            return { ok: false, error: msg }
        } finally {
            setLoading(false)
        }
    }

    // ================================================================
    // AUTHENTICATION FLOW
    // Step 1: Get challenge + allowed credentials from server
    // Step 2: Call navigator.credentials.get() via SimpleWebAuthn
    // Step 3: Send assertion response to server for signature verification
    // ================================================================
    const authenticate = async (userId) => {
        reset()
        setLoading(true)

        try {
            // ── Step 1: Fetch authentication options ──
            // Server looks up stored credentials for this user and returns
            // a fresh challenge plus the list of allowedCredentials.
            setSuccess('Fetching authentication challenge…')
            const options = await callEdgeFunction('/auth-options', { userId })

            // Guard: same .replace() risk exists in startAuthentication.
            const missingAuthFields = []
            if (typeof options?.challenge !== 'string') missingAuthFields.push('challenge')
            if (missingAuthFields.length > 0) {
                throw new Error(
                    `Server returned invalid auth options (missing: ${missingAuthFields.join(', ')}). ` +
                    `Raw: ${JSON.stringify(options)}`
                )
            }

            // ── Step 2: Trigger biometric prompt for assertion ──
            // startAuthentication() calls navigator.credentials.get() internally.
            // The authenticator signs the challenge with the private key stored
            // on the device (TPM / Secure Enclave / platform key).
            setSuccess('Waiting for biometric verification…')
            const assertResp = await startAuthentication(options)

            // ── Step 3: Send assertion to server for verification ──
            // Server checks the signature against the stored public key,
            // validates the challenge, and updates the usage counter
            // (to prevent replay attacks).
            setSuccess('Verifying signature…')
            const result = await callEdgeFunction('/verify', { userId, assertResp })

            setSuccess(`✓ ${result.message || 'Authentication successful!'}`)
            return { ok: true, session: result.session }
        } catch (err) {
            const msg =
                err.name === 'NotAllowedError' ? 'Biometric prompt was cancelled or timed out.' :
                    err.name === 'NotSupportedError' ? 'WebAuthn is not supported on this device/browser.' :
                        (typeof err.message === 'string' && err.message) ? err.message :
                            (typeof err === 'string') ? err :
                                'An unexpected error occurred. Please try again.'
            setError(msg)
            setSuccess(null)
            return { ok: false, error: msg }
        } finally {
            setLoading(false)
        }
    }

    return { register, authenticate, loading, error, success, reset }
}
