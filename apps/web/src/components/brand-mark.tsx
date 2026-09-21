/** The BodyTag roundel: a livery panel number-badge, standing in for a logo. Reused in the header, footer, and favicon. */
export function BrandRoundel({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="BodyTag">
      <circle cx="24" cy="24" r="22" fill="var(--ink)" stroke="var(--paper)" strokeWidth="1.5" />
      <path d="M2.6 30 A22 22 0 0 1 30 2.6 L44 16.6 A22 22 0 0 1 16.6 44 Z" fill="var(--accent)" />
      <circle cx="24" cy="24" r="22" fill="none" stroke="var(--paper)" strokeWidth="1.5" />
    </svg>
  );
}

export function BrandWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display text-2xl leading-none tracking-tight uppercase ${className}`}>BodyTag</span>
  );
}
