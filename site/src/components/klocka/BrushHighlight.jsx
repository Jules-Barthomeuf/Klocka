export default function BrushHighlight({ children, progress = 1 }) {
  return (
    <span className="relative isolate inline-block px-[0.08em]">
      <svg aria-hidden="true" className="absolute left-[-0.12em] right-[-0.12em] top-[18%] h-[78%] w-[calc(100%+0.24em)] -z-10 overflow-visible" viewBox="0 0 400 100" preserveAspectRatio="none" style={{ clipPath: `inset(-30% ${100 - progress * 100}% -30% -5%)`, transition: "clip-path 300ms var(--k-ease)" }}>
        <defs>
          <filter id="k-brush" x="-10%" y="-30%" width="120%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.02 0.35" numOctaves="3" seed="4" />
            <feDisplacementMap in="SourceGraphic" scale="14" />
          </filter>
        </defs>
        <g filter="url(#k-brush)">
          <path d="M8 30 C 90 14, 250 12, 394 22 L 388 78 C 260 90, 120 92, 14 82 Z" fill="#8DAEAA" opacity="0.55" />
        </g>
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}
