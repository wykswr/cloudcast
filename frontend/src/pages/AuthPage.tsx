import { useState, type FormEvent } from 'react'
import { confirmSignUp, signIn, signUp } from 'aws-amplify/auth'
import Mascot from '../components/common/Mascot'
import { useAuth } from '../context/auth-context'
import { formatError } from '../utils/format'
import type { AuthMode } from '../types'

function AuthPage() {
  const { refreshUser } = useAuth()
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setBusy(true)
    try {
      if (mode === 'sign-in') {
        const result = await signIn({ username: email, password })
        if (result.isSignedIn) {
          await refreshUser()
        } else {
          setMessage('Sign-in needs an extra step in Cognito.')
        }
      } else if (mode === 'sign-up') {
        await signUp({
          username: email,
          password,
          options: {
            userAttributes: { email },
            autoSignIn: { enabled: false },
          },
        })
        setPendingEmail(email)
        setMode('confirm')
        setMessage('Check your email for the verification code ✉️')
      } else {
        await confirmSignUp({
          username: pendingEmail || email,
          confirmationCode: confirmCode,
        })
        setMode('sign-in')
        setMessage('Email confirmed! You can sign in now ♡')
      }
    } catch (err) {
      setError(formatError(err))
    } finally {
      setBusy(false)
    }
  }

  const heading =
    mode === 'sign-up'
      ? 'Make an account 🌸'
      : mode === 'confirm'
        ? 'Almost there ✉️'
        : 'Hello again 👋'
  const sub =
    mode === 'confirm' ? 'Pop in the code we emailed you.' : "Peeking to see if it's really you… 👀"
  const submitLabel =
    mode === 'sign-up'
      ? 'Create account ✨'
      : mode === 'confirm'
        ? 'Confirm code ✨'
        : 'Let me in ✨'

  return (
    <div
      className="grid min-h-screen place-items-center p-6"
      style={{
        background:
          'radial-gradient(1000px 600px at 15% 0%,#ffe3ee,transparent 55%),radial-gradient(900px 600px at 100% 100%,#ece2ff,transparent 55%),linear-gradient(160deg,#fff5f7,#f6ecff 60%,#eef4ff)',
      }}
    >
      <div className="grid w-full max-w-4xl overflow-hidden rounded-[32px] bg-white shadow-[0_30px_70px_-30px_rgba(255,93,143,0.5)] md:grid-cols-[1.1fr_0.9fr]">
        {/* Hero */}
        <div
          className="hidden flex-col items-center justify-center p-10 text-center md:flex"
          style={{ background: 'linear-gradient(160deg,#ffd6e6,#d9c8ff)' }}
        >
          <Mascot className="text-8xl" />
          <h2 className="mb-1.5 mt-3.5 text-2xl text-white drop-shadow-[0_2px_8px_rgba(255,93,143,0.4)]">
            Welcome to CloudCast
          </h2>
          <p className="max-w-[240px] text-sm text-white/95">
            Your clips are safe, sparkly, and waiting for you ♡
          </p>
        </div>

        {/* Form */}
        <div className="p-10">
          <div className="mb-6 flex gap-2">
            {(['sign-in', 'sign-up'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m)
                  setError(null)
                  setMessage(null)
                }}
                className={`flex-1 rounded-2xl py-2.5 text-sm font-bold transition ${
                  mode === m || (mode === 'confirm' && m === 'sign-up')
                    ? 'text-white shadow-[0_8px_18px_-8px_rgba(255,93,143,0.6)]'
                    : 'bg-[#f6eefc] text-sakura-ink-soft'
                }`}
                style={
                  mode === m || (mode === 'confirm' && m === 'sign-up')
                    ? { background: 'linear-gradient(120deg,#ff5d8f,#a78bfa)' }
                    : undefined
                }
              >
                {m === 'sign-in' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          <h1
            className="text-2xl"
            style={{
              background: 'linear-gradient(90deg,#ff5d8f,#a78bfa)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {heading}
          </h1>
          <p className="mb-5 mt-1 text-[13px] text-sakura-ink-soft">{sub}</p>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {mode !== 'confirm' && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-sakura-ink-soft">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="sk-input"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-sakura-ink-soft">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="sk-input pr-11"
                      placeholder="At least 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-base opacity-60"
                    >
                      👁
                    </button>
                  </div>
                </div>
              </>
            )}

            {mode === 'confirm' && (
              <div>
                <label className="mb-1.5 block text-xs font-bold text-sakura-ink-soft">
                  Verification code
                </label>
                <input
                  type="text"
                  required
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  className="sk-input"
                  placeholder="123456"
                />
              </div>
            )}

            {error && (
              <div className="rounded-2xl bg-sakura-fail/10 px-3.5 py-2.5 text-sm text-sakura-fail">
                {error}
              </div>
            )}
            {message && !error && (
              <div className="rounded-2xl bg-sakura-lav/10 px-3.5 py-2.5 text-sm text-sakura-lav">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="sk-btn sk-btn-primary w-full rounded-2xl py-3.5 text-base"
            >
              {busy ? 'One sec…' : submitLabel}
            </button>
          </form>

          {mode === 'confirm' && (
            <button
              className="mt-4 text-[13px] font-bold text-sakura-pink-deep"
              onClick={() => setMode('sign-in')}
            >
              ← Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default AuthPage
