export function Logo({ size = 40 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-navy-600 to-navy-950 shadow-inner"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 48 48" width={size * 0.62} height={size * 0.62} fill="none">
        <path
          d="M8 22L24 10L40 22"
          stroke="var(--color-gold-500)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M12 22V16H17V22" stroke="var(--color-gold-500)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function LogoLockup() {
  return (
    <div className="flex items-center gap-3">
      <Logo size={40} />
      <div className="leading-tight">
        <p className="text-sm font-bold tracking-tight text-navy-950">
          PETS<span className="text-gold-600">&amp;</span>PETS
        </p>
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Cats Hotel &amp; Clinic</p>
      </div>
    </div>
  );
}
