import {
    CAFETERIA_SPAWNS,
    DEFAULT_ROOM_SETTINGS,
    EMERGENCY_BUTTON_POS,
    KILL_DISTANCE_MAP,
    LOBBY_SPAWNS,
    SKELD_CONSTANTS,
    SKELD_TASKS,
    SKELD_VENTS,
    getRoomNameAt,
    sanitizeRoomSettings,
} from '../game/skeldData.js';
import { generateBotRoster } from './BotNames.js';
import {
    LOBBY_PATROL_SPOTS,
    SKELD_PATROL_SPOTS,
    SKELD_SPECIAL_SPOTS,
    loadNavGrid,
} from './NavGrid.js';

function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
}

function pickRandomTasks(count = 4) {
    const pool = [...SKELD_TASKS].sort(() => Math.random() - 0.5);
    return pool.slice(0, Math.min(pool.length, count)).map((t) => ({ ...t, completed: false }));
}

const PERSONALITIES = ['explorer', 'cautious', 'social', 'tasker', 'observer'];

export class OfflineEngine {
    constructor(emitToClient) {
        this.emitToClient = emitToClient;
        this.room = null;
        this.humanId = null;
        this.tickTimer = null;
        this.meetingTimer = null;
        this.botActionTimers = [];
        this.lobbyGrid = null;
        this.skeldGrid = null;
        this.pendingReport = null;
        this.lastTickAt = 0;
        this.lastVisionCheckAt = 0;
    }

    clearTimers() {
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
        }
        if (this.meetingTimer) {
            clearTimeout(this.meetingTimer);
            this.meetingTimer = null;
        }
        this.botActionTimers.forEach((t) => clearTimeout(t));
        this.botActionTimers = [];
        this.pendingReport = null;
    }

    scheduleTimer(fn, ms) {
        const id = setTimeout(() => {
            this.botActionTimers = this.botActionTimers.filter((t) => t !== id);
            fn();
        }, ms);
        this.botActionTimers.push(id);
        return id;
    }

    async preloadGrids() {
        const [lobby, skeld] = await Promise.all([loadNavGrid('lobby'), loadNavGrid('skeld')]);
        this.lobbyGrid = lobby;
        this.skeldGrid = skeld;
    }

    serializePlayer(p) {
        if (!p) return null;
        return {
            id: p.id,
            name: p.name,
            roomId: p.roomId,
            state: { ...p.state },
            color: p.color,
            isAlive: p.isAlive,
            inVent: Boolean(p.inVent),
            isBot: Boolean(p.isBot),
            emergencyCallsLeft: p.emergencyCallsLeft ?? 1,
        };
    }

    getTaskSummary() {
        if (!this.room) return { completed: 0, total: 0, ratio: 0 };
        const impSet = new Set(this.room.imposters || []);
        let completed = 0;
        let total = 0;
        Object.values(this.room.players).forEach((p) => {
            if (impSet.has(p.id)) return;
            const list = p.tasks || [];
            total += list.length;
            completed += list.filter((t) => t.completed).length;
        });
        return {
            completed,
            total,
            ratio: total > 0 ? completed / total : 0,
        };
    }

    serializeRoom() {
        if (!this.room) return null;
        const safePlayers = {};
        Object.entries(this.room.players).forEach(([id, p]) => {
            safePlayers[id] = this.serializePlayer(p);
        });
        return {
            id: this.room.id,
            name: this.room.name,
            isPublic: false,
            isOffline: true,
            region: 'LOCAL',
            map: 'The Skeld',
            started: this.room.started,
            host: this.serializePlayer(this.room.host),
            players: safePlayers,
            playerCount: Object.keys(safePlayers).length,
            maxPlayers: 10,
            settings: { ...this.room.settings },
            deadBodies: { ...this.room.deadBodies },
            taskSummary: this.getTaskSummary(),
            lastEmergencyAt: this.room.lastEmergencyAt || 0,
            currentMeeting: this.room.currentMeeting
                ? {
                      isActive: this.room.currentMeeting.isActive,
                      type: this.room.currentMeeting.type,
                      callerId: this.room.currentMeeting.callerId,
                      bodyPlayerId: this.room.currentMeeting.bodyPlayerId,
                      votes: { ...this.room.currentMeeting.votes },
                      endTime: this.room.currentMeeting.endTime,
                  }
                : null,
        };
    }

    getPlayerRoomSnapshot(playerId) {
        if (!this.room) return null;
        const p = this.room.players[playerId] || this.room.players[this.humanId];
        if (!p) return null;
        return {
            room: this.serializeRoom(),
            player: this.serializePlayer(p),
        };
    }

    startSession({ player, settings }) {
        this.clearTimers();
        const mergedSettings = sanitizeRoomSettings(settings, DEFAULT_ROOM_SETTINGS);
        const roomId = 'BOTS01';
        this.humanId = player.id;

        const humanPlayer = {
            id: player.id,
            name: String(player.name || 'Player').trim().slice(0, 20) || 'Player',
            color: player.color || '#c51111',
            roomId,
            isBot: false,
            isImposter: false,
            isAlive: true,
            inVent: false,
            emergencyCallsLeft: mergedSettings.emergencyMeetings,
            tasks: [],
            state: { x: LOBBY_SPAWNS[0].x, y: LOBBY_SPAWNS[0].y, d: 'right', moving: false },
        };

        this.room = {
            id: roomId,
            name: `${humanPlayer.name}'s Offline Ship`,
            isPublic: false,
            isOffline: true,
            started: false,
            host: humanPlayer,
            imposter: null,
            imposters: [],
            settings: mergedSettings,
            players: { [humanPlayer.id]: humanPlayer },
            deadBodies: {},
            lastKillAt: 0,
            lastEmergencyAt: 0,
            currentMeeting: null,
        };

        this.syncBotPopulation(mergedSettings.botCount);
        this.preloadGrids();
        this.startTickLoop();

        const safeRoom = this.serializeRoom();
        this.emitToClient('player:registered', { playerId: humanPlayer.id });
        this.emitToClient('room:joined', {
            roomId,
            room: safeRoom,
            player: this.serializePlayer(humanPlayer),
            started: false,
            isOffline: true,
        });
    }

    syncBotPopulation(desiredCount) {
        if (!this.room) return;
        const clamped = Math.max(3, Math.min(9, Number(desiredCount) || 7));
        const currentBots = Object.values(this.room.players).filter((p) => p.isBot);

        if (currentBots.length < clamped) {
            const human = this.room.players[this.humanId];
            const roster = generateBotRoster(clamped - currentBots.length, human?.name, human?.color);
            const existingNames = new Set(Object.values(this.room.players).map((p) => p.name.toLowerCase()));
            const existingColors = new Set(Object.values(this.room.players).map((p) => p.color.toLowerCase()));

            roster.forEach((candidate) => {
                if (existingNames.has(candidate.name.toLowerCase())) {
                    candidate.name = `Bot${Object.keys(this.room.players).length + 1}`;
                }
                if (existingColors.has(candidate.color.toLowerCase())) {
                    const fallback = [
                        '#132ed1',
                        '#117f2d',
                        '#ed54ba',
                        '#ef7d0d',
                        '#f5f557',
                        '#3f474e',
                        '#d6e0f0',
                        '#6b2fbb',
                        '#71491e',
                        '#38fedc',
                        '#50ef39',
                    ].find((c) => !existingColors.has(c.toLowerCase()));
                    if (fallback) candidate.color = fallback;
                }
                existingNames.add(candidate.name.toLowerCase());
                existingColors.add(candidate.color.toLowerCase());

                const spawnIdx = Object.keys(this.room.players).length;
                const spawn = LOBBY_SPAWNS[spawnIdx % LOBBY_SPAWNS.length];
                const bot = {
                    id: candidate.id,
                    name: candidate.name,
                    color: candidate.color,
                    roomId: this.room.id,
                    isBot: true,
                    isImposter: false,
                    isAlive: true,
                    inVent: false,
                    emergencyCallsLeft: this.room.settings.emergencyMeetings,
                    tasks: [],
                    state: { x: spawn.x, y: spawn.y, d: 'right', moving: false },
                    ai: this.createFreshBotAI(spawnIdx),
                };
                this.room.players[bot.id] = bot;
                if (this.tickTimer) {
                    this.emitToClient('player:joined', {
                        player: this.serializePlayer(bot),
                        roomId: this.room.id,
                    });
                }
            });
        } else if (currentBots.length > clamped) {
            const toRemove = currentBots.slice(clamped);
            toRemove.forEach((b) => {
                delete this.room.players[b.id];
                this.emitToClient('player:left', { playerId: b.id, newHostId: null });
            });
        }
    }

    createFreshBotAI(seedIdx = 0) {
        return {
            personality: PERSONALITIES[seedIdx % PERSONALITIES.length],
            laneBias: ((seedIdx % 5) - 2) * 0.4,
            speedFactor: 0.94 + ((seedIdx * 37) % 12) * 0.01,
            path: [],
            pauseUntil: Date.now() + 650 + (seedIdx % 5) * 380,
            doingTaskId: null,
            taskDoneAt: 0,
            currentGoalTaskId: null,
            huntTargetId: null,
            repathAt: 0,
            emergencyRush: false,
            fleeUntil: 0,
            detourGoal: null,
            glanceAt: Date.now() + 1800 + seedIdx * 400,
            suspicion: {},
            witnessedRoom: {},
            trusted: {},
            lastSeen: {},
            alibiPartnerId: null,
        };
    }

    startTickLoop() {
        if (this.tickTimer) clearInterval(this.tickTimer);
        this.lastTickAt = Date.now();
        this.tickTimer = setInterval(() => this.tick(), 50);
    }

    handleClientEmit(event, data = {}) {
        if (!this.room && event !== 'player:disconnect') return;

        switch (event) {
            case 'room:update-settings': {
                if (!this.room || this.room.started) return;
                const prevBotCount = this.room.settings.botCount;
                this.room.settings = sanitizeRoomSettings(data.settings, this.room.settings);
                if (this.room.settings.botCount !== prevBotCount) {
                    this.syncBotPopulation(this.room.settings.botCount);
                }
                const safeRoom = this.serializeRoom();
                this.emitToClient('room:settings:updated', {
                    roomId: this.room.id,
                    settings: safeRoom.settings,
                    room: safeRoom,
                });
                this.emitToClient('room:updated', { room: safeRoom });
                break;
            }
            case 'player:customize': {
                if (!this.room || this.room.started) return;
                const human = this.room.players[this.humanId];
                if (!human) return;
                const others = Object.values(this.room.players).filter((p) => p.id !== this.humanId);
                let cleanName;
                if (typeof data.name === 'string') {
                    cleanName = data.name.trim().slice(0, 20);
                    if (!cleanName) {
                        this.emitToClient('player:customize:error', { message: 'Name cannot be empty' });
                        return;
                    }
                    if (others.some((o) => o.name.toLowerCase() === cleanName.toLowerCase())) {
                        this.emitToClient('player:customize:error', { message: 'Name already used by a bot' });
                        return;
                    }
                }
                let cleanColor;
                if (typeof data.color === 'string') {
                    cleanColor = data.color;
                    if (others.some((o) => o.color.toLowerCase() === cleanColor.toLowerCase())) {
                        this.emitToClient('player:customize:error', { message: 'Color already used by a bot' });
                        return;
                    }
                }
                if (cleanName !== undefined) human.name = cleanName;
                if (cleanColor !== undefined) human.color = cleanColor;
                const safeRoom = this.serializeRoom();
                this.emitToClient('player:customized', {
                    roomId: this.room.id,
                    player: this.serializePlayer(human),
                    room: safeRoom,
                });
                break;
            }
            case 'game:start': {
                this.startGame();
                break;
            }
            case 'player:move': {
                const p = this.room?.players?.[this.humanId];
                if (!p) return;
                p.state = {
                    x: Number(data.x) || 0,
                    y: Number(data.y) || 0,
                    d: data.d === 'left' ? 'left' : 'right',
                    moving: Boolean(data.moving),
                };
                break;
            }
            case 'player:kill': {
                this.executeKill(this.humanId, data.targetId);
                break;
            }
            case 'player:vent': {
                this.executeVent(this.humanId, data.action, data.ventId);
                break;
            }
            case 'task:complete': {
                this.completeTask(this.humanId, data.taskId, true);
                break;
            }
            case 'meeting:start': {
                this.startMeeting(this.humanId, data.type, data.bodyPlayerId);
                break;
            }
            case 'meeting:vote': {
                this.castVote(this.humanId, data.votedForId || 'skip');
                break;
            }
            case 'room:send:message': {
                const human = this.room?.players?.[this.humanId];
                const rawText = String(data.message || '').trim().slice(0, 200);
                if (!human || !rawText) return;
                this.emitToClient('room:message', {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    playerId: human.id,
                    playerName: human.name,
                    color: human.color,
                    message: rawText,
                    isGhost: !human.isAlive,
                    timestamp: Date.now(),
                });
                break;
            }
            case 'room:playAgain': {
                this.resetToLobby();
                break;
            }
            case 'room:leave':
            case 'player:disconnect': {
                this.stop();
                break;
            }
            default:
                break;
        }
    }

    startGame() {
        if (!this.room) return;
        this.botActionTimers.forEach((t) => clearTimeout(t));
        this.botActionTimers = [];
        if (this.meetingTimer) {
            clearTimeout(this.meetingTimer);
            this.meetingTimer = null;
        }
        this.pendingReport = null;

        const players = Object.values(this.room.players);
        const settings = sanitizeRoomSettings(this.room.settings);
        this.room.settings = settings;
        this.room.started = true;
        this.room.deadBodies = {};
        this.room.currentMeeting = null;

        const killCooldownMs = settings.killCooldownSec * 1000;
        const initialCooldownMs = Math.min(SKELD_CONSTANTS.INITIAL_KILL_COOLDOWN_MS, killCooldownMs);
        const now = Date.now();
        this.room.lastKillAt = now - (killCooldownMs - initialCooldownMs);
        this.room.lastEmergencyAt = now;

        const maxPossible = Math.max(1, Math.floor((players.length - 1) / 2));
        const targetImpCount = Math.max(1, Math.min(settings.impostorCount, maxPossible));
        const bots = players.filter((p) => p.isBot).sort(() => Math.random() - 0.5);
        const human = players.find((p) => !p.isBot);

        let chosen = [];
        if (settings.preferredRole === 'impostor' && human) {
            chosen.push(human.id);
            while (chosen.length < targetImpCount && bots.length >= chosen.length) {
                chosen.push(bots[chosen.length - 1].id);
            }
        } else if (settings.preferredRole === 'crewmate') {
            chosen = bots.slice(0, targetImpCount).map((b) => b.id);
        } else {
            const shuffled = [...players].sort(() => Math.random() - 0.5);
            chosen = shuffled.slice(0, targetImpCount).map((p) => p.id);
        }

        const impSet = new Set(chosen);
        this.room.imposters = chosen;
        this.room.imposter = chosen[0] || null;

        players.forEach((p, idx) => {
            const spawn = CAFETERIA_SPAWNS[idx % CAFETERIA_SPAWNS.length];
            p.isAlive = true;
            p.inVent = false;
            p.isImposter = impSet.has(p.id);
            p.emergencyCallsLeft = settings.emergencyMeetings;
            p.tasks = pickRandomTasks(settings.tasksPerPlayer);
            p.state = { x: spawn.x, y: spawn.y, d: 'right', moving: false };
            if (p.isBot) {
                p.ai = this.createFreshBotAI(idx);
                // Stagger natural departure from Cafeteria table like real humans checking tasks
                p.ai.pauseUntil = Date.now() + 900 + Math.random() * 1400 + idx * 140;
            }
        });

        const safeRoom = this.serializeRoom();
        const impCards = chosen
            .map((id) => this.room.players[id])
            .filter(Boolean)
            .map((p) => ({ id: p.id, name: p.name, color: p.color }));

        this.emitToClient('game:started', {
            roomId: this.room.id,
            room: safeRoom,
            settings,
            impostorCount: chosen.length,
            killCooldownMs,
            initialCooldownMs,
        });

        if (human) {
            const isImp = impSet.has(human.id);
            this.emitToClient('game:role', {
                roomId: this.room.id,
                isImposter: isImp,
                impostorCount: chosen.length,
                fellowImposters: isImp ? impCards : [],
                tasks: human.tasks,
            });
        }
    }

    resetToLobby() {
        if (!this.room) return;
        this.botActionTimers.forEach((t) => clearTimeout(t));
        this.botActionTimers = [];
        if (this.meetingTimer) {
            clearTimeout(this.meetingTimer);
            this.meetingTimer = null;
        }
        this.pendingReport = null;

        this.room.started = false;
        this.room.currentMeeting = null;
        this.room.deadBodies = {};
        this.room.imposters = [];
        this.room.imposter = null;

        Object.values(this.room.players).forEach((p, idx) => {
            const spawn = LOBBY_SPAWNS[idx % LOBBY_SPAWNS.length];
            p.isAlive = true;
            p.isImposter = false;
            p.inVent = false;
            p.tasks = [];
            p.emergencyCallsLeft = this.room.settings.emergencyMeetings;
            p.state = { x: spawn.x, y: spawn.y, d: 'right', moving: false };
            if (p.isBot) {
                p.ai = this.createFreshBotAI(idx);
            }
        });

        const safeRoom = this.serializeRoom();
        this.emitToClient('room:restarted', { roomId: this.room.id, room: safeRoom });
        this.emitToClient('room:updated', { room: safeRoom });
    }

    executeKill(killerId, targetId) {
        if (!this.room || !this.room.started || this.room.currentMeeting?.isActive) return false;
        const killer = this.room.players[killerId];
        const victim = this.room.players[targetId];
        if (!killer || !victim || !killer.isAlive || !victim.isAlive) return false;
        const impSet = new Set(this.room.imposters || []);
        if (!impSet.has(killerId) || impSet.has(targetId) || killer.inVent) return false;

        const cooldownMs = (this.room.settings.killCooldownSec || 15) * 1000;
        if (Date.now() - (this.room.lastKillAt || 0) < cooldownMs - 300) return false;

        const killRange = KILL_DISTANCE_MAP[this.room.settings.killDistance] || SKELD_CONSTANTS.KILL_RANGE;
        if (dist(killer.state.x, killer.state.y, victim.state.x, victim.state.y) > killRange + 45) {
            return false;
        }

        victim.isAlive = false;
        this.room.lastKillAt = Date.now();
        killer.state.x = victim.state.x;
        killer.state.y = victim.state.y;
        if (victim.isBot && victim.ai) {
            victim.ai.path = [];
            victim.ai.doingTaskId = null;
        }

        this.room.deadBodies[victim.id] = {
            id: victim.id,
            name: victim.name,
            color: victim.color,
            x: victim.state.x,
            y: victim.state.y,
            killedAt: Date.now(),
        };

        // Record witness suspicions for alive Crewmate bots within sight (scaled for 3000x1680)
        const witnessRadius = SKELD_CONSTANTS.CREW_BASE_VISION * 1.05 * (this.room.settings.crewVision || 1.0);
        const killRoom = getRoomNameAt(victim.state.x, victim.state.y);
        const diff = this.room.settings.botDifficulty || 'normal';
        Object.values(this.room.players).forEach((p) => {
            if (!p.isBot || !p.isAlive || p.id === killerId || impSet.has(p.id)) return;
            const d = dist(p.state.x, p.state.y, victim.state.x, victim.state.y);
            if (d <= witnessRadius) {
                p.ai.suspicion[killerId] = (p.ai.suspicion[killerId] || 0) + 150;
                p.ai.witnessedRoom[killerId] = `saw ${killer.name} kill ${victim.name} in ${killRoom}`;
                // Hard & Normal witnesses react immediately (flee or rush to button/body)
                if (diff === 'hard') {
                    p.ai.fleeUntil = Date.now() + 4500;
                    p.ai.emergencyRush = true;
                    p.ai.path = [];
                } else if (diff === 'normal') {
                    p.ai.fleeUntil = Date.now() + 3000;
                }
            }
        });

        this.emitToClient('player:killed', {
            playerId: victim.id,
            victimName: victim.name,
            killerId,
            x: victim.state.x,
            y: victim.state.y,
            color: victim.color,
            nextKillCooldownMs: cooldownMs,
        });

        const win = this.checkWin();
        if (win) {
            this.scheduleTimer(() => this.emitWin(win), 900);
        }
        return true;
    }

    executeVent(playerId, action, ventId) {
        if (!this.room || !this.room.started || this.room.currentMeeting?.isActive) return;
        const player = this.room.players[playerId];
        const impSet = new Set(this.room.imposters || []);
        if (!player || !player.isAlive || !impSet.has(playerId)) return;

        const vent = SKELD_VENTS.find((v) => v.id === ventId);
        if (!vent) return;

        if (action === 'enter') {
            player.inVent = true;
        } else if (action === 'move') {
            if (!player.inVent) return;
        } else if (action === 'exit') {
            player.inVent = false;
        } else {
            return;
        }

        player.state.x = vent.x;
        player.state.y = vent.y;

        // Crewmate bots nearby witness the vent!
        if (action === 'enter' || action === 'exit') {
            const witnessRadius = SKELD_CONSTANTS.CREW_BASE_VISION * (this.room.settings.crewVision || 1.0);
            const diff = this.room.settings.botDifficulty || 'normal';
            Object.values(this.room.players).forEach((p) => {
                if (!p.isBot || !p.isAlive || impSet.has(p.id)) return;
                if (dist(p.state.x, p.state.y, vent.x, vent.y) <= witnessRadius) {
                    p.ai.suspicion[playerId] = (p.ai.suspicion[playerId] || 0) + 135;
                    p.ai.witnessedRoom[playerId] = `saw ${player.name} vent at ${vent.label}`;
                    if (diff === 'hard') {
                        p.ai.emergencyRush = true;
                        p.ai.path = [];
                    }
                }
            });
        }

        this.emitToClient('player:vented', {
            playerId,
            action,
            ventId,
            x: vent.x,
            y: vent.y,
        });
    }

    completeTask(playerId, taskId, isHuman = false) {
        if (!this.room || !this.room.started || this.room.currentMeeting?.isActive) return;
        const player = this.room.players[playerId];
        if (!player) return;
        const task = (player.tasks || []).find((t) => t.id === taskId);
        if (!task || task.completed) return;

        task.completed = true;
        if (isHuman) {
            this.emitToClient('task:completed:ack', { taskId });
        }
        this.emitToClient('tasks:updated', { taskSummary: this.getTaskSummary() });

        const win = this.checkWin();
        if (win) {
            this.emitWin(win);
        }
    }

    startMeeting(callerId, type = 'emergency', bodyPlayerId = null) {
        if (!this.room || !this.room.started || this.room.currentMeeting?.isActive) return;
        const caller = this.room.players[callerId];
        if (!caller || !caller.isAlive || caller.inVent) return;

        const settings = this.room.settings;
        let bodyColor = null;
        let bodyName = null;
        let bodyRoom = 'Cafeteria';

        if (type === 'body') {
            const body = bodyPlayerId ? this.room.deadBodies[bodyPlayerId] : null;
            if (!body) return;
            bodyColor = body.color;
            bodyName = body.name;
            bodyRoom = getRoomNameAt(body.x, body.y);
        } else {
            if ((caller.emergencyCallsLeft ?? 1) <= 0) {
                if (callerId === this.humanId) {
                    this.emitToClient('game:notif', { message: 'No emergency meetings remaining!' });
                }
                return;
            }
            const cdMs = (settings.emergencyCooldownSec || 15) * 1000;
            const elapsed = Date.now() - (this.room.lastEmergencyAt || 0);
            if (elapsed < cdMs - 400) {
                if (callerId === this.humanId) {
                    const left = Math.ceil((cdMs - elapsed) / 1000);
                    this.emitToClient('game:notif', {
                        message: `Emergency meeting on cooldown (${left}s left)`,
                    });
                }
                return;
            }
            caller.emergencyCallsLeft = Math.max(0, (caller.emergencyCallsLeft ?? 1) - 1);
        }

        // Spatial & temporal deduction: compare proximity & lastSeen memory near bodyRoom!
        const impSet = new Set(this.room.imposters || []);
        const diff = settings.botDifficulty || 'normal';
        if (type === 'body' && bodyPlayerId && this.room.deadBodies[bodyPlayerId]) {
            const body = this.room.deadBodies[bodyPlayerId];
            Object.values(this.room.players).forEach((p) => {
                if (!p.isAlive || p.id === callerId) return;
                const d = dist(p.state.x, p.state.y, body.x, body.y);
                const suspectRoom = getRoomNameAt(p.state.x, p.state.y);

                Object.values(this.room.players).forEach((bot) => {
                    if (!bot.isBot || !bot.isAlive || bot.id === p.id || impSet.has(bot.id)) return;
                    // Close to the body when reported
                    if (d < 420 && dist(bot.state.x, bot.state.y, body.x, body.y) < 620) {
                        bot.ai.suspicion[p.id] = (bot.ai.suspicion[p.id] || 0) + (diff === 'hard' ? 50 : 32);
                        if (!bot.ai.witnessedRoom[p.id] && d < 320) {
                            bot.ai.witnessedRoom[p.id] = `saw ${p.name} right near ${bodyName}'s body in ${bodyRoom}`;
                        }
                    } else if (diff !== 'casual') {
                        // Did this bot remember seeing `p` inside/leaving `bodyRoom` recently?
                        const mem = bot.ai.lastSeen?.[p.id];
                        if (mem && mem.room === bodyRoom && Date.now() - mem.time < 18000 && mem.companions < 2) {
                            bot.ai.suspicion[p.id] = (bot.ai.suspicion[p.id] || 0) + (diff === 'hard' ? 42 : 25);
                            if (!bot.ai.witnessedRoom[p.id]) {
                                bot.ai.witnessedRoom[p.id] = `saw ${p.name} around ${bodyRoom} shortly before the body`;
                            }
                        } else if (suspectRoom === bodyRoom && p.id !== callerId) {
                            bot.ai.suspicion[p.id] = (bot.ai.suspicion[p.id] || 0) + 20;
                        }
                    }
                });
            });
        }

        this.pendingReport = null;
        const durationMs = (settings.meetingDurationSec || 45) * 1000;
        const endTime = Date.now() + durationMs;

        this.room.currentMeeting = {
            isActive: true,
            type,
            callerId,
            bodyPlayerId,
            votes: {},
            endTime,
        };

        Object.values(this.room.players).forEach((p) => {
            p.inVent = false;
            p.state.moving = false;
            if (p.isBot && p.ai) {
                p.ai.emergencyRush = false;
                p.ai.fleeUntil = 0;
            }
        });

        if (this.meetingTimer) clearTimeout(this.meetingTimer);
        this.meetingTimer = setTimeout(() => this.endMeeting(), durationMs);

        const safeRoom = this.serializeRoom();
        this.emitToClient('meeting:started', {
            roomId: this.room.id,
            type,
            callerId,
            callerName: caller.name,
            callerColor: caller.color,
            bodyPlayerId,
            bodyColor,
            bodyName,
            endTime,
            players: safeRoom.players,
            anonymousVotes: Boolean(settings.anonymousVotes),
        });

        this.scheduleBotMeetingBehavior({ caller, type, bodyName, bodyRoom });
    }

    scheduleBotMeetingBehavior({ caller, type, bodyName, bodyRoom }) {
        if (!this.room || !this.room.currentMeeting?.isActive) return;
        const players = Object.values(this.room.players);
        const aliveBots = players.filter((p) => p.isBot && p.isAlive);
        const aliveAll = players.filter((p) => p.isAlive);
        const impSet = new Set(this.room.imposters || []);
        const diff = this.room.settings.botDifficulty || 'normal';

        const sendBotChat = (bot, text, delayMs) => {
            this.scheduleTimer(() => {
                if (!this.room?.currentMeeting?.isActive) return;
                this.emitToClient('room:message', {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    playerId: bot.id,
                    playerName: bot.name,
                    color: bot.color,
                    message: text,
                    isGhost: false,
                    timestamp: Date.now(),
                });
            }, delayMs);
        };

        // 1. Caller speaks first naturally
        if (caller.isBot) {
            if (type === 'body') {
                const top = this.pickTopSuspect(caller);
                if (top && caller.ai.witnessedRoom[top.id] && (caller.ai.suspicion[top.id] || 0) >= 85) {
                    sendBotChat(
                        caller,
                        `Body in ${bodyRoom} (${bodyName})! I ${caller.ai.witnessedRoom[top.id]}!`,
                        1200
                    );
                } else {
                    sendBotChat(caller, `Found ${bodyName}'s body in ${bodyRoom}! Anyone nearby?`, 1250);
                }
            } else {
                const top = this.pickTopSuspect(caller);
                if (top) {
                    sendBotChat(
                        caller,
                        caller.ai.witnessedRoom[top.id]
                            ? `Emergency! I ${caller.ai.witnessedRoom[top.id]}!`
                            : `Called meeting — ${top.name} was acting super sus!`,
                        1300
                    );
                } else {
                    sendBotChat(caller, `Quick check — where is everyone right now?`, 1300);
                }
            }
        } else if (type === 'body' && aliveBots.length > 0) {
            const asker = aliveBots[Math.floor(Math.random() * aliveBots.length)];
            const queries = [
                `Where was ${bodyName}'s body?`,
                `Whoa, ${bodyName} is down in ${bodyRoom}? Did anyone see someone leave?`,
                `Who was near ${bodyRoom} just now?`,
            ];
            sendBotChat(asker, queries[Math.floor(Math.random() * queries.length)], 1450);
        }

        // 2. Up to 3 other alive bots share eyewitness reports, alibis, or deceptive impostor covers
        const chatterBots = aliveBots.filter((b) => b.id !== caller.id).sort(() => Math.random() - 0.5);
        chatterBots.slice(0, 3).forEach((bot, idx) => {
            const delay = 2250 + idx * 1250;
            const myRoom = getRoomNameAt(bot.state.x, bot.state.y);
            if (!impSet.has(bot.id)) {
                const suspect = this.pickTopSuspect(bot);
                if (suspect && bot.ai.witnessedRoom[suspect.id]) {
                    sendBotChat(bot, `Wait — I ${bot.ai.witnessedRoom[suspect.id]}!`, delay);
                    return;
                }
                const trustedId = bot.ai.alibiPartnerId;
                const trustedFriend = trustedId ? this.room.players[trustedId] : null;
                if (trustedFriend && trustedFriend.isAlive && trustedFriend.id !== bot.id && diff !== 'casual') {
                    sendBotChat(
                        bot,
                        `I was in ${myRoom} with ${trustedFriend.name}, ${trustedFriend.name} seems safe.`,
                        delay
                    );
                    return;
                }
                sendBotChat(bot, `I was over in ${myRoom} working on tasks.`, delay);
            } else {
                // Impostor bot builds a convincing alibi or subtly frames a lone crewmate
                const safeCrew = aliveAll.filter((p) => !impSet.has(p.id) && p.id !== caller.id);
                const scapegoat = safeCrew[Math.floor(Math.random() * safeCrew.length)];
                const fakeRooms = ['Admin', 'MedBay', 'Weapons', 'Storage', 'Upper Engine'].filter(
                    (r) => r !== bodyRoom
                );
                const fakeRoom = fakeRooms[Math.floor(Math.random() * fakeRooms.length)] || 'Cafeteria';

                if (scapegoat && Math.random() < (diff === 'hard' ? 0.55 : 0.35)) {
                    sendBotChat(
                        bot,
                        `Pretty sure I saw ${scapegoat.name} heading away from ${bodyRoom} earlier...`,
                        delay
                    );
                } else {
                    sendBotChat(bot, `I was doing tasks in ${fakeRoom}, nowhere near ${bodyRoom}.`, delay);
                }
            }
        });

        // 3. Stagger bot votes naturally
        aliveBots.forEach((bot, idx) => {
            const baseDelay = 3300 + idx * 720 + Math.random() * 1400;
            this.scheduleTimer(() => {
                if (!this.room?.currentMeeting?.isActive) return;
                if (this.room.currentMeeting.votes[bot.id] !== undefined) return;
                const choice = this.chooseBotVote(bot);
                this.castVote(bot.id, choice);
            }, baseDelay);
        });
    }

    pickTopSuspect(bot) {
        if (!this.room || !bot?.ai?.suspicion) return null;
        let best = null;
        let bestScore = 30;
        Object.entries(bot.ai.suspicion).forEach(([pid, score]) => {
            const candidate = this.room.players[pid];
            if (candidate && candidate.isAlive && score > bestScore) {
                bestScore = score;
                best = candidate;
            }
        });
        return best;
    }

    chooseBotVote(bot) {
        if (!this.room) return 'skip';
        const impSet = new Set(this.room.imposters || []);
        const alive = Object.values(this.room.players).filter((p) => p.isAlive);
        const diff = this.room.settings.botDifficulty || 'normal';

        if (impSet.has(bot.id)) {
            const crewCandidates = alive.filter((p) => !impSet.has(p.id));
            if (crewCandidates.length > 0 && Math.random() < (diff === 'hard' ? 0.68 : 0.52)) {
                // Hard impostors pile onto whoever already has votes or looks suspect
                const votes = this.room.currentMeeting?.votes || {};
                const tally = {};
                Object.values(votes).forEach((v) => {
                    if (v && v !== 'skip' && !impSet.has(v)) tally[v] = (tally[v] || 0) + 1;
                });
                const topVoted = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
                if (diff === 'hard' && topVoted) {
                    return topVoted[0];
                }
                return crewCandidates[Math.floor(Math.random() * crewCandidates.length)].id;
            }
            return 'skip';
        }

        // Aggregate shared suspicion for hard bots (simulates listening to chat testimony)
        const top = this.pickTopSuspect(bot);
        if (top) {
            const score = bot.ai.suspicion[top.id] || 0;
            if (score >= 95) return top.id;
            if (score >= 45 && (diff === 'hard' ? Math.random() < 0.85 : Math.random() < 0.65)) {
                return top.id;
            }
        }

        if (diff === 'hard') {
            // Hard crew bots check if another reliable witness already accused someone strongly
            const votes = this.room.currentMeeting?.votes || {};
            const tally = {};
            Object.values(votes).forEach((v) => {
                if (v && v !== 'skip') tally[v] = (tally[v] || 0) + 1;
            });
            const lead = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
            if (lead && lead[1] >= 2 && lead[0] !== bot.id && (bot.ai.trusted?.[lead[0]] || 0) < 3) {
                return lead[0];
            }
        }

        const skipChance = diff === 'hard' ? 0.88 : diff === 'normal' ? 0.74 : 0.56;
        if (Math.random() < skipChance) return 'skip';
        const others = alive.filter((p) => p.id !== bot.id);
        return others.length > 0 ? others[Math.floor(Math.random() * others.length)].id : 'skip';
    }

    castVote(voterId, votedForId) {
        const meeting = this.room?.currentMeeting;
        if (!this.room || !meeting || !meeting.isActive) return;
        const voter = this.room.players[voterId];
        if (!voter || !voter.isAlive || meeting.votes[voterId] !== undefined) return;

        let targetId = votedForId || 'skip';
        if (targetId !== 'skip') {
            const target = this.room.players[targetId];
            if (!target || !target.isAlive) targetId = 'skip';
        }

        meeting.votes[voterId] = targetId;
        const alivePlayers = Object.values(this.room.players).filter((p) => p.isAlive);
        const voteCount = Object.keys(meeting.votes).length;

        this.emitToClient('meeting:voted', {
            callerId: voterId,
            voteCount,
            totalAlive: alivePlayers.length,
        });

        if (voterId === this.humanId && voteCount < alivePlayers.length) {
            const remainingBots = alivePlayers.filter(
                (p) => p.isBot && meeting.votes[p.id] === undefined
            );
            remainingBots.forEach((bot, idx) => {
                this.scheduleTimer(() => {
                    if (this.room?.currentMeeting?.isActive && meeting.votes[bot.id] === undefined) {
                        this.castVote(bot.id, this.chooseBotVote(bot));
                    }
                }, 420 + idx * 230);
            });
        }

        if (voteCount >= alivePlayers.length) {
            this.endMeeting();
        }
    }

    endMeeting() {
        const meeting = this.room?.currentMeeting;
        if (!this.room || !meeting || !meeting.isActive) return;

        if (this.meetingTimer) {
            clearTimeout(this.meetingTimer);
            this.meetingTimer = null;
        }
        meeting.isActive = false;

        const rawVotes = { ...meeting.votes };
        const impSet = new Set(this.room.imposters || []);
        const settings = this.room.settings;
        const counts = {};
        let max = 0;
        let winners = [];

        Object.values(rawVotes).forEach((v) => {
            counts[v] = (counts[v] || 0) + 1;
            if (counts[v] > max) {
                max = counts[v];
                winners = [v];
            } else if (counts[v] === max) {
                winners.push(v);
            }
        });

        let ejectedId = null;
        let ejectedName = null;
        let ejectedColor = null;
        let wasImposter = false;

        const tie = winners.length > 1;
        const skipped = winners.length === 0 || (winners.length === 1 && winners[0] === 'skip');

        if (!tie && !skipped && winners.length === 1) {
            const candidate = this.room.players[winners[0]];
            if (candidate && candidate.isAlive) {
                ejectedId = candidate.id;
                ejectedName = candidate.name;
                ejectedColor = candidate.color;
                wasImposter = impSet.has(candidate.id);
                candidate.isAlive = false;
            }
        }

        const remainingImpostors = Object.values(this.room.players).filter(
            (p) => p.isAlive && impSet.has(p.id)
        ).length;

        this.room.deadBodies = {};
        Object.values(this.room.players).forEach((p, idx) => {
            const spawn = CAFETERIA_SPAWNS[idx % CAFETERIA_SPAWNS.length];
            p.state = { x: spawn.x, y: spawn.y, d: 'right', moving: false };
            p.inVent = false;
            if (p.isBot && p.ai) {
                p.ai.path = [];
                p.ai.doingTaskId = null;
                p.ai.detourGoal = null;
                p.ai.emergencyRush = false;
                p.ai.fleeUntil = 0;
                p.ai.pauseUntil = Date.now() + 1100 + Math.random() * 1100 + idx * 140;
            }
        });

        const now = Date.now();
        this.room.lastKillAt = now;
        this.room.lastEmergencyAt = now;

        const anonymousVotes = Boolean(settings.anonymousVotes);
        const results = {
            ejectedId,
            ejectedName,
            ejectedColor,
            wasImposter: settings.confirmEjects ? wasImposter : false,
            confirmEjects: Boolean(settings.confirmEjects),
            remainingImpostors: settings.confirmEjects ? remainingImpostors : -1,
            anonymousVotes,
            tie,
            skipped,
            counts,
            votes: anonymousVotes ? {} : rawVotes,
        };

        const safeRoom = this.serializeRoom();
        this.emitToClient('meeting:ended', {
            roomId: this.room.id,
            results,
            room: safeRoom,
        });

        const win = this.checkWin();
        if (win) {
            const delay = ejectedId ? SKELD_CONSTANTS.EJECTION_DELAY_MS || 3800 : 2000;
            this.scheduleTimer(() => this.emitWin(win), delay);
        }
    }

    checkWin() {
        if (!this.room || !this.room.started) return null;
        const players = Object.values(this.room.players);
        const impSet = new Set(this.room.imposters || []);
        if (impSet.size === 0) return null;

        const alive = players.filter((p) => p.isAlive);
        const aliveImps = alive.filter((p) => impSet.has(p.id));
        const aliveCrew = alive.filter((p) => !impSet.has(p.id));

        if (aliveImps.length === 0) {
            return { winner: 'crewmates', isImposter: false, reason: 'imposter_eliminated' };
        }
        if (aliveImps.length >= aliveCrew.length) {
            return { winner: 'imposter', isImposter: true, reason: 'outnumbered' };
        }
        const summary = this.getTaskSummary();
        if (summary.total > 0 && summary.completed >= summary.total) {
            return { winner: 'crewmates', isImposter: false, reason: 'tasks_completed' };
        }
        return null;
    }

    emitWin(win) {
        if (!this.room || !this.room.started) return;
        const impIds = this.room.imposters || [];
        const impNames = impIds.map((id) => this.room.players[id]?.name).filter(Boolean);
        this.emitToClient('game:ended', {
            roomId: this.room.id,
            ...win,
            imposterId: impIds[0] || null,
            imposterName: impNames[0] || null,
            imposters: impIds,
            imposterNames: impNames,
        });
    }

    tick() {
        if (!this.room) return;
        const now = Date.now();
        const dtSec = Math.min(0.12, (now - this.lastTickAt) / 1000);
        this.lastTickAt = now;

        if (this.room.currentMeeting?.isActive) return;

        if (!this.room.started) {
            this.tickLobby(now, dtSec);
        } else {
            this.tickGame(now, dtSec);
        }
    }

    tickLobby(now, dtSec) {
        const baseSpeed = SKELD_CONSTANTS.BASE_SPEED_LOBBY * 0.65 * Math.min(1.4, this.room.settings.playerSpeed || 1);
        const allPlayers = Object.values(this.room.players);

        allPlayers.forEach((bot) => {
            if (!bot.isBot) return;
            const ai = bot.ai;
            if (!ai) return;

            if (ai.path.length > 0) {
                this.stepBotAlongPath(bot, baseSpeed * ai.speedFactor * dtSec);
                return;
            }

            if (bot.state.moving) {
                bot.state.moving = false;
                this.emitToClient('player:moved', { id: bot.id, ...bot.state });
            }

            // While idling in lobby, occasionally glance at nearby players like a human!
            if (now >= ai.glanceAt && now < ai.pauseUntil) {
                ai.glanceAt = now + 900 + Math.random() * 1400;
                const nearest = allPlayers.find(
                    (o) => o.id !== bot.id && dist(bot.state.x, bot.state.y, o.state.x, o.state.y) < 160
                );
                if (nearest) {
                    const lookDir = nearest.state.x < bot.state.x ? 'left' : 'right';
                    if (bot.state.d !== lookDir) {
                        bot.state.d = lookDir;
                        this.emitToClient('player:moved', { id: bot.id, ...bot.state });
                    }
                }
            }

            if (now >= ai.pauseUntil) {
                let target;
                // 35% chance to walk near another player to socialize; otherwise patrol or pace nearby
                if (Math.random() < 0.35 && allPlayers.length > 1) {
                    const friend = allPlayers[Math.floor(Math.random() * allPlayers.length)];
                    if (friend.id !== bot.id && this.lobbyGrid) {
                        target = this.lobbyGrid.pickRandomWalkableNear(friend.state.x, friend.state.y, 75);
                    }
                }
                if (!target) {
                    const spot = LOBBY_PATROL_SPOTS[Math.floor(Math.random() * LOBBY_PATROL_SPOTS.length)];
                    target = this.lobbyGrid
                        ? this.lobbyGrid.pickRandomWalkableNear(spot.x, spot.y, 35)
                        : spot;
                }

                ai.path = this.lobbyGrid
                    ? this.lobbyGrid.findNaturalPath(bot.state.x, bot.state.y, target.x, target.y, {
                          laneBias: ai.laneBias,
                          jitterPx: 12,
                      })
                    : [{ x: target.x, y: target.y }];
                ai.pauseUntil = now + 1800 + Math.random() * 2800;
            }
        });
    }

    computeNaturalSkeldPath(bot, goalX, goalY) {
        const ai = bot.ai;
        if (!bot.isAlive) {
            // Ghosts glide smoothly with slight curved arc rather than robotic bee-line
            const midX = (bot.state.x + goalX) * 0.5 + (Math.random() - 0.5) * 140;
            const midY = (bot.state.y + goalY) * 0.5 + (Math.random() - 0.5) * 140;
            return [{ x: Math.round(midX), y: Math.round(midY) }, { x: goalX, y: goalY }];
        }
        return this.skeldGrid
            ? this.skeldGrid.findNaturalPath(bot.state.x, bot.state.y, goalX, goalY, {
                  laneBias: ai.laneBias,
                  jitterPx: 20,
              })
            : [{ x: goalX, y: goalY }];
    }

    tickGame(now, dtSec) {
        const settings = this.room.settings;
        const baseSpeed = SKELD_CONSTANTS.BASE_SPEED_SKELD * (settings.playerSpeed || 1.0);
        const impSet = new Set(this.room.imposters || []);
        const diff = settings.botDifficulty || 'normal';
        const killRange = KILL_DISTANCE_MAP[settings.killDistance] || SKELD_CONSTANTS.KILL_RANGE;
        const killCooldownMs = (settings.killCooldownSec || 15) * 1000;
        const canScanVision = now - this.lastVisionCheckAt >= 240;
        if (canScanVision) this.lastVisionCheckAt = now;

        const allPlayers = Object.values(this.room.players);
        const alivePlayers = allPlayers.filter((p) => p.isAlive && !p.inVent);
        const crewSight = SKELD_CONSTANTS.CREW_BASE_VISION * (settings.crewVision || 1.0);
        const impSight = SKELD_CONSTANTS.IMPOSTOR_BASE_VISION * (settings.impostorVision || 1.25);

        allPlayers.forEach((bot) => {
            if (!bot.isBot || bot.inVent) return;
            const ai = bot.ai;
            if (!ai) return;

            const isImp = impSet.has(bot.id);
            const speed = (bot.isAlive ? baseSpeed : baseSpeed * 1.25) * ai.speedFactor;

            // 0. Social & Spatial Memory update (tracks who was seen in which room, and builds alibis!)
            if (canScanVision && bot.isAlive && !isImp) {
                const seenNearby = alivePlayers.filter(
                    (o) => o.id !== bot.id && dist(bot.state.x, bot.state.y, o.state.x, o.state.y) <= crewSight
                );
                const myRoom = getRoomNameAt(bot.state.x, bot.state.y);
                seenNearby.forEach((other) => {
                    ai.lastSeen[other.id] = {
                        room: getRoomNameAt(other.state.x, other.state.y),
                        time: now,
                        companions: seenNearby.length,
                    };
                    if (myRoom !== 'Hallway' && seenNearby.length >= 1) {
                        ai.trusted[other.id] = (ai.trusted[other.id] || 0) + 0.2;
                        if (
                            !ai.alibiPartnerId ||
                            (ai.trusted[other.id] || 0) > (ai.trusted[ai.alibiPartnerId] || 0)
                        ) {
                            ai.alibiPartnerId = other.id;
                        }
                    }
                });

                // Dead body spotting by alive Crewmate bots
                if (!this.pendingReport) {
                    const visibleBody = Object.values(this.room.deadBodies).find(
                        (b) => dist(bot.state.x, bot.state.y, b.x, b.y) <= crewSight
                    );
                    if (visibleBody) {
                        const reactionMs = diff === 'hard' ? 420 : diff === 'normal' ? 750 : 1180;
                        this.pendingReport = visibleBody.id;
                        this.scheduleTimer(() => {
                            if (
                                this.room?.started &&
                                !this.room.currentMeeting?.isActive &&
                                bot.isAlive &&
                                this.room.deadBodies[visibleBody.id]
                            ) {
                                this.startMeeting(bot.id, 'body', visibleBody.id);
                            } else {
                                this.pendingReport = null;
                            }
                        }, reactionMs);
                        return;
                    }
                }

                // Hard bots who witnessed a kill/vent rush to Emergency Button if safe
                if (ai.emergencyRush && (bot.emergencyCallsLeft ?? 0) > 0) {
                    const cdMs = (settings.emergencyCooldownSec || 15) * 1000;
                    const cdReady = now - (this.room.lastEmergencyAt || 0) >= cdMs;
                    if (cdReady) {
                        const btnDist = dist(
                            bot.state.x,
                            bot.state.y,
                            EMERGENCY_BUTTON_POS.x,
                            EMERGENCY_BUTTON_POS.y
                        );
                        if (btnDist <= SKELD_CONSTANTS.EMERGENCY_RANGE) {
                            ai.emergencyRush = false;
                            this.startMeeting(bot.id, 'emergency');
                            return;
                        }
                        if (now >= ai.repathAt || ai.path.length === 0) {
                            ai.repathAt = now + 600;
                            const btnSpot = this.skeldGrid
                                ? this.skeldGrid.pickRandomWalkableNear(
                                      EMERGENCY_BUTTON_POS.x,
                                      EMERGENCY_BUTTON_POS.y - 95,
                                      35
                                  )
                                : { x: EMERGENCY_BUTTON_POS.x, y: EMERGENCY_BUTTON_POS.y - 95 };
                            ai.path = this.computeNaturalSkeldPath(bot, btnSpot.x, btnSpot.y);
                        }
                    } else {
                        ai.emergencyRush = false;
                    }
                }

                // Danger evasion: if a confirmed suspect approaches while isolated, break away toward Cafeteria
                if (diff !== 'casual' && now < ai.fleeUntil && ai.path.length === 0) {
                    const safeGoal = SKELD_SPECIAL_SPOTS.cafeteriaButton;
                    ai.path = this.computeNaturalSkeldPath(bot, safeGoal.x, safeGoal.y);
                }
            }

            // 1. Impostor Bot hunting, opportunistic kill, & smart vent/alibi escape
            if (bot.isAlive && isImp) {
                const cdReady = now - (this.room.lastKillAt || 0) >= killCooldownMs;
                if (cdReady) {
                    const aliveTargets = alivePlayers.filter((p) => !impSet.has(p.id));
                    let bestVictim = null;
                    let bestScore = -Infinity;
                    let bestDist = Infinity;

                    for (const t of aliveTargets) {
                        const d = dist(bot.state.x, bot.state.y, t.state.x, t.state.y);
                        const searchCap = diff === 'hard' ? impSight * 2.1 : diff === 'normal' ? 540 : 420;
                        if (d > searchCap) continue;

                        const nearbyWitnesses = aliveTargets.filter(
                            (w) => w.id !== t.id && dist(w.state.x, w.state.y, t.state.x, t.state.y) <= 360
                        ).length;
                        const maxWitnesses = diff === 'hard' ? 0 : diff === 'normal' ? 1 : 2;
                        if (nearbyWitnesses > maxWitnesses) continue;

                        const roomName = getRoomNameAt(t.state.x, t.state.y);
                        const isolatedBonus = ['Electrical', 'Reactor', 'MedBay', 'Navigation', 'Communications'].includes(
                            roomName
                        )
                            ? 120
                            : 0;
                        const score = isolatedBonus - d - nearbyWitnesses * 240;
                        if (score > bestScore) {
                            bestScore = score;
                            bestDist = d;
                            bestVictim = t;
                        }
                    }

                    if (bestVictim) {
                        if (bestDist <= killRange * 0.88) {
                            const killed = this.executeKill(bot.id, bestVictim.id);
                            if (killed) {
                                ai.path = [];
                                ai.doingTaskId = null;
                                // Smart vent escape on Normal/Hard, or immediate walk away into another wing
                                const nearVent = SKELD_VENTS.find(
                                    (v) => dist(bot.state.x, bot.state.y, v.x, v.y) <= 210
                                );
                                const ventProb = diff === 'hard' ? 0.85 : diff === 'normal' ? 0.52 : 0.14;
                                if (nearVent && nearVent.targets?.length && Math.random() < ventProb) {
                                    const destId =
                                        nearVent.targets[Math.floor(Math.random() * nearVent.targets.length)];
                                    this.executeVent(bot.id, 'enter', nearVent.id);
                                    this.scheduleTimer(() => {
                                        this.executeVent(bot.id, 'move', destId);
                                    }, 420);
                                    this.scheduleTimer(() => {
                                        this.executeVent(bot.id, 'exit', destId);
                                        if (bot.isAlive) {
                                            const alibiSpot =
                                                SKELD_PATROL_SPOTS[
                                                    Math.floor(Math.random() * SKELD_PATROL_SPOTS.length)
                                                ];
                                            ai.path = this.computeNaturalSkeldPath(bot, alibiSpot.x, alibiSpot.y);
                                        }
                                    }, 920);
                                } else {
                                    // Walk briskly toward an opposite room to establish an alibi
                                    const farSpots = SKELD_PATROL_SPOTS.filter(
                                        (s) => dist(bot.state.x, bot.state.y, s.x, s.y) > 750
                                    );
                                    const escapeSpot =
                                        farSpots[Math.floor(Math.random() * farSpots.length)] ||
                                        SKELD_PATROL_SPOTS[0];
                                    ai.path = this.computeNaturalSkeldPath(bot, escapeSpot.x, escapeSpot.y);
                                }
                            }
                            return;
                        } else if (now >= ai.repathAt) {
                            ai.repathAt = now + (diff === 'hard' ? 420 : 600);
                            ai.path = this.computeNaturalSkeldPath(bot, bestVictim.state.x, bestVictim.state.y);
                        }
                    }
                }
            }

            // 2. Follow current smooth path
            if (ai.path.length > 0) {
                this.stepBotAlongPath(bot, speed * dtSec);
                return;
            }

            if (bot.state.moving) {
                bot.state.moving = false;
                this.emitToClient('player:moved', { id: bot.id, ...bot.state });
            }

            // 3. Performing a task (or faking a task for Impostors)
            if (ai.doingTaskId) {
                // Occasionally glance left/right subtly while working on console
                if (now >= ai.glanceAt) {
                    ai.glanceAt = now + 900 + Math.random() * 1200;
                    bot.state.d = Math.random() < 0.5 ? 'left' : 'right';
                    this.emitToClient('player:moved', { id: bot.id, ...bot.state });
                }
                if (now >= ai.taskDoneAt) {
                    const doneId = ai.doingTaskId;
                    ai.doingTaskId = null;
                    if (!isImp) {
                        this.completeTask(bot.id, doneId, false);
                    } else {
                        const fake = (bot.tasks || []).find((t) => t.id === doneId);
                        if (fake) fake.completed = true;
                    }
                    // Natural post-task hesitation before heading out
                    ai.pauseUntil = now + 450 + Math.random() * 1250;
                }
                return;
            }

            if (now < ai.pauseUntil) return;

            // 4. Organic human micro-decisions: detour to Security/Admin/Buddy or pick next task!
            if (bot.isAlive && !ai.detourGoal && Math.random() < (diff === 'hard' ? 0.24 : 0.16)) {
                const choices = [
                    SKELD_SPECIAL_SPOTS.securityCams,
                    SKELD_SPECIAL_SPOTS.adminMap,
                    SKELD_SPECIAL_SPOTS.storageCenter,
                ];
                // Cautious/social crewmates sometimes visit their trusted buddy's room
                if (!isImp && ai.alibiPartnerId && (ai.personality === 'cautious' || ai.personality === 'social')) {
                    const buddy = this.room.players[ai.alibiPartnerId];
                    if (buddy && buddy.isAlive) {
                        choices.push({ x: buddy.state.x, y: buddy.state.y, room: 'Buddy' });
                    }
                }
                const detour = choices[Math.floor(Math.random() * choices.length)];
                const dest =
                    this.skeldGrid && bot.isAlive
                        ? this.skeldGrid.pickRandomWalkableNear(detour.x, detour.y, 48)
                        : detour;
                ai.detourGoal = true;
                ai.path = this.computeNaturalSkeldPath(bot, dest.x, dest.y);
                ai.pauseUntil = now + 1700 + Math.random() * 2400;
                return;
            }
            ai.detourGoal = false;

            const remainingTasks = (bot.tasks || []).filter((t) => !t.completed);
            if (remainingTasks.length > 0) {
                // Human players tend to pick nearby tasks or logical loops instead of teleporting across ship randomly
                let nextTask;
                if (diff === 'hard' || ai.personality === 'tasker' || Math.random() < 0.65) {
                    const sorted = [...remainingTasks].sort(
                        (a, b) => dist(bot.state.x, bot.state.y, a.x, a.y) - dist(bot.state.x, bot.state.y, b.x, b.y)
                    );
                    const pickPool = sorted.slice(0, Math.min(2, sorted.length));
                    nextTask = pickPool[Math.floor(Math.random() * pickPool.length)];
                } else {
                    nextTask = remainingTasks[Math.floor(Math.random() * remainingTasks.length)];
                }

                if (dist(bot.state.x, bot.state.y, nextTask.x, nextTask.y) <= 72) {
                    ai.doingTaskId = nextTask.id;
                    const taskMs =
                        diff === 'hard'
                            ? 2000 + Math.random() * 1900
                            : diff === 'normal'
                              ? 2900 + Math.random() * 2300
                              : 4200 + Math.random() * 3100;
                    ai.taskDoneAt = now + taskMs;
                    return;
                }

                const dest =
                    this.skeldGrid && bot.isAlive
                        ? this.skeldGrid.pickRandomWalkableNear(nextTask.x, nextTask.y, 34)
                        : { x: nextTask.x, y: nextTask.y };
                ai.path = this.computeNaturalSkeldPath(bot, dest.x, dest.y);
            } else {
                const spot = SKELD_PATROL_SPOTS[Math.floor(Math.random() * SKELD_PATROL_SPOTS.length)];
                const dest =
                    this.skeldGrid && bot.isAlive
                        ? this.skeldGrid.pickRandomWalkableNear(spot.x, spot.y, 55)
                        : spot;
                ai.path = this.computeNaturalSkeldPath(bot, dest.x, dest.y);
                ai.pauseUntil = now + 1500 + Math.random() * 2600;
            }
        });
    }

    stepBotAlongPath(bot, maxStep) {
        const ai = bot.ai;
        if (!ai || ai.path.length === 0) return;

        let remaining = maxStep;
        while (ai.path.length > 0 && remaining > 0) {
            const target = ai.path[0];
            const dx = target.x - bot.state.x;
            const dy = target.y - bot.state.y;
            const d = Math.hypot(dx, dy);

            if (d <= remaining) {
                bot.state.x = target.x;
                bot.state.y = target.y;
                if (Math.abs(dx) > 0.25) {
                    bot.state.d = dx < 0 ? 'left' : 'right';
                }
                ai.path.shift();
                remaining -= d;
            } else {
                bot.state.x += (dx / d) * remaining;
                bot.state.y += (dy / d) * remaining;
                if (Math.abs(dx) > 0.25) {
                    bot.state.d = dx < 0 ? 'left' : 'right';
                }
                remaining = 0;
            }
        }

        bot.state.moving = true;
        this.emitToClient('player:moved', {
            id: bot.id,
            x: Math.round(bot.state.x * 10) / 10,
            y: Math.round(bot.state.y * 10) / 10,
            d: bot.state.d,
            moving: true,
        });
    }

    stop() {
        this.clearTimers();
        this.room = null;
        this.humanId = null;
    }
}
