import { getColorMeta } from '../utils/colors.js';

/**
 * Crisp animated SVG Crewmate avatar tinted accurately to any Among Us color.
 */
export function CrewmateAvatar({
    color = '#c51111',
    size = 48,
    dead = false,
    ghost = false,
    className = '',
    flip = false,
}) {
    const meta = getColorMeta(color);
    const bodyColor = meta.hex;
    const shadowColor = meta.shadow;

    return (
        <svg
            viewBox="0 0 110 130"
            width={size}
            height={Math.round((size * 130) / 110)}
            className={className}
            style={{
                transform: flip ? 'scaleX(-1)' : undefined,
                opacity: ghost ? 0.6 : dead ? 0.5 : 1,
                filter: dead ? 'grayscale(0.55)' : undefined,
            }}
            aria-hidden="true"
        >
            {/* Backpack */}
            <rect
                x="10"
                y="45"
                width="20"
                height="48"
                rx="9"
                fill={shadowColor}
                stroke="#0a0d14"
                strokeWidth="5"
            />
            <rect x="13" y="49" width="14" height="16" rx="6" fill={bodyColor} />

            {/* Main Bean Body */}
            <path
                d="M28,44 C28,16 44,10 60,10 C80,10 92,22 92,46 L92,98 C92,107 85,114 76,114 L70,114 L70,98 L54,98 L54,114 L42,114 C33,114 28,107 28,98 Z"
                fill={shadowColor}
                stroke="#0a0d14"
                strokeWidth="5"
                strokeLinejoin="round"
            />
            {/* Highlight Primary Body */}
            <path
                d="M32,44 C32,20 46,14 60,14 C78,14 88,24 88,46 L88,76 C88,88 72,92 56,92 C40,92 32,82 32,68 Z"
                fill={bodyColor}
            />

            {/* Visor */}
            <rect
                x="48"
                y="28"
                width="48"
                height="28"
                rx="13"
                fill="#529bb5"
                stroke="#0a0d14"
                strokeWidth="5"
            />
            <rect x="53" y="32" width="38" height="18" rx="9" fill="#9be0f2" />
            <ellipse cx="78" cy="37" rx="9" ry="4" fill="#ffffff" opacity="0.88" />

            {/* Dead X Mark */}
            {dead && (
                <g stroke="#ef4444" strokeWidth="7" strokeLinecap="round">
                    <line x1="25" y1="22" x2="90" y2="96" />
                    <line x1="90" y1="22" x2="25" y2="96" />
                </g>
            )}
        </svg>
    );
}

export default CrewmateAvatar;
