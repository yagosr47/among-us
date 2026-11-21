export const PLAYER_COLORS = [
    { hex: '#c51111', name: 'Red', shadow: '#7a0838' },
    { hex: '#132ed1', name: 'Blue', shadow: '#09158e' },
    { hex: '#117f2d', name: 'Green', shadow: '#0a4d2e' },
    { hex: '#ed54ba', name: 'Pink', shadow: '#ab2bad' },
    { hex: '#ef7d0d', name: 'Orange', shadow: '#b33e15' },
    { hex: '#f5f557', name: 'Yellow', shadow: '#c28722' },
    { hex: '#3f474e', name: 'Black', shadow: '#1e1f26' },
    { hex: '#d6e0f0', name: 'White', shadow: '#8394bf' },
    { hex: '#6b2fbc', name: 'Purple', shadow: '#3b177c' },
    { hex: '#71491e', name: 'Brown', shadow: '#5e2615' },
    { hex: '#38fedc', name: 'Cyan', shadow: '#24a8be' },
    { hex: '#50ef39', name: 'Lime', shadow: '#15a742' },
];

export const PLAYER_COLOR_HEXES = PLAYER_COLORS.map((c) => c.hex);

export function getRandomColor() {
    return PLAYER_COLOR_HEXES[Math.floor(Math.random() * PLAYER_COLOR_HEXES.length)];
}

export function getColorMeta(hex) {
    if (!hex) return PLAYER_COLORS[0];
    return (
        PLAYER_COLORS.find((c) => c.hex.toLowerCase() === String(hex).toLowerCase()) || {
            hex,
            name: 'Custom',
            shadow: '#1e1f26',
        }
    );
}
