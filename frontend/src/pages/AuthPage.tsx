import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  confirmResetPassword,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  signIn,
  signUp,
} from 'aws-amplify/auth'
import Logo from '../components/common/Logo'
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronLeftIcon,
  EyeIcon,
  EyeOffIcon,
  FilmIcon,
  LockIcon,
  MailIcon,
  SpinnerIcon,
  UploadIcon,
} from '../components/common/icons'
import { useAuth } from '../context/auth-context'
import { formatError } from '../utils/format'
import {
  STRENGTH_LABELS,
  isValidEmail,
  passwordRules,
  passwordScore,
  sanitizeCode,
} from '../utils/validation'
import type { AuthMode } from '../types'

const RESEND_SECONDS = 30
const BAR_COLORS = ['#d9d9d3', '#c0341d', '#c2620a', '#2b4bee', '#13744a']

const HEADINGS: Record<AuthMode, { title: string; sub: string }> = {
  'sign-in': { title: 'Welcome back', sub: 'Sign in to see your videos.' },
  'sign-up': {
    title: 'Create your account',
    sub: 'Keep your videos in one private place and watch them anywhere.',
  },
  confirm: { title: 'Check your email', sub: 'Enter the 6-digit code we sent to' },
  forgot: {
    title: 'Reset your password',
    sub: 'Enter your email and we’ll send you a code to choose a new password.',
  },
  reset: { title: 'Choose a new password', sub: 'Enter the 6-digit code we sent to' },
}

function useCountdown() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (seconds <= 0) return
    const timer = window.setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [seconds])
  return [seconds, setSeconds] as const
}

function PasswordField({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  placeholder: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="field pr-12"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="icon-btn absolute top-1 right-1 size-10"
      >
        {visible ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
      </button>
    </div>
  )
}

function PasswordStrength({ password }: { password: string }) {
  const score = passwordScore(password)
  return (
    <div className="flex flex-col gap-2.5 pt-1">
      <div className="flex items-center gap-2.5">
        <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-1 rounded-full"
              style={{ background: i < score ? BAR_COLORS[score] : '#e4e4df' }}
            />
          ))}
        </div>
        <span
          className="min-w-[58px] text-right text-xs font-semibold text-ink-2"
          aria-live="polite"
        >
          {STRENGTH_LABELS[score]}
        </span>
      </div>
      <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-1.5 p-0">
        {passwordRules(password).map((rule) => (
          <li
            key={rule.label}
            className={`flex items-center gap-1.5 text-[13px] ${rule.ok ? 'text-good' : 'text-ink-3'}`}
          >
            {rule.ok ? (
              <CheckIcon className="size-3.5" strokeWidth={2.6} />
            ) : (
              <span className="grid size-3.5 place-items-center" aria-hidden>
                <span className="size-2.5 rounded-full border-2 border-current" />
              </span>
            )}
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Six boxes over one real input, so paste and one-time-code autofill work. */
function CodeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [focused, setFocused] = useState(false)
  return (
    <div className="relative">
      <div aria-hidden className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }, (_, i) => {
          const active = focused && i === Math.min(value.length, 5)
          return (
            <div
              key={i}
              className={`grid h-14 place-items-center rounded-[10px] bg-white font-display text-2xl font-semibold ${
                active
                  ? 'border-2 border-accent ring-4 ring-accent/15'
                  : value[i]
                    ? 'border border-ink'
                    : 'border border-[#d9d9d3]'
              }`}
            >
              {value[i] ?? ''}
            </div>
          )
        })}
      </div>
      <input
        id="auth-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        value={value}
        onChange={(event) => onChange(sanitizeCode(event.target.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 size-full cursor-text opacity-0"
      />
    </div>
  )
}

function Feature({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2 text-[13px] text-night-muted">
      <span className="text-night-ink">{icon}</span>
      <span>
        <b className="font-semibold text-night-ink">{title}</b>
        <br />
        {body}
      </span>
    </div>
  )
}

function Hero() {
  return (
    <aside className="flex flex-col gap-6 rounded-b-none bg-[#101216] px-5 pt-6 pb-7 text-night-ink md:flex-[1_1_520px] md:justify-between md:gap-12 md:px-14 md:py-12">
      <Logo />
      {/* Product glimpse: a player card with upload and ready notices. */}
      <div className="relative hidden w-full max-w-[520px] self-center md:block">
        <div className="rounded-2xl border border-night-line bg-night-panel p-3.5">
          <div className="relative aspect-video overflow-hidden rounded-[10px] bg-[linear-gradient(180deg,#3b4a63_0_58%,#22303f_58%)]">
            <span className="absolute top-[30%] left-[22%] size-14 rounded-full bg-[#e9b872]" />
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-linear-to-t from-black/55 to-transparent px-3.5 py-3">
              <FilmIcon className="size-[18px]" />
              <div className="h-1 flex-1 rounded-full bg-white/25">
                <div className="h-full w-[38%] rounded-full bg-white" />
              </div>
              <span className="font-tabular text-xs">1:42 / 4:30</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-1 pt-3 pb-0.5">
            <span className="text-sm font-semibold">Lisbon rooftop timelapse</span>
            <span className="text-xs text-night-muted">Uploaded today</span>
          </div>
        </div>
        <div className="absolute -top-5 -right-4 flex items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 text-[13px] text-ink shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
          <UploadIcon className="size-[18px] text-accent" />
          <div>
            <div className="font-semibold">Uploading · 68%</div>
            <div className="text-xs text-ink-3">2.9 GB of 4.2 GB</div>
          </div>
        </div>
        <div className="absolute bottom-14 -left-4 flex items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 text-[13px] font-semibold text-ink shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
          <span className="size-2 rounded-full bg-good" />
          Ready to watch
        </div>
      </div>
      <div className="flex gap-2.5 md:hidden" aria-hidden>
        <div className="relative aspect-[16/10] flex-[1.4] rounded-[10px] bg-[linear-gradient(180deg,#e8b98a_0_60%,#8c5a45_60%)]">
          <span className="absolute top-[20%] left-[22%] aspect-square w-[18%] rounded-full bg-[#fff1d6]" />
        </div>
        <div className="flex flex-1 flex-col gap-2.5">
          <div className="flex-1 rounded-[10px] bg-[linear-gradient(180deg,#7fb3d0_0_60%,#1f5e7a_60%)]" />
          <div className="flex-1 rounded-[10px] bg-[linear-gradient(180deg,#c9d6df_0_60%,#7a6a5b_60%)]" />
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <h2 className="m-0 font-display text-[22px] leading-tight font-semibold tracking-[-0.02em] md:text-4xl">
          Your videos.
          <br className="hidden md:block" /> Streamed anywhere.
        </h2>
        <div className="hidden grid-cols-3 gap-4 md:grid">
          <Feature
            icon={<UploadIcon className="size-5" />}
            title="Big files welcome"
            body="Uploads pick up where they left off"
          />
          <Feature
            icon={<FilmIcon className="size-5" />}
            title="Plays everywhere"
            body="Smooth on phone, tablet or laptop"
          />
          <Feature
            icon={<LockIcon className="size-5" />}
            title="Private by default"
            body="Only you can see your videos"
          />
        </div>
      </div>
    </aside>
  )
}

function AuthPage() {
  const { refreshUser } = useAuth()
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resendIn, setResendIn] = useCountdown()

  const emailOk = isValidEmail(email)
  const strongPassword = passwordScore(password) === 4
  const emailInvalid = touched && !emailOk
  const needsCode = mode === 'confirm' || mode === 'reset'
  const choosingPassword = mode === 'sign-up' || mode === 'reset'

  const go = (next: AuthMode, message: string | null = null) => {
    setMode(next)
    setError(null)
    setNotice(message)
    setTouched(false)
    if (next === 'confirm' || next === 'reset') setCode('')
  }

  const valid =
    mode === 'sign-in'
      ? emailOk && password.length > 0
      : mode === 'sign-up'
        ? emailOk && strongPassword
        : mode === 'forgot'
          ? emailOk
          : mode === 'confirm'
            ? code.length === 6
            : code.length === 6 && strongPassword

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setTouched(true)
    if (!valid) return
    setError(null)
    setNotice(null)
    setBusy(true)
    const username = email.trim()
    try {
      if (mode === 'sign-in') {
        const result = await signIn({ username, password })
        if (result.isSignedIn) {
          await refreshUser()
        } else if (result.nextStep.signInStep === 'CONFIRM_SIGN_UP') {
          await resendSignUpCode({ username })
          setResendIn(RESEND_SECONDS)
          go('confirm', 'Confirm your email to finish setting up your account.')
        } else {
          setError('This account needs an extra sign-in step we don’t support yet.')
        }
      } else if (mode === 'sign-up') {
        await signUp({
          username,
          password,
          options: { userAttributes: { email: username }, autoSignIn: { enabled: false } },
        })
        setResendIn(RESEND_SECONDS)
        go('confirm')
      } else if (mode === 'confirm') {
        await confirmSignUp({ username, confirmationCode: code })
        setPassword('')
        go('sign-in', 'Email confirmed. Sign in to continue.')
      } else if (mode === 'forgot') {
        await resetPassword({ username })
        setPassword('')
        setResendIn(RESEND_SECONDS)
        go('reset')
      } else {
        await confirmResetPassword({ username, confirmationCode: code, newPassword: password })
        setPassword('')
        go('sign-in', 'Password changed. Sign in with your new password.')
      }
    } catch (err) {
      setError(formatError(err))
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setError(null)
    try {
      if (mode === 'confirm') await resendSignUpCode({ username: email.trim() })
      else await resetPassword({ username: email.trim() })
      setCode('')
      setResendIn(RESEND_SECONDS)
      setNotice('We sent you a new code.')
    } catch (err) {
      setError(formatError(err))
    }
  }

  const heading = HEADINGS[mode]
  const submitLabel = busy
    ? mode === 'sign-up'
      ? 'Creating account…'
      : mode === 'forgot'
        ? 'Sending code…'
        : 'Checking…'
    : {
        'sign-in': 'Sign in',
        'sign-up': 'Create account',
        confirm: 'Confirm email',
        forgot: 'Send code',
        reset: 'Change password',
      }[mode]
  const submitDisabled = busy || (needsCode && code.length < 6)

  return (
    <div className="flex min-h-screen flex-col bg-canvas md:flex-row md:flex-wrap">
      <Hero />

      <main className="flex flex-1 items-start justify-center px-5 py-7 md:flex-[1_1_440px] md:px-6 md:pt-[max(48px,12vh)] md:pb-12">
        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex w-full max-w-[400px] flex-col gap-6"
        >
          {mode === 'sign-in' || mode === 'sign-up' ? (
            <div
              role="tablist"
              aria-label="Account"
              className="grid grid-cols-2 gap-1 rounded-xl bg-fill p-1"
            >
              {(
                [
                  ['sign-in', 'Sign in'],
                  ['sign-up', 'Create account'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => go(value)}
                  className={`h-11 rounded-[9px] text-sm font-semibold transition md:h-10 ${
                    mode === value
                      ? 'bg-white text-ink shadow-[0_1px_3px_rgba(20,22,26,0.12)]'
                      : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => go(mode === 'confirm' ? 'sign-up' : 'sign-in')}
              className="-ml-2 flex h-11 items-center gap-1 self-start rounded-[10px] pr-2.5 pl-1.5 text-[15px] font-semibold text-ink hover:bg-hover"
            >
              <ChevronLeftIcon />
              Back
            </button>
          )}

          {needsCode ? (
            <span className="grid size-12 place-items-center rounded-[14px] bg-accent-soft text-accent">
              <MailIcon className="size-6" />
            </span>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 font-display text-[26px] font-semibold tracking-[-0.02em] md:text-[30px]">
              {heading.title}
            </h1>
            <p className="m-0 text-[15px] leading-normal text-ink-2">
              {heading.sub}
              {needsCode ? <b className="font-semibold text-ink"> {email.trim()}</b> : null}
            </p>
          </div>

          {notice ? (
            <div
              role="status"
              className="flex items-center gap-2.5 rounded-[10px] bg-good-soft px-3.5 py-3 text-sm font-medium text-good"
            >
              <CheckIcon className="size-[18px] shrink-0" />
              {notice}
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="rounded-[10px] bg-bad-soft px-3.5 py-3 text-sm text-bad">
              {error}
            </div>
          ) : null}

          {!needsCode ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-email" className="label">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => email && setTouched(true)}
                aria-invalid={emailInvalid}
                aria-describedby={emailInvalid ? 'auth-email-error' : undefined}
                placeholder="you@example.com"
                className={`field ${emailInvalid ? 'field-invalid' : ''}`}
              />
              {emailInvalid ? (
                <span id="auth-email-error" className="text-[13px] text-bad">
                  Enter a valid email address.
                </span>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <label htmlFor="auth-code" className="label">
                Verification code
              </label>
              <CodeInput value={code} onChange={setCode} />
              <div className="flex min-h-11 items-center text-sm text-ink-3">
                {resendIn > 0 ? (
                  <span>You can ask for a new code in 0:{String(resendIn).padStart(2, '0')}</span>
                ) : (
                  <span>
                    Didn’t get it?{' '}
                    <button
                      type="button"
                      onClick={() => void resend()}
                      className="h-11 px-1 font-semibold text-accent"
                    >
                      Send a new code
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}

          {mode === 'sign-in' || choosingPassword ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <label htmlFor="auth-password" className="label">
                  {mode === 'reset' ? 'New password' : 'Password'}
                </label>
                {mode === 'sign-in' ? (
                  <button
                    type="button"
                    onClick={() => go('forgot')}
                    className="text-[13px] font-medium text-accent hover:text-accent-hover"
                  >
                    Forgot password?
                  </button>
                ) : null}
              </div>
              <PasswordField
                id="auth-password"
                value={password}
                onChange={setPassword}
                autoComplete={choosingPassword ? 'new-password' : 'current-password'}
                placeholder={choosingPassword ? 'Create a strong password' : 'Your password'}
              />
              {mode === 'sign-in' && touched && !password ? (
                <span className="text-[13px] text-bad">Enter your password.</span>
              ) : null}
              {choosingPassword ? <PasswordStrength password={password} /> : null}
            </div>
          ) : null}

          <button
            type="submit"
            className="btn btn-primary h-[52px] text-[15px]"
            disabled={submitDisabled}
          >
            {busy ? <SpinnerIcon /> : null}
            {submitLabel}
            {!busy && mode === 'sign-in' ? <ArrowRightIcon /> : null}
          </button>

          <p className="m-0 flex items-center justify-center gap-1.5 text-center text-[13px] text-ink-3">
            <LockIcon className="size-3.5" />
            Your account and videos stay private
          </p>
        </form>
      </main>
    </div>
  )
}

export default AuthPage
