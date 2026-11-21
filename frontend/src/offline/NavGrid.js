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

        // Precompute soft wall-adjacency penalty so bots steer smoothly down corridor centers
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
                this.penalty[idx] = nearWall > 0 ? Math.min(6, nearWall * 2) : 0;
            }
        }
    }

    isWalkableTile(tx, ty) {
        if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return false;
        return this.walkable[ty * this.width + tx] === 1;
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

    hasLineOfSight(ax, ay, bx, by) {
        const dist = Math.hypot(bx - ax, by - ay);
        const steps = Math.max(2, Math.ceil(dist / 4));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const px = ax + (bx - ax) * t;
            const py = ay + (by - ay) * t;
            const { tx, ty } = this.worldToTile(px, py);
            if (!this.isWalkableTile(tx, ty)) return false;
        }
        return true;
    }

    findPath(startX, startY, goalX, goalY) {
        const s0 = this.worldToTile(startX, startY);
        const g0 = this.worldToTile(goalX, goalY);
        const start = this.findNearestWalkableTile(s0.tx, s0.ty);
        const goal = this.findNearestWalkableTile(g0.tx, g0.ty);
        if (!start || !goal) return [{ x: goalX, y: goalY }];

        if (start.tx === goal.tx && start.ty === goal.ty) {
            return [{ x: goalX, y: goalY }];
        }

        const total = this.width * this.height;
        const gScore = new Float32Array(total).fill(Infinity);
        const parent = new Int32Array(total).fill(-1);
        const closed = new Uint8Array(total);
        const inOpen = new Uint8Array(total);

        const startIdx = start.ty * this.width + start.tx;
        const goalIdx = goal.ty * this.width + goal.tx;
        gScore[startIdx] = 0;

        // Simple binary min-heap on [idx, f]
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
        inOpen[startIdx] = 1;

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

                // Prevent diagonal corner clipping
                if (dx !== 0 && dy !== 0) {
                    if (!this.isWalkableTile(cx + dx, cy) || !this.isWalkableTile(cx, cy + dy)) {
                        continue;
                    }
                }

                const nIdx = ny * this.width + nx;
                if (closed[nIdx]) continue;

                const stepCost = baseCost + this.penalty[nIdx] * 0.35;
                const tentativeG = gScore[idx] + stepCost;
                if (tentativeG < gScore[nIdx]) {
                    parent[nIdx] = idx;
                    gScore[nIdx] = tentativeG;
                    push(nIdx, tentativeG + heuristic(nx, ny));
                    inOpen[nIdx] = 1;
                }
            }
        }

        if (!found) {
            return [{ x: goalX, y: goalY }];
        }

        // Reconstruct & downsample waypoints using string-pulling LOS smoothing
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

        if (rawTiles.length === 0) return [{ x: goalX, y: goalY }];

        const worldPts = rawTiles.map((t) => this.tileToWorld(t.tx, t.ty));
        worldPts[worldPts.length - 1] = { x: goalX, y: goalY };

        const smoothed = [];
        let anchor = { x: startX, y: startY };
        let i = 0;
        while (i < worldPts.length) {
            let furthest = i;
            for (let j = worldPts.length - 1; j > i; j--) {
                if (this.hasLineOfSight(anchor.x, anchor.y, worldPts[j].x, worldPts[j].y)) {
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
}

export const SKELD_PATROL_SPOTS = [
    ...SKELD_TASKS.map((t) => ({ x: t.x, y: t.y, room: t.room })),
    { x: 563, y: 118, room: 'Cafeteria' },
    { x: 530, y: 360, room: 'Storage' },
    { x: 705, y: 198, room: 'O2' },
    { x: 305, y: 235, room: 'Security' },
    { x: 195, y: 115, room: 'Upper Engine' },
    { x: 195, y: 365, room: 'Lower Engine' },
    { x: 660, y: 445, room: 'Communications' },
];

export const LOBBY_PATROL_SPOTS = [
    ...LOBBY_SPAWNS,
    { x: 560, y: 380 },
    { x: 720, y: 380 },
    { x: 615, y: 470 },
    { x: 455, y: 420 },
    { x: 765, y: 330 },
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
