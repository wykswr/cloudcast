const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim())
}

export type PasswordRule = { label: string; ok: boolean }

/** The account password policy, as a checklist shown while someone types a new password. */
export function passwordRules(password: string): PasswordRule[] {
  return [
    { label: '8+ characters', ok: password.length >= 8 },
    { label: 'A number', ok: /\d/.test(password) },
    { label: 'Upper & lowercase', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'A symbol', ok: /[^A-Za-z0-9]/.test(password) },
  ]
}

export const STRENGTH_LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'] as const

/** 0-4: how many password rules pass. */
export function passwordScore(password: string): number {
  return passwordRules(password).filter((rule) => rule.ok).length
}

/** Keeps only digits, at most `length` of them, for one-time codes. */
export function sanitizeCode(value: string, length = 6): string {
  return value.replace(/\D/g, '').slice(0, length)
}
