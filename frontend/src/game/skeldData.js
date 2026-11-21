export const SKELD_CONSTANTS = {
    KILL_RANGE: 90,
    KILL_COOLDOWN_MS: 15000,
    REPORT_RANGE: 85,
    EMERGENCY_RANGE: 70,
    TASK_RANGE: 50,
    VENT_RANGE: 45,
};

export const EMERGENCY_BUTTON_POS = { x: 563, y: 118 };

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
