import Image from 'next/image';

export type ProductImageProps = {
  brand?: string
  nl1: string        // name line 1 for SVG label
  nl2?: string       // name line 2
  volume?: string
  bc?: string        // body color
  ac?: string        // accent/top-band color
  type?: 'tube' | 'canister'
  variant?: 'front' | 'angle' | 'label'
  imageUrl?: string  // real photo URL — takes priority over SVG
}

/* ─── Tube front view ─────────────────────────────────────────── */
function TubeFront({ brand, nl1, nl2, volume, bc = '#4A6080', ac = '#2A4060' }: ProductImageProps) {
  return (
    <svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg"
         style={{ height: '100%', width: 'auto', display: 'block' }}>
      {/* ground shadow */}
      <ellipse cx="100" cy="289" rx="50" ry="8" fill="rgba(0,0,0,0.07)" />
      {/* bottom crimp */}
      <rect x="63" y="258" width="74" height="12" rx="4" fill="#9AA0AC" />
      <rect x="67" y="261" width="66" height="5"  rx="2" fill="#B0B6C0" />
      {/* tube body */}
      <rect x="58" y="68" width="84" height="193" rx="13" fill={bc} />
      {/* accent top band */}
      <rect x="58" y="68" width="84" height="70"  rx="13" fill={ac} />
      <rect x="58" y="118" width="84" height="20"         fill={ac} />
      {/* left highlight */}
      <rect x="62" y="76" width="12" height="178" rx="6" fill="rgba(255,255,255,0.13)" />
      {/* right shadow */}
      <rect x="130" y="76" width="10" height="178" rx="5" fill="rgba(0,0,0,0.17)" />
      {/* label */}
      <rect x="63" y="148" width="74" height="86" rx="6" fill="white" opacity="0.95" />
      <text x="100" y="165" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="8"
            fontWeight="bold" fill="#555" letterSpacing="1.5">{brand ?? 'BRAND'}</text>
      <rect x="68" y="169" width="64" height="0.7" fill="#E0E0E0" />
      <text x="100" y="184" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="10"
            fontWeight="bold" fill="#1A2840">{nl1}</text>
      {nl2 && <text x="100" y="198" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="11"
            fontWeight="bold" fill="#1A2840">{nl2}</text>}
      <text x="100" y={nl2 ? 218 : 208} textAnchor="middle" fontFamily="Arial,sans-serif"
            fontSize="9" fill="#999">{volume}</text>
      {/* nozzle */}
      <rect x="78" y="44" width="44" height="26" rx="7" fill="#58687A" />
      <polygon points="85,44 115,44 109,26 91,26" fill="#68788A" />
      <rect x="91" y="12" width="18" height="15" rx="5" fill="#485868" />
    </svg>
  )
}

/* ─── Tube angled view ─────────────────────────────────────────── */
function TubeAngle({ brand, nl1, nl2, volume, bc = '#4A6080', ac = '#2A4060' }: ProductImageProps) {
  return (
    <svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg"
         style={{ height: '100%', width: 'auto', display: 'block' }}>
      <g transform="rotate(-9 100 165)">
        <ellipse cx="100" cy="289" rx="46" ry="7" fill="rgba(0,0,0,0.08)" />
        <rect x="63" y="257" width="74" height="12" rx="4" fill="#9AA0AC" />
        <rect x="58" y="68" width="84" height="192" rx="13" fill={bc} />
        <rect x="58" y="68" width="84" height="70"  rx="13" fill={ac} />
        <rect x="58" y="118" width="84" height="20"         fill={ac} />
        <rect x="62" y="76" width="14" height="175" rx="7" fill="rgba(255,255,255,0.18)" />
        <rect x="128" y="76" width="12" height="175" rx="6" fill="rgba(0,0,0,0.22)" />
        <rect x="63" y="148" width="74" height="86" rx="6" fill="white" opacity="0.95" />
        <text x="100" y="165" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="8"
              fontWeight="bold" fill="#555" letterSpacing="1.5">{brand ?? 'BRAND'}</text>
        <rect x="68" y="169" width="64" height="0.7" fill="#E0E0E0" />
        <text x="100" y="184" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="10"
              fontWeight="bold" fill="#1A2840">{nl1}</text>
        {nl2 && <text x="100" y="198" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="11"
              fontWeight="bold" fill="#1A2840">{nl2}</text>}
        <text x="100" y={nl2 ? 218 : 208} textAnchor="middle" fontFamily="Arial,sans-serif"
              fontSize="9" fill="#999">{volume}</text>
        <rect x="78" y="44" width="44" height="26" rx="7" fill="#58687A" />
        <polygon points="85,44 115,44 109,26 91,26" fill="#68788A" />
        <rect x="91" y="12" width="18" height="15" rx="5" fill="#485868" />
      </g>
    </svg>
  )
}

/* ─── Tube label close-up (zoomed in on label area) ───────────── */
function TubeLabel({ brand, nl1, nl2, volume, bc = '#4A6080', ac = '#2A4060' }: ProductImageProps) {
  return (
    <svg viewBox="35 138 130 106" xmlns="http://www.w3.org/2000/svg"
         style={{ height: '100%', width: 'auto', display: 'block' }}>
      {/* tube body behind label */}
      <rect x="58" y="68" width="84" height="193" rx="13" fill={bc} />
      <rect x="58" y="68" width="84" height="70"  rx="13" fill={ac} />
      <rect x="58" y="118" width="84" height="20"         fill={ac} />
      <rect x="62" y="76" width="12" height="178" rx="6" fill="rgba(255,255,255,0.13)" />
      <rect x="130" y="76" width="10" height="178" rx="5" fill="rgba(0,0,0,0.17)" />
      {/* label */}
      <rect x="63" y="148" width="74" height="86" rx="6" fill="white" opacity="0.97" />
      <text x="100" y="165" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="8"
            fontWeight="bold" fill="#555" letterSpacing="1.5">{brand ?? 'BRAND'}</text>
      <rect x="68" y="169" width="64" height="0.7" fill="#E0E0E0" />
      <text x="100" y="184" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="10"
            fontWeight="bold" fill="#1A2840">{nl1}</text>
      {nl2 && <text x="100" y="198" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="11"
            fontWeight="bold" fill="#1A2840">{nl2}</text>}
      <text x="100" y={nl2 ? 218 : 208} textAnchor="middle" fontFamily="Arial,sans-serif"
            fontSize="9" fill="#999">{volume}</text>
    </svg>
  )
}

/* ─── Canister front view ──────────────────────────────────────── */
function CanisterFront({ brand, nl1, nl2, volume, bc = '#1A3A6A', ac = '#3A80C0' }: ProductImageProps) {
  return (
    <svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg"
         style={{ height: '100%', width: 'auto', display: 'block' }}>
      <ellipse cx="100" cy="289" rx="55" ry="9" fill="rgba(0,0,0,0.09)" />
      {/* body */}
      <rect x="43" y="92" width="114" height="170" rx="20" fill={bc} />
      {/* top dome */}
      <ellipse cx="100" cy="92" rx="57" ry="18" fill={ac} />
      {/* bottom rim shadow */}
      <ellipse cx="100" cy="262" rx="57" ry="14" fill="rgba(0,0,0,0.22)" />
      {/* left highlight */}
      <rect x="48" y="103" width="14" height="148" rx="7" fill="rgba(255,255,255,0.11)" />
      {/* right shadow */}
      <rect x="138" y="103" width="14" height="148" rx="7" fill="rgba(0,0,0,0.18)" />
      {/* label */}
      <rect x="50" y="150" width="100" height="92" rx="6" fill="white" opacity="0.95" />
      <text x="100" y="169" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="9"
            fontWeight="bold" fill="#555" letterSpacing="1.5">{brand}</text>
      <rect x="55" y="173" width="90" height="0.7" fill="#E0E0E0" />
      <text x="100" y="188" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="10"
            fontWeight="bold" fill="#1A2840">{nl1}</text>
      {nl2 && <text x="100" y="202" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="10"
            fontWeight="bold" fill="#1A2840">{nl2}</text>}
      <text x="100" y={nl2 ? 222 : 212} textAnchor="middle" fontFamily="Arial,sans-serif"
            fontSize="9" fill="#999">{volume}</text>
      {/* valve cap */}
      <circle cx="100" cy="70" r="14" fill="#788898" />
      <circle cx="100" cy="70" r="8"  fill="#606878" />
      {/* straw applicator */}
      <rect x="93" y="12" width="14" height="60" rx="5" fill="#9AAABB" />
      <rect x="95" y="10" width="10" height="6"  rx="2" fill="#7A8898" />
    </svg>
  )
}

/* ─── Canister angled view ─────────────────────────────────────── */
function CanisterAngle({ brand, nl1, nl2, volume, bc = '#1A3A6A', ac = '#3A80C0' }: ProductImageProps) {
  return (
    <svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg"
         style={{ height: '100%', width: 'auto', display: 'block' }}>
      <g transform="rotate(-10 100 172)">
        <ellipse cx="100" cy="289" rx="50" ry="8" fill="rgba(0,0,0,0.08)" />
        <rect x="43" y="92" width="114" height="170" rx="20" fill={bc} />
        <ellipse cx="100" cy="92"  rx="57" ry="18" fill={ac} />
        <ellipse cx="100" cy="262" rx="57" ry="14" fill="rgba(0,0,0,0.22)" />
        <rect x="48" y="103" width="16" height="148" rx="8" fill="rgba(255,255,255,0.15)" />
        <rect x="136" y="103" width="16" height="148" rx="8" fill="rgba(0,0,0,0.22)" />
        <rect x="50" y="150" width="100" height="92" rx="6" fill="white" opacity="0.95" />
        <text x="100" y="169" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="9"
              fontWeight="bold" fill="#555" letterSpacing="1.5">{brand}</text>
        <rect x="55" y="173" width="90" height="0.7" fill="#E0E0E0" />
        <text x="100" y="188" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="10"
              fontWeight="bold" fill="#1A2840">{nl1}</text>
        {nl2 && <text x="100" y="202" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="10"
              fontWeight="bold" fill="#1A2840">{nl2}</text>}
        <text x="100" y={nl2 ? 222 : 212} textAnchor="middle" fontFamily="Arial,sans-serif"
              fontSize="9" fill="#999">{volume}</text>
        <circle cx="100" cy="70" r="14" fill="#788898" />
        <rect x="93" y="12" width="14" height="60" rx="5" fill="#9AAABB" />
      </g>
    </svg>
  )
}

/* ─── Public export ────────────────────────────────────────────── */
export default function ProductImage({
  type = 'tube',
  variant = 'front',
  imageUrl,
  ...rest
}: ProductImageProps) {
  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt={rest.nl1}
        width={400}
        height={400}
        quality={90}
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 40vw, 500px"
        style={{ height: '100%', width: '100%', objectFit: 'contain', display: 'block' }}
        loading="lazy"
      />
    );
  }
  if (type === 'canister') {
    return variant === 'angle'
      ? <CanisterAngle type={type} variant={variant} {...rest} />
      : <CanisterFront type={type} variant={variant} {...rest} />
  }
  if (variant === 'angle') return <TubeAngle  type={type} variant={variant} {...rest} />
  if (variant === 'label') return <TubeLabel  type={type} variant={variant} {...rest} />
  return <TubeFront type={type} variant={variant} {...rest} />
}
