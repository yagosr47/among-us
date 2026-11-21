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
