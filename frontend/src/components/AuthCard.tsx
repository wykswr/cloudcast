import type { ChangeEvent, FormEvent } from 'react'
import type { AuthMode } from '../types'

type AuthCardProps = {
  mode: AuthMode
  authForm: { email: string; password: string }
  confirmCode: string
  error?: string | null
  message?: string | null
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onAuthFormChange: (changes: Partial<{ email: string; password: string }>) => void
  onConfirmCodeChange: (value: string) => void
  onSwitchMode: (mode: AuthMode) => void
}

function AuthCard({
  mode,
  authForm,
  confirmCode,
  error,
  message,
  onSubmit,
  onAuthFormChange,
  onConfirmCodeChange,
  onSwitchMode,
}: AuthCardProps) {
  const handleInputChange =
    (field: 'email' | 'password') =>
      (event: ChangeEvent<HTMLInputElement>) => {
        onAuthFormChange({ [field]: event.target.value })
      }

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 shadow-2xl shadow-sky-900/20">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-sky-200">
            Cognito
          </p>
          <h2 className="text-xl font-semibold text-white">
            {mode === 'sign-up'
              ? 'Create your account'
              : mode === 'confirm'
                ? 'Confirm your code'
                : 'Sign in'}
          </h2>
        </div>
        <span className="rounded-full bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-100">
          Secure
        </span>
      </div>

      <form className="space-y-3" onSubmit={onSubmit}>
        {mode !== 'confirm' && (
          <>
            <label className="block text-sm text-slate-200">
              Email
              <input
                type="email"
                required
                value={authForm.email}
                onChange={handleInputChange('email')}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500/60"
                placeholder="you@example.com"
              />
            </label>
            <label className="block text-sm text-slate-200">
              Password
              <input
                type="password"
                required
                value={authForm.password}
                onChange={handleInputChange('password')}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500/60"
                placeholder="At least 8 characters"
              />
            </label>
          </>
        )}

        {mode === 'confirm' && (
          <label className="block text-sm text-slate-200">
            Verification code
            <input
              type="text"
              required
              value={confirmCode}
              onChange={(event) => onConfirmCodeChange(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-2 ring-transparent transition focus:ring-sky-500/60"
              placeholder="123456"
            />
          </label>
        )}

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </div>
        )}
        {message && !error && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
            {message}
          </div>
        )}

        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:from-sky-400 hover:to-cyan-300"
        >
          {mode === 'sign-up'
            ? 'Create account'
            : mode === 'confirm'
              ? 'Confirm code'
              : 'Sign in'}
        </button>
      </form>

      <div className="mt-4 text-xs text-slate-300">
        {mode === 'sign-in' && (
          <button
            className="font-semibold text-sky-200 hover:text-sky-100"
            onClick={() => onSwitchMode('sign-up')}
          >
            Need an account? Create one
          </button>
        )}
        {mode === 'sign-up' && (
          <button
            className="font-semibold text-sky-200 hover:text-sky-100"
            onClick={() => onSwitchMode('sign-in')}
          >
            I already have an account
          </button>
        )}
        {mode === 'confirm' && (
          <button
            className="font-semibold text-sky-200 hover:text-sky-100"
            onClick={() => onSwitchMode('sign-in')}
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  )
}

export default AuthCard
