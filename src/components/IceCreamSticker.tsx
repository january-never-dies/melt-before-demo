interface IceCreamStickerProps {
  item: "cone" | "bar";
  size?: number;
  state?: "good" | "soft" | "melted";
  showShadow?: boolean;
}

export function IceCreamSticker({
  item,
  size = 72,
  state = "good",
  showShadow = true,
}: IceCreamStickerProps) {
  const opacity = state === "soft" ? 0.76 : 1;
  const translateY = state === "soft" ? 2 : 0;

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      style={{ display: "block", maxWidth: "100%", overflow: "hidden" }}
    >
      {showShadow && <ellipse cx="48" cy="82" rx="23" ry="5" fill="#191F28" opacity="0.08" />}
      {state === "melted" ? (
        <MeltedSticker item={item} />
      ) : (
        <g opacity={opacity} transform={`translate(0 ${translateY})`}>
          {item === "cone" ? <ConeSticker state={state} /> : <BarSticker state={state} />}
        </g>
      )}
    </svg>
  );
}

function MeltedSticker({ item }: { item: "cone" | "bar" }) {
  return (
    <g>
      <path
        d="M27 76C31 69 40 69 47 72C53 68 64 70 69 76C66 82 57 84 48 82C39 85 30 82 27 76Z"
        fill="#FF8FB3"
        opacity="0.42"
      />
      {item === "cone" ? (
        <path d="M41 47L58 69L49 75L41 47Z" fill="#E9BD73" opacity="0.34" transform="rotate(18 49 61)" />
      ) : (
        <path d="M46 51H52V75C52 78 51 80 49 80C47 80 46 78 46 75V51Z" fill="#D9A85F" opacity="0.48" />
      )}
      <circle cx="37" cy="74" r="3" fill="#FFC0D4" opacity="0.8" />
    </g>
  );
}

function ConeSticker({ state }: { state: "good" | "soft" | "melted" }) {
  return (
    <g transform="translate(4 -1) scale(2)">
      <defs>
        <clipPath id="cone-waffle-clip">
          <path d="M14.5 21.5H29.5L22 38.5L14.5 21.5Z" />
        </clipPath>
      </defs>
      <path d="M13 20H31L22 41L13 20Z" fill="#E9BD73" />
      <path
        d="M13 20L30 33M12 23L28 36M12 26L26 38M12 29L24 40M31 20L14 33M32 23L16 36M32 26L18 38M32 29L20 40"
        clipPath="url(#cone-waffle-clip)"
        stroke="#F6D79F"
        strokeWidth="0.55"
        strokeLinecap="round"
        opacity="0.82"
      />
      <path
        d="M13 20H31L22 41L13 20Z"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M10 18.5C10 11.5 15.3 6 22 6C28.7 6 34 11.5 34 18.5C34 21.6 31.2 23.7 28.3 22.7C26.5 22.1 24.6 22.1 22.9 22.7L22 23L21.1 22.7C19.4 22.1 17.5 22.1 15.7 22.7C12.8 23.7 10 21.6 10 18.5Z"
        fill="#FF8FB3"
        stroke="#FFFFFF"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="13" r="2.2" fill="#FFFFFF" opacity="0.65" />
      {state === "melted" && <path d="M29 22C31 26 30 30 28 33" stroke="#FF8FB3" strokeWidth="3" strokeLinecap="round" />}
    </g>
  );
}

function BarSticker({ state }: { state: "good" | "soft" | "melted" }) {
  const bodyBottom = state === "good" ? 62 : state === "soft" ? 66 : 69;
  return (
    <g transform="translate(5.76 5.76) scale(0.88)">
      <path
        d="M44 59H53V79C53 83 51 86 48.5 86C46 86 44 83 44 79V59Z"
        fill="#D9A85F"
        stroke="#FFFFFF"
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <path d="M46.5 61H49V80" stroke="#F2CE91" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      <path
        d={`M28 25C28 13 37 6 48 6C59 6 68 13 68 25V${bodyBottom - 7}C68 ${bodyBottom} 63 ${bodyBottom + 5} 56 ${bodyBottom + 5}H40C33 ${bodyBottom + 5} 28 ${bodyBottom} 28 ${bodyBottom - 7}V25Z`}
        fill="#FF8FB3"
        stroke="#FFFFFF"
        strokeWidth="4"
      />
      <path d="M37 16C34 22 34 33 35 40" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" opacity="0.48" />
      {state === "soft" && <path d="M63 54C67 60 65 66 62 69" stroke="#FF8FB3" strokeWidth="6" strokeLinecap="round" />}
      {state === "melted" && <path d="M62 52C67 60 65 70 59 74" stroke="#FF8FB3" strokeWidth="7" strokeLinecap="round" />}
    </g>
  );
}
