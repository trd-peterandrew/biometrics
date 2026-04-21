// supabase/functions/webauthn/index.ts
//
// Single Supabase Edge Function that handles all four WebAuthn routes:
//   POST /webauthn/register-options  → generate registration challenge
//   POST /webauthn/register          → verify attestation + store credential
//   POST /webauthn/auth-options      → generate authentication challenge
//   POST /webauthn/verify            → verify assertion + update counter
//
// Runtime: Deno (Supabase Edge Functions use Deno natively).
// SimpleWebAuthn server library is imported via npm: specifier.
//
// ── HTTPS / Production note ──────────────────────────────────────────
// WebAuthn requires a "secure context". On localhost this is granted
// automatically by browsers even over HTTP. In production you MUST serve
// over HTTPS and update RP_ID / ORIGIN below (e.g. "myapp.com" / "https://myapp.com").

import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from 'npm:@simplewebauthn/server@10'
import { createClient } from 'npm:@supabase/supabase-js@2'

// ── Config ───────────────────────────────────────────────────────────
// rpID must match the domain (or "localhost") that the browser sees.
// For production replace with your real domain, e.g. "myapp.com".
const RP_NAME = Deno.env.get('RP_NAME') ?? 'Biometric Attendance System'

// Allowlist for valid origins
const ALLOWED_ORIGINS = new Set([
    Deno.env.get('ORIGIN') ?? 'http://localhost:5173',
    Deno.env.get('EXTRA_ALLOWED_ORIGIN'), // e.g. a Localtunnel or Cloudflare tunnel URL
].filter(Boolean))

function getWebAuthnConfig(req: Request) {
    const origin = req.headers.get('Origin') ?? ''
    if (!ALLOWED_ORIGINS.has(origin)) {
        throw new Error(`Untrusted origin: ${origin}`)
    }
    const rpID = new URL(origin).hostname
    return { origin, rpID }
}

// ── Supabase admin client ─────────────────────────────────────────────
// Uses the service role key so it can bypass RLS for direct DB writes.
// This key is injected automatically as a Supabase secret.
function getSupabase() {
    return createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false } }
    )
}

// ── CORS headers ──────────────────────────────────────────────────────
function getCORSHeaders(req: Request) {
    const origin = req.headers.get('Origin') ?? ''
    const allowed = ALLOWED_ORIGINS.has(origin) ? origin : ''
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }
}

function json(data: unknown, req: Request, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...getCORSHeaders(req), 'Content-Type': 'application/json' },
    })
}

function error(msg: string, req: Request, status = 400) {
    return json({ error: msg }, req, status)
}

// ====================================================================
// ROUTE HANDLERS
// ====================================================================

// ── 1. /register-options ─────────────────────────────────────────────
// Generates a fresh registration challenge and WebAuthn options.
// The challenge is a random buffer — the authenticator will sign it
// during registration to prove it controls the private key.
async function handleRegisterOptions(req: Request, body: { userId: string; username: string }) {
    const { userId, username } = body
    const supabase = getSupabase()

    let config;
    try {
        config = getWebAuthnConfig(req)
    } catch (err: any) {
        console.error('[webauthn] Untrusted origin:', err.message)
        return error('Untrusted origin', req, 403)
    }

    // Get existing credentials to prevent ghost registration
    const { data: existing } = await supabase
        .from('webauthn_credentials')
        .select('credential_id')
        .eq('user_id', userId)

    let options
    try {
        options = await generateRegistrationOptions({
            rpName: RP_NAME,
            rpID: config.rpID,
            // NOTE: Do NOT pass userID as Uint8Array — Deno's npm compat layer silently
            // produces undefined for user.id, crashing the browser library's base64url
            // decoder. We omit it; the library generates a valid random user.id instead.
            // Authentication uses credential_id for matching, not user.id.
            userName: username,
            userDisplayName: username,
            // Prefer platform authenticators (Touch ID, Face ID, Windows Hello)
            // rather than roaming keys (USB security keys).
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification: 'required',
                residentKey: 'preferred',
            },
            // Populate excludeCredentials from the DB to prevent ghost registration
            excludeCredentials: (existing || []).map(c => ({
                id: c.credential_id,
                type: 'public-key'
            })),
        })
    } catch (err: any) {
        console.error('[webauthn] generateRegistrationOptions failed:', err?.message ?? err)
        return error('Failed to generate registration options', req, 500)
    }

    // Sanity-check: challenge and user.id must be strings before we store/return them
    if (typeof options?.challenge !== 'string' || typeof options?.user?.id !== 'string') {
        console.error('[webauthn] Invalid options shape:', JSON.stringify({
            challengeType: typeof options?.challenge,
            userIdType: typeof options?.user?.id,
        }))
        return error('Server produced malformed registration options', req, 500)
    }

    // Store the challenge in the database
    const { error: dbErr } = await supabase
        .from('webauthn_challenges')
        .upsert({
            user_id: userId,
            type: 'reg',
            challenge: options.challenge
        }, { onConflict: 'user_id, type' })

    if (dbErr) {
        console.error('[webauthn] DB error inserting challenge:', dbErr.message)
        return error('Internal server error', req, 500)
    }

    return json(options, req)
}

// ── 2. /register ──────────────────────────────────────────────────────
// Verifies the attestation response from the browser, then stores the
// public key and credential ID in `webauthn_credentials`.
async function handleRegister(req: Request, body: {
    userId: string
    username: string
    attResp: Record<string, unknown>
}) {
    const { userId, attResp } = body
    const supabase = getSupabase()

    let config;
    try {
        config = getWebAuthnConfig(req)
    } catch (err: any) {
        console.error('[webauthn] Untrusted origin:', err.message)
        return error('Untrusted origin', req, 403)
    }

    // Retrieve the expected challenge from DB and ensure it's not expired
    const { data: challengeRow, error: challengeErr } = await supabase
        .from('webauthn_challenges')
        .select('challenge, expires_at')
        .eq('user_id', userId)
        .eq('type', 'reg')
        .single()

    if (challengeErr || !challengeRow) {
        console.error('[webauthn] Challenge not found or DB error:', challengeErr?.message)
        return error('No valid challenge found. Call /register-options first.', req, 400)
    }

    if (new Date(challengeRow.expires_at) < new Date()) {
        console.error('[webauthn] Challenge expired')
        return error('Challenge expired. Call /register-options again.', req, 400)
    }

    let verification
    try {
        verification = await verifyRegistrationResponse({
            response: attResp as Parameters<typeof verifyRegistrationResponse>[0]['response'],
            expectedChallenge: challengeRow.challenge,
            expectedOrigin: config.origin,
            expectedRPID: config.rpID,
            requireUserVerification: true,
        })
    } catch (err) {
        console.error('[webauthn] Verification failed:', (err as Error).message)
        return error('Verification failed', req, 400)
    }

    if (!verification.verified || !verification.registrationInfo) {
        console.error('[webauthn] Credential verification result failed')
        return error('Credential verification failed.', req, 400)
    }

    // Clean up challenge after successful use
    await supabase.from('webauthn_challenges').delete().eq('user_id', userId).eq('type', 'reg')

    const { credential } = verification.registrationInfo

    const publicKeyBase64 = btoa(
        Array.from(credential.publicKey, b => String.fromCharCode(b)).join('')
    )

    // Store in `webauthn_credentials` table
    const { error: dbErr } = await supabase.from('webauthn_credentials').insert({
        user_id: userId,
        credential_id: credential.id,          // Base64URL string
        public_key: publicKeyBase64,        // Base64-encoded COSE public key
        counter: credential.counter,     // Signature counter (replay protection)
    })

    if (dbErr) {
        console.error('[webauthn] DB insert error:', dbErr.message)
        return error('Internal server error', req, 500)
    }

    return json({ verified: true, message: 'Biometric credential registered successfully!' }, req)
}

// ── 3. /auth-options ─────────────────────────────────────────────────
// Generates an authentication challenge and returns the list of
// credentials registered for this user (allowedCredentials).
async function handleAuthOptions(req: Request, body: { userId: string }) {
    const { userId } = body
    const supabase = getSupabase()

    let config;
    try {
        config = getWebAuthnConfig(req)
    } catch (err: any) {
        console.error('[webauthn] Untrusted origin:', err.message)
        return error('Untrusted origin', req, 403)
    }

    // Look up stored credentials for this user
    const { data: creds, error: dbErr } = await supabase
        .from('webauthn_credentials')
        .select('credential_id')
        .eq('user_id', userId)

    if (dbErr) {
        console.error('[webauthn] DB select error:', dbErr.message)
        return error('Internal server error', req, 500)
    }
    if (!creds || creds.length === 0) {
        return error('No biometric credentials registered for this user.', req, 404)
    }

    const options = await generateAuthenticationOptions({
        rpID: config.rpID,
        allowCredentials: creds.map((c) => ({
            id: c.credential_id, // Base64URL string
        })),
        userVerification: 'required',
    })

    // Store the challenge in the database
    const { error: challengeErr } = await supabase
        .from('webauthn_challenges')
        .upsert({
            user_id: userId,
            type: 'auth',
            challenge: options.challenge
        }, { onConflict: 'user_id, type' })

    if (challengeErr) {
        console.error('[webauthn] DB error inserting challenge:', challengeErr.message)
        return error('Internal server error', req, 500)
    }

    return json(options, req)
}

// ── 4. /verify ───────────────────────────────────────────────────────
// Verifies the assertion response:
//   1. Retrieves the stored public key and counter for the credential.
//   2. Calls verifyAuthenticationResponse (checks challenge + signature).
//   3. Updates the counter to prevent replay attacks.
async function handleVerify(req: Request, body: {
    userId: string
    assertResp: Record<string, unknown>
}) {
    const { userId, assertResp } = body
    const supabase = getSupabase()

    let config;
    try {
        config = getWebAuthnConfig(req)
    } catch (err: any) {
        console.error('[webauthn] Untrusted origin:', err.message)
        return error('Untrusted origin', req, 403)
    }

    const { data: challengeRow, error: challengeErr } = await supabase
        .from('webauthn_challenges')
        .select('challenge, expires_at')
        .eq('user_id', userId)
        .eq('type', 'auth')
        .single()

    if (challengeErr || !challengeRow) {
        console.error('[webauthn] Challenge not found or DB error:', challengeErr?.message)
        return error('No valid challenge found. Call /auth-options first.', req, 400)
    }

    if (new Date(challengeRow.expires_at) < new Date()) {
        console.error('[webauthn] Challenge expired')
        return error('Challenge expired. Call /auth-options again.', req, 400)
    }

    // Fetch the matching credential from the database using credential ID
    const credentialId = assertResp.id as string
    const { data: cred, error: dbErr } = await supabase
        .from('webauthn_credentials')
        .select('credential_id, public_key, counter')
        .eq('credential_id', credentialId)
        .eq('user_id', userId)
        .single()

    if (dbErr || !cred) {
        console.error('[webauthn] Credential not found in DB:', dbErr?.message)
        return error('Credential not found.', req, 404)
    }

    // Decode stored Base64 public key back to Uint8Array
    const publicKeyUint8 = Uint8Array.from(atob(cred.public_key), (c) => c.charCodeAt(0))

    let verification
    try {
        verification = await verifyAuthenticationResponse({
            response: assertResp as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
            expectedChallenge: challengeRow.challenge,
            expectedOrigin: config.origin,
            expectedRPID: config.rpID,
            requireUserVerification: true,
            credential: {
                id: cred.credential_id,
                publicKey: publicKeyUint8,
                counter: cred.counter,
            },
        })
    } catch (err) {
        console.error('[webauthn] Authentication verify failed:', (err as Error).message)
        return error('Authentication failed', req, 400)
    }

    if (!verification.verified) {
        console.error('[webauthn] Authentication verification result false')
        return error('Authentication response could not be verified.', req, 400)
    }

    // Clean up challenge
    await supabase.from('webauthn_challenges').delete().eq('user_id', userId).eq('type', 'auth')

    // Update counter in DB (the new counter from the authenticator)
    const newCounter = verification.authenticationInfo.newCounter
    await supabase
        .from('webauthn_credentials')
        .update({ counter: newCounter })
        .eq('credential_id', credentialId)

    // Return a lightweight session payload.
    // In production you would issue a signed JWT here instead.
    const session = {
        userId,
        credentialId,
        verifiedAt: new Date().toISOString(),
        counter: newCounter,
    }

    return json({
        verified: true,
        message: 'Authentication successful! Attendance recorded.',
        session,
    }, req)
}

// ====================================================================
// MAIN HANDLER  (Deno HTTP)
// ====================================================================
Deno.serve(async (req: Request) => {
    // Pre-flight CORS (browsers send OPTIONS before POST)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: getCORSHeaders(req) })
    }

    // ── Global safety net ────────────────────────────────────────────────
    // Any unhandled exception must still return CORS headers so the browser
    // can read the error body instead of seeing a bare network failure.
    try {
        const url = new URL(req.url)
        // Strip the function prefix so we match on the last path segment.
        // Full URL pattern:  /functions/v1/webauthn/<route>
        const route = url.pathname.split('/').pop()

        if (req.method !== 'POST') return error('Method not allowed.', req, 405)

        let body: Record<string, unknown>
        try {
            body = await req.json()
        } catch {
            return error('Invalid JSON body.', req, 400)
        }

        switch (route) {
            case 'register-options': return handleRegisterOptions(req, body as { userId: string; username: string })
            case 'register': return handleRegister(req, body as { userId: string; username: string; attResp: Record<string, unknown> })
            case 'auth-options': return handleAuthOptions(req, body as { userId: string })
            case 'verify': return handleVerify(req, body as { userId: string; assertResp: Record<string, unknown> })
            default: return error(`Unknown route: ${route}`, req, 404)
        }
    } catch (topLevelErr: unknown) {
        const msg = topLevelErr instanceof Error ? topLevelErr.message : 'Unexpected server error'
        console.error('[webauthn] Unhandled top-level error:', msg)
        return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { ...getCORSHeaders(req), 'Content-Type': 'application/json' },
        })
    }
})
