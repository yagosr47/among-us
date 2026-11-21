export const SKELD_CONSTANTS = {
    KILL_RANGE: 95,
    KILL_COOLDOWN_MS: 15000,
    INITIAL_KILL_COOLDOWN_MS: 10000,
    REPORT_RANGE: 85,
    EMERGENCY_RANGE: 75,
    TASK_RANGE: 55,
    VENT_RANGE: 48,
    LAPTOP_RANGE: 135,
};

export const KILL_DISTANCE_MAP = {
    short: 70,
    medium: 95,
    long: 125,
};

export const REGION_OPTIONS = [
    { id: 'SA', label: 'South America', flag: '🇧🇷' },
    { id: 'NA', label: 'North America', flag: '🇺🇸' },
    { id: 'EU', label: 'Europe', flag: '🇪🇺' },
    { id: 'AS', label: 'Asia', flag: '🇯🇵' },
];

export const DEFAULT_ROOM_SETTINGS = {
    map: 'The Skeld',
    impostorCount: 1,
    confirmEjects: true,
    emergencyMeetings: 1,
    emergencyCooldownSec: 15,
    meetingDurationSec: 45,
    anonymousVotes: false,
    playerSpeed: 1.0,
    crewVision: 1.0,
    impostorVision: 1.25,
    killCooldownSec: 15,
    killDistance: 'medium',
    tasksPerPlayer: 4,
    // Offline mode settings
    botCount: 7,
    botDifficulty: 'normal',
    preferredRole: 'random',
};

export const SETTING_OPTIONS = {
    impostorCount: [1, 2, 3],
    emergencyMeetings: [1, 2, 3, 5, 9],
    emergencyCooldownSec: [10, 15, 20, 30],
    meetingDurationSec: [15, 30, 45, 60, 90, 120],
    playerSpeed: [0.75, 1.0, 1.25, 1.5, 1.75, 2.0],
    crewVision: [0.5, 0.75, 1.0, 1.25, 1.5],
    impostorVision: [0.75, 1.0, 1.25, 1.5, 1.75, 2.0],
    killCooldownSec: [10, 15, 20, 25, 30, 45],
    killDistance: ['short', 'medium', 'long'],
    tasksPerPlayer: [2, 3, 4, 5, 6, 8],
    botCount: [3, 4, 5, 6, 7, 8, 9],
    botDifficulty: ['casual', 'normal', 'hard'],
    preferredRole: ['random', 'crewmate', 'impostor'],
};

function pickAllowed(val, list, fallback) {
    if (list.includes(val)) return val;
    const num = Number(val);
    if (!Number.isNaN(num) && list.includes(num)) return num;
    return fallback;
}

export function sanitizeRoomSettings(patch = {}, current = DEFAULT_ROOM_SETTINGS) {
    const base = { ...DEFAULT_ROOM_SETTINGS, ...(current || {}) };
    if (!patch || typeof patch !== 'object') return base;
    return {
        map: 'The Skeld',
        impostorCount: pickAllowed(patch.impostorCount, SETTING_OPTIONS.impostorCount, base.impostorCount),
        confirmEjects: typeof patch.confirmEjects === 'boolean' ? patch.confirmEjects : base.confirmEjects,
        emergencyMeetings: pickAllowed(patch.emergencyMeetings, SETTING_OPTIONS.emergencyMeetings, base.emergencyMeetings),
        emergencyCooldownSec: pickAllowed(patch.emergencyCooldownSec, SETTING_OPTIONS.emergencyCooldownSec, base.emergencyCooldownSec),
        meetingDurationSec: pickAllowed(patch.meetingDurationSec, SETTING_OPTIONS.meetingDurationSec, base.meetingDurationSec),
        anonymousVotes: typeof patch.anonymousVotes === 'boolean' ? patch.anonymousVotes : base.anonymousVotes,
        playerSpeed: pickAllowed(patch.playerSpeed, SETTING_OPTIONS.playerSpeed, base.playerSpeed),
        crewVision: pickAllowed(patch.crewVision, SETTING_OPTIONS.crewVision, base.crewVision),
        impostorVision: pickAllowed(patch.impostorVision, SETTING_OPTIONS.impostorVision, base.impostorVision),
        killCooldownSec: pickAllowed(patch.killCooldownSec, SETTING_OPTIONS.killCooldownSec, base.killCooldownSec),
        killDistance: pickAllowed(patch.killDistance, SETTING_OPTIONS.killDistance, base.killDistance),
        tasksPerPlayer: pickAllowed(patch.tasksPerPlayer, SETTING_OPTIONS.tasksPerPlayer, base.tasksPerPlayer),
        botCount: pickAllowed(patch.botCount, SETTING_OPTIONS.botCount, base.botCount),
        botDifficulty: pickAllowed(patch.botDifficulty, SETTING_OPTIONS.botDifficulty, base.botDifficulty),
        preferredRole: pickAllowed(patch.preferredRole, SETTING_OPTIONS.preferredRole, base.preferredRole),
    };
}

export const LOBBY_LAPTOP_POS = { x: 645, y: 385 };

export const LOBBY_SPAWNS = [
    { x: 460, y: 300 },
    { x: 520, y: 300 },
    { x: 720, y: 300 },
    { x: 460, y: 520 },
    { x: 560, y: 520 },
    { x: 680, y: 520 },
    { x: 760, y: 520 },
    { x: 520, y: 420 },
    { x: 720, y: 420 },
    { x: 615, y: 540 },
];

export const CAFETERIA_SPAWNS = [
    { x: 535, y: 92 },
    { x: 590, y: 92 },
    { x: 602, y: 118 },
    { x: 590, y: 145 },
    { x: 535, y: 145 },
    { x: 522, y: 118 },
    { x: 560, y: 78 },
    { x: 560, y: 162 },
    { x: 495, y: 115 },
    { x: 630, y: 115 },
];

export const EMERGENCY_BUTTON_POS = { x: 563, y: 118 };

export const SKELD_TASKS = [
    { id: 'admin-card', type: 'swipeCard', title: 'Swipe Card', room: 'Admin', x: 676, y: 300 },
    { id: 'medbay-scan', type: 'medbayScan', title: 'Submit Scan', room: 'MedBay', x: 424, y: 224 },
    { id: 'electrical-wires', type: 'fixWiring', title: 'Fix Wiring', room: 'Electrical', x: 408, y: 352 },
    { id: 'weapons-asteroids', type: 'asteroids', title: 'Clear Asteroids', room: 'Weapons', x: 766, y: 98 },
    { id: 'reactor-manifolds', type: 'manifolds', title: 'Unlock Manifolds', room: 'Reactor', x: 108, y: 224 },
    { id: 'cafeteria-garbage', type: 'garbage', title: 'Empty Chute', room: 'Cafeteria', x: 640, y: 48 },
    { id: 'shields-prime', type: 'shields', title: 'Prime Shields', room: 'Shields', x: 770, y: 384 },
    { id: 'nav-chart', type: 'chartCourse', title: 'Chart Course', room: 'Navigation', x: 942, y: 232 },
];

export const SKELD_ROOMS = [
    { name: 'Cafeteria', x1: 440, y1: 15, x2: 695, y2: 220 },
    { name: 'Weapons', x1: 710, y1: 35, x2: 830, y2: 145 },
    { name: 'O2', x1: 655, y1: 155, x2: 755, y2: 245 },
    { name: 'Navigation', x1: 880, y1: 175, x2: 990, y2: 295 },
    { name: 'Shields', x1: 715, y1: 325, x2: 835, y2: 455 },
    { name: 'Communications', x1: 605, y1: 390, x2: 715, y2: 505 },
    { name: 'Storage', x1: 465, y1: 280, x2: 590, y2: 495 },
    { name: 'Admin', x1: 595, y1: 245, x2: 725, y2: 345 },
    { name: 'Electrical', x1: 360, y1: 255, x2: 460, y2: 395 },
    { name: 'Lower Engine', x1: 135, y1: 300, x2: 260, y2: 430 },
    { name: 'Security', x1: 265, y1: 175, x2: 345, y2: 290 },
    { name: 'Reactor', x1: 70, y1: 150, x2: 170, y2: 320 },
    { name: 'Upper Engine', x1: 135, y1: 55, x2: 260, y2: 175 },
    { name: 'MedBay', x1: 340, y1: 130, x2: 450, y2: 245 },
];

export function getRoomNameAt(x, y) {
    const match = SKELD_ROOMS.find(
        (r) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2
    );
    return match ? match.name : 'Hallway';
}

export const SKELD_VENTS = [
    { id: 'vent-cafeteria', label: 'Cafeteria', x: 656, y: 175, targets: ['vent-admin', 'vent-hall'] },
    { id: 'vent-admin', label: 'Admin', x: 646, y: 290, targets: ['vent-cafeteria', 'vent-hall'] },
    { id: 'vent-hall', label: 'Corridor', x: 568, y: 232, targets: ['vent-cafeteria', 'vent-admin'] },
    { id: 'vent-medbay', label: 'MedBay', x: 360, y: 224, targets: ['vent-security', 'vent-elec'] },
    { id: 'vent-security', label: 'Security', x: 314, y: 260, targets: ['vent-medbay', 'vent-elec'] },
    { id: 'vent-elec', label: 'Electrical', x: 392, y: 344, targets: ['vent-medbay', 'vent-security'] },
    { id: 'vent-upper-eng', label: 'Upper Engine', x: 182, y: 86, targets: ['vent-reactor-top'] },
    { id: 'vent-reactor-top', label: 'Reactor (N)', x: 122, y: 206, targets: ['vent-upper-eng'] },
    { id: 'vent-lower-eng', label: 'Lower Engine', x: 195, y: 344, targets: ['vent-reactor-bot'] },
    { id: 'vent-reactor-bot', label: 'Reactor (S)', x: 122, y: 274, targets: ['vent-lower-eng'] },
    { id: 'vent-weapons', label: 'Weapons', x: 754, y: 72, targets: ['vent-nav'] },
    { id: 'vent-nav', label: 'Navigation', x: 924, y: 214, targets: ['vent-weapons', 'vent-shields'] },
    { id: 'vent-shields', label: 'Shields', x: 760, y: 412, targets: ['vent-nav'] },
];
