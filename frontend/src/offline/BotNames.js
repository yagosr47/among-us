import { PLAYER_COLORS } from '../utils/colors.js';

const BOT_NAME_POOL = [
    'Nova',
    'Apollo',
    'Kira',
    'Orion',
    'Pixel',
    'Vega',
    'Zeta',
    'Echo',
    'Blaze',
    'Luna',
    'Cobalt',
    'Sable',
    'Mochi',
    'Titan',
    'Rook',
    'Nyx',
];

export function generateBotRoster(count, excludeName = '', excludeColor = '') {
    const usedNames = new Set([String(excludeName).trim().toLowerCase()]);
    const usedColors = new Set([String(excludeColor).trim().toLowerCase()]);

    const shuffledNames = [...BOT_NAME_POOL].sort(() => Math.random() - 0.5);
    const availableColors = PLAYER_COLORS.map((c) => c.hex)
        .filter((hex) => !usedColors.has(hex.toLowerCase()))
        .sort(() => Math.random() - 0.5);

    const roster = [];
    for (let i = 0; i < count; i++) {
        const name = shuffledNames.find((n) => !usedNames.has(n.toLowerCase())) || `Bot${i + 1}`;
        usedNames.add(name.toLowerCase());

        const color = availableColors[i] || PLAYER_COLORS[(i + 3) % PLAYER_COLORS.length].hex;
        roster.push({
            id: `bot-${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
            name,
            color,
            isBot: true,
        });
    }
    return roster;
}
