/** Initials from an email's name part: "alex.kim@…" -> "AK". */
export function initials(email?: string | null): string {
  const name = (email ?? '').split('@')[0]
  const parts = name.split(/[._\-+\s]+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)
  return letters.toUpperCase() || 'ME'
}
