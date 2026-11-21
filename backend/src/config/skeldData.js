export const GAME_CONSTANTS = {
    KILL_RANGE: 245,
    KILL_COOLDOWN_MS: 15000,
    INITIAL_KILL_COOLDOWN_MS: 10000,
    REPORT_RANGE: 215,
    EMERGENCY_RANGE: 165,
    TASK_RANGE: 125,
    VENT_RANGE: 105,
    MEETING_DURATION_MS: 45000,
    EJECTION_DELAY_MS: 3800,
    TASKS_PER_PLAYER: 4,
    MAX_PLAYERS_PER_ROOM: 10,
};

export const KILL_DISTANCE_MAP = {
    short: 175,
    medium: 255,
    long: 345,
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

export const EMERGENCY_BUTTON_POS = { x: 1689, y: 378 };

export const LOBBY_SPAWNS = [
    { x: 475, y: 415 },
    { x: 765, y: 415 },
    { x: 445, y: 515 },
    { x: 795, y: 515 },
    { x: 560, y: 540 },
    { x: 680, y: 540 },
    { x: 515, y: 345 },
    { x: 725, y: 345 },
    { x: 395, y: 455 },
    { x: 835, y: 455 },
];

export const CAFETERIA_SPAWNS = [
    { x: 1689, y: 275 },
    { x: 1790, y: 300 },
    { x: 1835, y: 378 },
    { x: 1790, y: 460 },
    { x: 1689, y: 490 },
    { x: 1588, y: 460 },
    { x: 1540, y: 378 },
    { x: 1588, y: 300 },
    { x: 1635, y: 285 },
    { x: 1745, y: 285 },
];

export const SKELD_TASKS = [
    { id: 'admin-card', type: 'swipeCard', title: 'Swipe Card', room: 'Admin', x: 2115, y: 985 },
    { id: 'medbay-scan', type: 'medbayScan', title: 'Submit Scan', room: 'MedBay', x: 1200, y: 774 },
    { id: 'electrical-wires', type: 'fixWiring', title: 'Fix Wiring', room: 'Electrical', x: 1146, y: 1056 },
    { id: 'weapons-asteroids', type: 'asteroids', title: 'Clear Asteroids', room: 'Weapons', x: 2310, y: 390 },
    { id: 'reactor-manifolds', type: 'manifolds', title: 'Unlock Manifolds', room: 'Reactor', x: 384, y: 630 },
    { id: 'cafeteria-garbage', type: 'garbage', title: 'Empty Chute', room: 'Cafeteria', x: 1920, y: 150 },
    { id: 'shields-prime', type: 'shields', title: 'Prime Shields', room: 'Shields', x: 2370, y: 1265 },
    { id: 'nav-chart', type: 'chartCourse', title: 'Chart Course', room: 'Navigation', x: 2814, y: 726 },
];

export const SKELD_VENTS = [
    { id: 'vent-cafeteria', label: 'Cafeteria', x: 1998, y: 495, targets: ['vent-admin', 'vent-hall'] },
    { id: 'vent-admin', label: 'Admin', x: 1950, y: 1035, targets: ['vent-cafeteria', 'vent-hall'] },
    { id: 'vent-hall', label: 'Corridor', x: 1700, y: 810, targets: ['vent-cafeteria', 'vent-admin'] },
    { id: 'vent-medbay', label: 'MedBay', x: 1080, y: 774, targets: ['vent-security', 'vent-elec'] },
    { id: 'vent-security', label: 'Security', x: 870, y: 825, targets: ['vent-medbay', 'vent-elec'] },
    { id: 'vent-elec', label: 'Electrical', x: 1110, y: 1056, targets: ['vent-medbay', 'vent-security'] },
    { id: 'vent-upper-eng', label: 'Upper Engine', x: 675, y: 255, targets: ['vent-reactor-top'] },
    { id: 'vent-reactor-top', label: 'Reactor (N)', x: 390, y: 575, targets: ['vent-upper-eng'] },
    { id: 'vent-lower-eng', label: 'Lower Engine', x: 675, y: 1275, targets: ['vent-reactor-bot'] },
    { id: 'vent-reactor-bot', label: 'Reactor (S)', x: 390, y: 935, targets: ['vent-lower-eng'] },
    { id: 'vent-weapons', label: 'Weapons', x: 2310, y: 210, targets: ['vent-nav'] },
    { id: 'vent-nav', label: 'Navigation', x: 2745, y: 660, targets: ['vent-weapons', 'vent-shields'] },
    { id: 'vent-shields', label: 'Shields', x: 2370, y: 1295, targets: ['vent-nav'] },
];
