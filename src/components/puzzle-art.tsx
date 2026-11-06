// R52: the brand artwork: six children each holding up one of the logo's puzzle pieces, spelling W O N D E R.
// Plain SVG, so it stays sharp at any size.

/** One jigsaw piece, 80 × 80 body with a knob on top and on the right (drawn in a 100 × 100 box). */
const PIECE = "M0 20 H28 a12 12 0 1 1 24 0 H80 V48 a12 12 0 1 1 0 24 V100 H0 Z";

const HAIR = "#2B1A12";
const KIDS = [
  { ch: "W", c: "#E3262C", skin: "#E8B48A", shirt: "#FFF4C2", hair: "boy", r: -6 },
  { ch: "O", c: "#F28C1E", skin: "#C68B59", shirt: "#E3F4FF", hair: "pigtails", r: 5 },
  { ch: "N", c: "#6CB33F", skin: "#D9A273", shirt: "#FDE7C4", hair: "bob", r: -4 },
  { ch: "D", c: "#F7C820", skin: "#B97A4B", shirt: "#F1E4FA", hair: "boy", r: 6 },
  { ch: "E", c: "#1FA5DE", skin: "#E8B48A", shirt: "#DDF5D5", hair: "pigtails", r: -5 },
  { ch: "R", c: "#6C2D91", skin: "#D9A273", shirt: "#FFE3E3", hair: "bob", r: 4 },
] as const;

function Kid({ k, x, y }: { k: (typeof KIDS)[number]; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* the piece, held up high */}
      <g transform={`rotate(${k.r} 50 50)`} filter="url(#pz-shadow)">
        <path d={PIECE} transform="translate(14 8) scale(0.72)" fill={k.c} stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
        <text x="43" y="72" textAnchor="middle" fontFamily="var(--font-quicksand), sans-serif" fontWeight="700" fontSize="34" fill="#fff">
          {k.ch}
        </text>
      </g>
      {/* arms up to the piece */}
      <path d="M36 182 Q22 136 26 80" stroke={k.skin} strokeWidth="10" strokeLinecap="round" fill="none" />
      <path d="M64 182 Q78 136 72 80" stroke={k.skin} strokeWidth="10" strokeLinecap="round" fill="none" />
      {/* legs and shoes */}
      <rect x="34" y="222" width="12" height="40" rx="6" fill={k.skin} />
      <rect x="54" y="222" width="12" height="40" rx="6" fill={k.skin} />
      <ellipse cx="38" cy="264" rx="11" ry="6" fill={k.c} />
      <ellipse cx="62" cy="264" rx="11" ry="6" fill={k.c} />
      {/* body */}
      <rect x="27" y="174" width="46" height="60" rx="16" fill={k.shirt} stroke="#ffffff" strokeOpacity="0.6" strokeWidth="2" />
      {/* hair behind the face */}
      {k.hair === "pigtails" ? (
        <>
          <circle cx="22" cy="152" r="10" fill={HAIR} />
          <circle cx="78" cy="152" r="10" fill={HAIR} />
          <circle cx="22" cy="152" r="3.5" fill={k.c} />
          <circle cx="78" cy="152" r="3.5" fill={k.c} />
        </>
      ) : null}
      {k.hair === "bob" ? <rect x="21" y="134" width="58" height="40" rx="18" fill={HAIR} /> : null}
      <circle cx="50" cy="146" r="28" fill={HAIR} />
      {/* face */}
      <circle cx="50" cy="153" r="25" fill={k.skin} />
      {k.hair === "boy" ? <path d="M27 146 Q38 128 56 134 Q68 128 74 146 Q62 136 50 140 Q38 136 27 146 Z" fill={HAIR} /> : null}
      {k.hair === "bob" ? <path d="M26 148 Q30 128 50 128 Q70 128 74 148 Q62 138 50 138 Q38 138 26 148 Z" fill={HAIR} /> : null}
      {k.hair === "bob" ? <circle cx="70" cy="132" r="6" fill={k.c} stroke="#fff" strokeWidth="2" /> : null}
      <circle cx="41" cy="152" r="3.2" fill={HAIR} />
      <circle cx="59" cy="152" r="3.2" fill={HAIR} />
      <circle cx="42" cy="151" r="1" fill="#fff" />
      <circle cx="60" cy="151" r="1" fill="#fff" />
      <circle cx="35" cy="161" r="4.5" fill="#FF7A8A" opacity="0.45" />
      <circle cx="65" cy="161" r="4.5" fill="#FF7A8A" opacity="0.45" />
      <path d="M42 162 Q50 171 58 162" stroke="#7A2E1C" strokeWidth="2.6" strokeLinecap="round" fill="#fff" />
      {/* hands on the piece */}
      <circle cx="26" cy="79" r="8" fill={k.skin} stroke="#fff" strokeOpacity="0.5" strokeWidth="1.5" />
      <circle cx="72" cy="79" r="8" fill={k.skin} stroke="#fff" strokeOpacity="0.5" strokeWidth="1.5" />
    </g>
  );
}

export function PuzzleArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 284" className={className} role="img" aria-label="Six children holding puzzle pieces that spell WONDER">
      <defs>
        <filter id="pz-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#1e0d30" floodOpacity="0.3" />
        </filter>
      </defs>
      {KIDS.map((k, i) => (
        <Kid key={k.ch} k={k} x={i * 100} y={i % 2 ? 14 : 0} />
      ))}
    </svg>
  );
}
