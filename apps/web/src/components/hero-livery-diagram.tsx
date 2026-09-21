const ZONES = [
  { n: "01", name: "Chest center", status: "sold" as const, price: "$4,200", cx: 210, cy: 195 },
  { n: "02", name: "Chest, left", status: "sold" as const, price: "$1,850", cx: 158, cy: 172 },
  { n: "03", name: "Chest, right", status: "open" as const, price: "$1,850", cx: 262, cy: 172 },
  { n: "04", name: "Sleeve, left", status: "open" as const, price: "$950", cx: 84, cy: 178 },
  { n: "05", name: "Sleeve, right", status: "sold" as const, price: "$950", cx: 336, cy: 178 },
  { n: "06", name: "Hem band", status: "ending" as const, price: "$2,100", cx: 210, cy: 408 },
  { n: "07", name: "Collar tab", status: "open" as const, price: "$600", cx: 210, cy: 96 },
];

const STATUS_LABEL: Record<(typeof ZONES)[number]["status"], string> = {
  sold: "Sold",
  open: "Open",
  ending: "Ending soon",
};

/**
 * The product's core mechanism, drawn once: a garment "flat" (the technical diagram kit
 * suppliers already use for sponsor placement) with numbered, priced, status-tagged zones.
 * Illustrative — not a real campaign; labelled as such beside the diagram.
 */
export function HeroLiveryDiagram() {
  return (
    <svg viewBox="0 0 420 520" className="h-auto w-full max-w-md" role="img" aria-labelledby="livery-diagram-title">
      <title id="livery-diagram-title">Sample slot map on a walking-billboard jacket, numbered 01 through 07</title>
      <defs>
        <clipPath id="torso-clip">
          <polygon points="150,70 270,70 292,462 128,462" />
        </clipPath>
      </defs>

      {/* sleeves */}
      <polygon
        points="150,75 58,110 32,254 96,260 140,186"
        fill="var(--panel)"
        stroke="var(--line)"
        strokeWidth="1.5"
      />
      <polygon
        points="270,75 362,110 388,254 324,260 280,186"
        fill="var(--panel)"
        stroke="var(--line)"
        strokeWidth="1.5"
      />

      {/* torso */}
      <polygon points="150,70 270,70 292,462 128,462" fill="var(--panel)" stroke="var(--line)" strokeWidth="1.5" />

      {/* zone fills, clipped to the torso so hand-set rects never leak past the seam */}
      <g clipPath="url(#torso-clip)">
        <rect x="176" y="150" width="68" height="92" fill="var(--accent)" opacity="0.92" />
        <rect x="132" y="148" width="34" height="52" fill="var(--accent)" opacity="0.92" />
        <rect x="254" y="148" width="34" height="52" fill="none" stroke="var(--paper)" strokeWidth="1.5" strokeDasharray="4 4" />
        <rect x="128" y="384" width="164" height="44" fill="none" stroke="var(--signal)" strokeWidth="2" strokeDasharray="6 4" />
        <polygon points="188,70 232,70 210,102" fill="var(--ink)" />
        <rect x="192" y="82" width="36" height="18" fill="none" stroke="var(--paper)" strokeWidth="1.5" />
      </g>

      {/* sleeve fills */}
      <polygon points="150,75 58,110 32,254 96,260 140,186" fill="none" stroke="var(--paper)" strokeWidth="1.5" strokeDasharray="4 4" />
      <polygon points="270,75 362,110 388,254 324,260 280,186" fill="var(--accent)" opacity="0.92" />

      {/* seams */}
      <polygon points="150,70 270,70 292,462 128,462" fill="none" stroke="var(--ink)" strokeWidth="2" />
      <polygon points="150,75 58,110 32,254 96,260 140,186" fill="none" stroke="var(--ink)" strokeWidth="2" />
      <polygon points="270,75 362,110 388,254 324,260 280,186" fill="none" stroke="var(--ink)" strokeWidth="2" />

      {/* roundel badges */}
      {ZONES.map((z) => (
        <g key={z.n}>
          <circle cx={z.cx} cy={z.cy} r="15" fill="var(--ink)" stroke="var(--paper)" strokeWidth="1.5" />
          <text
            x={z.cx}
            y={z.cy}
            textAnchor="middle"
            dominantBaseline="central"
            className="figures"
            fontSize="12"
            fill={z.status === "sold" ? "var(--accent)" : "var(--paper)"}
          >
            {z.n}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function HeroLiverySheet() {
  return (
    <ul className="figures divide-y divide-line border border-line text-sm">
      {ZONES.map((z) => (
        <li key={z.n} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="flex items-center gap-3">
            <span className="text-muted">{z.n}</span>
            <span className="font-sans text-paper">{z.name}</span>
          </span>
          <span className="flex items-center gap-3">
            <span
              className={
                z.status === "sold" ? "text-accent" : z.status === "ending" ? "text-signal" : "text-muted"
              }
            >
              {STATUS_LABEL[z.status]}
            </span>
            <span className="w-16 text-right text-paper">{z.price}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
