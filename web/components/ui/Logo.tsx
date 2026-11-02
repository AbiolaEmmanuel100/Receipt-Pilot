export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0f766e" />
      <text x="16" y="22" textAnchor="middle" fontSize="16" fontFamily="Arial, sans-serif" fontWeight="700" fill="#fff">R</text>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={"inline-flex items-center gap-2 font-extrabold tracking-tight text-navy " + (className || "")}>
      <LogoMark />
      <span className="text-[19px]">Receipt <span className="text-brand">Pilot</span></span>
    </span>
  );
}
