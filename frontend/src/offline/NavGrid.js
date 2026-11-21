import { LOBBY_SPAWNS, SKELD_TASKS } from '../game/skeldData.js';

const cachedGrids = {};

export class NavGrid {
    constructor(width, height, tileWidth, tileHeight, rawData) {
        this.width = width;
        this.height = height;
        this.tileWidth = tileWidth;
        this.tileHeight = tileHeight;
        this.walkable = new Uint8Array(width * height);
        this.penalty = new Uint8Array(width * height);

        for (let i = 0; i < width * height; i++) {
            const v = rawData[i];
            this.walkable[i] = v === 0 || v === -1 ? 1 : 0;
        }

        // Precompute soft wall-adjacency penalty so bots steer smoothly away from hugging edges
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (!this.walkable[idx]) continue;
                let nearWall = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        if (!this.isWalkableTile(x + dx, y + dy)) {
                            nearWall++;
                        }
                    }
                }
                this.penalty[idx] = nearWall > 0 ? Math.min(8, nearWall * 2) : 0;
            }
        }
    }

    isWalkableTile(tx, ty) {
        if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return false;
        return this.walkable[ty * this.width + tx] === 1;
    }

    isWalkableWorld(wx, wy) {
        const { tx, ty } = this.worldToTile(wx, wy);
        return this.isWalkableTile(tx, ty);
    }

    worldToTile(wx, wy) {
        return {
            tx: Math.max(0, Math.min(this.width - 1, Math.floor(wx / this.tileWidth))),
            ty: Math.max(0, Math.min(this.height - 1, Math.floor(wy / this.tileHeight))),
        };
    }

    tileToWorld(tx, ty) {
        return {
            x: (tx + 0.5) * this.tileWidth,
            y: (ty + 0.5) * this.tileHeight,
        };
    }

    findNearestWalkableTile(tx, ty, maxRadius = 10) {
        if (this.isWalkableTile(tx, ty)) return { tx, ty };
        for (let r = 1; r <= maxRadius; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    if (this.isWalkableTile(tx + dx, ty + dy)) {
                        return { tx: tx + dx, ty: ty + dy };
                    }
                }
            }
        }
        return null;
    }

    hasLineOfSight(ax, ay, bx, by, marginPx = 5) {
        const dist = Math.hypot(bx - ax, by - ay);
        const steps = Math.max(2, Math.ceil(dist / 6));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const px = ax + (bx - ax) * t;
            const py = ay + (by - ay) * t;
            if (!this.isWalkableWorld(px, py)) return false;
            if (marginPx > 0 && i > 0 && i < steps) {
                if (
                    !this.isWalkableWorld(px + marginPx, py) ||
                    !this.isWalkableWorld(px - marginPx, py) ||
                    !this.isWalkableWorld(px, py + marginPx) ||
                    !this.isWalkableWorld(px, py - marginPx)
                ) {
                    return false;
                }
            }
        }
        return true;
    }

    pickRandomWalkableNear(cx, cy, radiusPx = 55, tries = 10) {
        for (let i = 0; i < tries; i++) {
            const ang = Math.random() * Math.PI * 2;
            const r = (0.25 + Math.random() * 0.75) * radiusPx;
            const wx = cx + Math.cos(ang) * r;
            const wy = cy + Math.sin(ang) * r;
            if (this.isWalkableWorld(wx, wy) && this.hasLineOfSight(cx, cy, wx, wy, 4)) {
                return { x: Math.round(wx), y: Math.round(wy) };
            }
        }
        const t = this.findNearestWalkableTile(...Object.values(this.worldToTile(cx, cy)));
        return t ? this.tileToWorld(t.tx, t.ty) : { x: cx, y: cy };
    }

    findPath(startX, startY, goalX, goalY) {
        const s0 = this.worldToTile(startX, startY);
        const g0 = this.worldToTile(goalX, goalY);
        const start = this.findNearestWalkableTile(s0.tx, s0.ty);
        const goal = this.findNearestWalkableTile(g0.tx, g0.ty);
        if (!start || !goal) return [{ x: goalX, y: goalY }];

        const safeGoal =
            this.isWalkableWorld(goalX, goalY)
                ? { x: goalX, y: goalY }
                : this.tileToWorld(goal.tx, goal.ty);

        if (start.tx === goal.tx && start.ty === goal.ty) {
            return [safeGoal];
        }

        const total = this.width * this.height;
        const gScore = new Float32Array(total).fill(Infinity);
        const parent = new Int32Array(total).fill(-1);
        const closed = new Uint8Array(total);

        const startIdx = start.ty * this.width + start.tx;
        const goalIdx = goal.ty * this.width + goal.tx;
        gScore[startIdx] = 0;

        const heap = [];
        const push = (idx, f) => {
            heap.push({ idx, f });
            let i = heap.length - 1;
            while (i > 0) {
                const p = (i - 1) >> 1;
                if (heap[p].f <= heap[i].f) break;
                [heap[p], heap[i]] = [heap[i], heap[p]];
                i = p;
            }
        };
        const pop = () => {
            const top = heap[0];
            const last = heap.pop();
            if (heap.length > 0) {
                heap[0] = last;
                let i = 0;
                while (true) {
                    let s = i;
                    const l = 2 * i + 1;
                    const r = 2 * i + 2;
                    if (l < heap.length && heap[l].f < heap[s].f) s = l;
                    if (r < heap.length && heap[r].f < heap[s].f) s = r;
                    if (s === i) break;
                    [heap[s], heap[i]] = [heap[i], heap[s]];
                    i = s;
                }
            }
            return top;
        };

        const heuristic = (tx, ty) => Math.hypot(goal.tx - tx, goal.ty - ty);
        push(startIdx, heuristic(start.tx, start.ty));

        const dirs = [
            [1, 0, 1],
            [-1, 0, 1],
            [0, 1, 1],
            [0, -1, 1],
            [1, 1, 1.414],
            [-1, 1, 1.414],
            [1, -1, 1.414],
            [-1, -1, 1.414],
        ];

        let found = false;
        let iterations = 0;
        const maxIterations = total * 2;

        while (heap.length > 0 && iterations++ < maxIterations) {
            const { idx } = pop();
            if (closed[idx]) continue;
            if (idx === goalIdx) {
                found = true;
                break;
            }
            closed[idx] = 1;

            const cx = idx % this.width;
            const cy = Math.floor(idx / this.width);

            for (let d = 0; d < dirs.length; d++) {
                const [dx, dy, baseCost] = dirs[d];
                const nx = cx + dx;
                const ny = cy + dy;
                if (!this.isWalkableTile(nx, ny)) continue;

                if (dx !== 0 && dy !== 0) {
                    if (!this.isWalkableTile(cx + dx, cy) || !this.isWalkableTile(cx, cy + dy)) {
                        continue;
                    }
                }

                const nIdx = ny * this.width + nx;
                if (closed[nIdx]) continue;

                const stepCost = baseCost + this.penalty[nIdx] * 0.4;
                const tentativeG = gScore[idx] + stepCost;
                if (tentativeG < gScore[nIdx]) {
                    parent[nIdx] = idx;
                    gScore[nIdx] = tentativeG;
                    push(nIdx, tentativeG + heuristic(nx, ny));
                }
            }
        }

        if (!found) {
            return [safeGoal];
        }

        const rawTiles = [];
        let cur = goalIdx;
        while (cur !== -1 && cur !== startIdx) {
            rawTiles.push({
                tx: cur % this.width,
                ty: Math.floor(cur / this.width),
            });
            cur = parent[cur];
        }
        rawTiles.reverse();

        if (rawTiles.length === 0) return [safeGoal];

        const worldPts = rawTiles.map((t) => this.tileToWorld(t.tx, t.ty));
        worldPts[worldPts.length - 1] = safeGoal;

        // String-pulling with clearance margin so paths glide organically around corners
        const smoothed = [];
        let anchor = { x: startX, y: startY };
        let i = 0;
        while (i < worldPts.length) {
            let furthest = i;
            for (let j = worldPts.length - 1; j > i; j--) {
                if (this.hasLineOfSight(anchor.x, anchor.y, worldPts[j].x, worldPts[j].y, 6)) {
                    furthest = j;
                    break;
                }
            }
            const nextPt = worldPts[furthest];
            smoothed.push(nextPt);
            anchor = nextPt;
            i = furthest + 1;
        }

        return smoothed;
    }

    /**
     * Produces a humanized non-linear path: splits long straight corridors with gentle
     * lateral lane shifts and subtle micro-curving so bots don't walk like ruler-guided trains.
     */
    findNaturalPath(startX, startY, goalX, goalY, { laneBias = 0, jitterPx = 14 } = {}) {
        const base = this.findPath(startX, startY, goalX, goalY);
        if (base.length === 0) return base;

        const out = [];
        let prev = { x: startX, y: startY };

        for (let i = 0; i < base.length; i++) {
            const pt = base[i];
            const segLen = Math.hypot(pt.x - prev.x, pt.y - prev.y);

            // Split long open stretches into subtle meandering sub-waypoints
            if (segLen > 160 && this.tileWidth >= 16) {
                const midX = (prev.x + pt.x) * 0.5;
                const midY = (prev.y + pt.y) * 0.5;
                const nx = -(pt.y - prev.y) / segLen;
                const ny = (pt.x - prev.x) / segLen;
                const shift = (laneBias * 0.65 + (Math.random() - 0.5)) * jitterPx;
                const candX = midX + nx * shift;
                const candY = midY + ny * shift;
                if (
                    this.isWalkableWorld(candX, candY) &&
                    this.hasLineOfSight(prev.x, prev.y, candX, candY, 5) &&
                    this.hasLineOfSight(candX, candY, pt.x, pt.y, 5)
                ) {
                    out.push({ x: Math.round(candX), y: Math.round(candY) });
                }
            }

            // Slightly offset intermediate waypoints so multiple bots choose slightly varied lanes
            if (i < base.length - 1) {
                const next = base[i + 1];
                const d1 = Math.hypot(pt.x - prev.x, pt.y - prev.y) || 1;
                const perpX = -(pt.y - prev.y) / d1;
                const perpY = (pt.x - prev.x) / d1;
                const shift = (laneBias * 0.5 + (Math.random() - 0.5)) * (jitterPx * 0.75);
                const ox = pt.x + perpX * shift;
                const oy = pt.y + perpY * shift;
                if (
                    this.isWalkableWorld(ox, oy) &&
                    this.hasLineOfSight(prev.x, prev.y, ox, oy, 4) &&
                    this.hasLineOfSight(ox, oy, next.x, next.y, 4)
                ) {
                    const nudged = { x: Math.round(ox), y: Math.round(oy) };
                    out.push(nudged);
                    prev = nudged;
                    continue;
                }
            }

            out.push(pt);
            prev = pt;
        }

        return out;
    }
}

export const SKELD_SPECIAL_SPOTS = {
    securityCams: { x: 890, y: 745, room: 'Security' },
    adminMap: { x: 2025, y: 936, room: 'Admin' },
    cafeteriaButton: { x: 1689, y: 278, room: 'Cafeteria' },
    o2Hall: { x: 2350, y: 710, room: 'O2' },
    storageCenter: { x: 1715, y: 1210, room: 'Storage' },
};

export const SKELD_PATROL_SPOTS = [
    ...SKELD_TASKS.map((t) => ({ x: t.x, y: t.y, room: t.room })),
    { x: 1689, y: 278, room: 'Cafeteria' },
    { x: 1715, y: 1210, room: 'Storage' },
    { x: 1480, y: 1250, room: 'Storage' },
    { x: 2115, y: 660, room: 'O2' },
    { x: 890, y: 745, room: 'Security' },
    { x: 695, y: 465, room: 'Upper Engine' },
    { x: 695, y: 1265, room: 'Lower Engine' },
    { x: 1985, y: 1425, room: 'Communications' },
    { x: 2025, y: 936, room: 'Admin' },
    { x: 2355, y: 1175, room: 'Shields' },
    { x: 2750, y: 725, room: 'Navigation' },
    { x: 2310, y: 425, room: 'Weapons' },
    { x: 1210, y: 1210, room: 'Electrical' },
    { x: 405, y: 750, room: 'Reactor' },
    { x: 1170, y: 725, room: 'MedBay' },
];

export const LOBBY_PATROL_SPOTS = [
    ...LOBBY_SPAWNS,
    { x: 545, y: 410 },
    { x: 735, y: 410 },
    { x: 645, y: 485 },
    { x: 420, y: 390 },
    { x: 810, y: 390 },
    { x: 525, y: 580 },
    { x: 710, y: 580 },
];

export async function loadNavGrid(kind = 'skeld') {
    if (cachedGrids[kind]) return cachedGrids[kind];
    const url = kind === 'lobby' ? '/assets/map/lobby.json' : '/assets/map/map.json';
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const json = await res.json();
        const layer = json.layers?.find((l) => l.name === 'collisions');
        if (!layer?.data) return null;
        const grid = new NavGrid(json.width, json.height, json.tilewidth, json.tileheight, layer.data);
        cachedGrids[kind] = grid;
        return grid;
    } catch (err) {
        console.warn('NavGrid load failed:', kind, err);
        return null;
    }
}
