// R52: the brand artwork: the logo's six puzzle pieces (W O N D E R), scattered and tilted, as crisp SVG.

/** One jigsaw piece, 80 × 80 body with a knob on top and on the right (drawn in a 100 × 100 box). */
const PIECE = "M0 20 H28 a12 12 0 1 1 24 0 H80 V48 a12 12 0 1 1 0 24 V100 H0 Z";

const PIECES = [
  { ch: "W", c: "#E3262C", x: 6, y: 34, r: -12 },
  { ch: "O", c: "#F28C1E", x: 112, y: 6, r: 8 },
  { ch: "N", c: "#6CB33F", x: 214, y: 40, r: -6 },
  { ch: "D", c: "#F7C820", x: 30, y: 156, r: 10 },
  { ch: "E", c: "#1FA5DE", x: 140, y: 128, r: -9 },
  { ch: "R", c: "#6C2D91", x: 236, y: 168, r: 12 },
];

export function PuzzleArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 290" className={className} role="img" aria-label="Wonder puzzle pieces">
      <defs>
        <filter id="pz-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#1e0d30" floodOpacity="0.28" />
        </filter>
      </defs>
      {PIECES.map((p) => (
        <g key={p.ch} transform={`translate(${p.x} ${p.y}) rotate(${p.r} 50 60)`} filter="url(#pz-shadow)">
          <path d={PIECE} fill={p.c} stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
          <text
            x="40"
            y="74"
            textAnchor="middle"
            fontFamily="var(--font-quicksand), sans-serif"
            fontWeight="700"
            fontSize="40"
            fill="#fff"
          >
            {p.ch}
          </text>
        </g>
      ))}
    </svg>
  );
}
