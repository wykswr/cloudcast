type TopbarProps = {
  title: string
  subtitle?: string
  search?: string
  onSearchChange?: (value: string) => void
  onUpload?: () => void
}

function Topbar({ title, subtitle, search, onSearchChange, onUpload }: TopbarProps) {
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-4 border-b border-[#ffe3ee] px-7 py-4"
      style={{ background: 'rgba(251,243,248,0.85)', backdropFilter: 'blur(8px)' }}
    >
      <div className="min-w-0">
        <b className="block font-display text-xl text-sakura-ink">{title}</b>
        {subtitle && (
          <span className="text-[13px] text-sakura-ink-soft">{subtitle}</span>
        )}
      </div>

      {onSearchChange && (
        <div className="relative ml-auto w-full max-w-md">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50">
            🔍
          </span>
          <input
            value={search ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search your clips..."
            className="sk-input rounded-full py-2.5 pl-9"
          />
        </div>
      )}

      {onUpload && (
        <button
          className={`sk-btn sk-btn-primary ${onSearchChange ? '' : 'ml-auto'}`}
          onClick={onUpload}
        >
          ＋ Upload
        </button>
      )}
    </div>
  )
}

export default Topbar
