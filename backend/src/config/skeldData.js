export const GAME_CONSTANTS = {
    KILL_RANGE: 95,
    KILL_COOLDOWN_MS: 15000,
    INITIAL_KILL_COOLDOWN_MS: 10000,
    REPORT_RANGE: 90,
    EMERGENCY_RANGE: 75,
    TASK_RANGE: 55,
    VENT_RANGE: 48,
    MEETING_DURATION_MS: 45000,
    EJECTION_DELAY_MS: 3800,
    TASKS_PER_PLAYER: 4,
    MAX_PLAYERS_PER_ROOM: 10,
};

export const KILL_DISTANCE_MAP = {
    short: 70,
    medium: 95,
    long: 125,
};

export const VALID_REGIONS = ['SA', 'NA', 'EU', 'AS'];

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
};

const ALLOWED_ENUMS = {
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
};

function pickAllowed(value, allowed, fallback) {
    if (allowed.includes(value)) return value;
    const num = Number(value);
    if (!Number.isNaN(num) && allowed.includes(num)) return num;
    return fallback;
}

/**
 * Sanitize and clamp incoming room settings patch
 * @param {Partial<typeof DEFAULT_ROOM_SETTINGS>} patch
 * @param {typeof DEFAULT_ROOM_SETTINGS} current
 */
export function sanitizeRoomSettings(patch = {}, current = DEFAULT_ROOM_SETTINGS) {
    const base = { ...DEFAULT_ROOM_SETTINGS, ...(current || {}) };
    if (!patch || typeof patch !== 'object') return base;

    return {
        map: 'The Skeld',
        impostorCount: pickAllowed(patch.impostorCount, ALLOWED_ENUMS.impostorCount, base.impostorCount),
        confirmEjects:
            typeof patch.confirmEjects === 'boolean' ? patch.confirmEjects : base.confirmEjects,
        emergencyMeetings: pickAllowed(
            patch.emergencyMeetings,
            ALLOWED_ENUMS.emergencyMeetings,
            base.emergencyMeetings
        ),
        emergencyCooldownSec: pickAllowed(
            patch.emergencyCooldownSec,
            ALLOWED_ENUMS.emergencyCooldownSec,
            base.emergencyCooldownSec
        ),
        meetingDurationSec: pickAllowed(
            patch.meetingDurationSec,
            ALLOWED_ENUMS.meetingDurationSec,
            base.meetingDurationSec
        ),
        anonymousVotes:
            typeof patch.anonymousVotes === 'boolean' ? patch.anonymousVotes : base.anonymousVotes,
        playerSpeed: pickAllowed(patch.playerSpeed, ALLOWED_ENUMS.playerSpeed, base.playerSpeed),
        crewVision: pickAllowed(patch.crewVision, ALLOWED_ENUMS.crewVision, base.crewVision),
        impostorVision: pickAllowed(
            patch.impostorVision,
            ALLOWED_ENUMS.impostorVision,
            base.impostorVision
        ),
        killCooldownSec: pickAllowed(
            patch.killCooldownSec,
            ALLOWED_ENUMS.killCooldownSec,
            base.killCooldownSec
        ),
        killDistance: pickAllowed(patch.killDistance, ALLOWED_ENUMS.killDistance, base.killDistance),
        tasksPerPlayer: pickAllowed(
            patch.tasksPerPlayer,
            ALLOWED_ENUMS.tasksPerPlayer,
            base.tasksPerPlayer
        ),
    };
}

export const EMERGENCY_BUTTON_POS = { x: 563, y: 118 };

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
