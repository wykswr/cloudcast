type MascotProps = {
  /** Tailwind font-size class, e.g. "text-6xl". */
  className?: string
  /** Disable the idle bob (useful inline in buttons). */
  still?: boolean
}

/** Nimbus the CloudCast mascot. Emoji placeholder — swap for real art later. */
function Mascot({ className = 'text-6xl', still = false }: MascotProps) {
  return (
    <span
      role="img"
      aria-label="CloudCast mascot"
      className={`${className} ${still ? '' : 'sk-bob'}`}
    >
      ☁️
    </span>
  )
}

export default Mascot
