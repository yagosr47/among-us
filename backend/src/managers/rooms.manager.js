import { PlayersManager } from "./players.manager.js";
import {
    CAFETERIA_SPAWNS,
    DEFAULT_ROOM_SETTINGS,
    GAME_CONSTANTS,
    LOBBY_SPAWNS,
    SKELD_TASKS,
    VALID_REGIONS,
    sanitizeRoomSettings,
} from "../config/skeldData.js";

/**
 * @type {Record<string, import('../types/room.type.js').GameRoom>}
 */
const rooms = {};

function pickRandomTasks(count = DEFAULT_ROOM_SETTINGS.tasksPerPlayer) {
    const pool = [...SKELD_TASKS];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const safeCount = Math.max(1, Math.min(pool.length, Number(count) || GAME_CONSTANTS.TASKS_PER_PLAYER));
    return pool.slice(0, safeCount).map((t) => ({ ...t, completed: false }));
}

export function getImposterIds(room) {
    if (!room) return [];
    if (Array.isArray(room.imposters) && room.imposters.length > 0) {
        return room.imposters;
    }
    return room.imposter ? [room.imposter] : [];
}

/**
 * Strip secret role/socket fields before sending player state to clients
 * @param {import('../types/room.type.js').Player} player
 */
export function serializePlayer(player) {
    if (!player) return null;
    return {
        id: player.id,
        name: player.name,
        roomId: player.roomId,
        state: { ...player.state },
        color: player.color,
        isAlive: player.isAlive,
        inVent: Boolean(player.inVent),
        emergencyCallsLeft: Number.isFinite(player.emergencyCallsLeft)
            ? player.emergencyCallsLeft
            : DEFAULT_ROOM_SETTINGS.emergencyMeetings,
    };
}

/**
 * Compute aggregate crewmate task completion stats (excludes imposter fake tasks)
 * @param {import('../types/room.type.js').GameRoom} room
 */
export function getTaskSummary(room) {
    if (!room) return { completed: 0, total: 0, ratio: 0 };
    const imposterSet = new Set(getImposterIds(room));
    let completed = 0;
    let total = 0;
    Object.values(room.players).forEach((p) => {
        if (imposterSet.has(p.id)) return;
        const tasks = p.tasks || [];
        total += tasks.length;
        completed += tasks.filter((t) => t.completed).length;
    });
    return {
        completed,
        total,
        ratio: total > 0 ? completed / total : 0,
    };
}

/**
 * Strip secret imposter identity before broadcasting a room
 * @param {import('../types/room.type.js').GameRoom} room
 */
export function serializeRoom(room) {
    if (!room) return null;
    /** @type {Record<string, ReturnType<typeof serializePlayer>>} */
    const safePlayers = {};
    Object.entries(room.players).forEach(([id, p]) => {
        safePlayers[id] = serializePlayer(p);
    });

    return {
        id: room.id,
        name: room.name || `${room.host?.name || 'Crew'}'s Ship`,
        isPublic: room.isPublic !== false,
        region: room.region || 'SA',
        map: room.map || 'The Skeld',
        started: room.started,
        host: serializePlayer(room.host),
        players: safePlayers,
        playerCount: Object.keys(safePlayers).length,
        maxPlayers: GAME_CONSTANTS.MAX_PLAYERS_PER_ROOM,
        settings: sanitizeRoomSettings(room.settings),
        deadBodies: { ...(room.deadBodies || {}) },
        taskSummary: getTaskSummary(room),
        lastEmergencyAt: room.lastEmergencyAt || 0,
        currentMeeting: room.currentMeeting
            ? {
                  isActive: room.currentMeeting.isActive,
                  type: room.currentMeeting.type,
                  callerId: room.currentMeeting.callerId,
                  bodyPlayerId: room.currentMeeting.bodyPlayerId,
                  votes: { ...room.currentMeeting.votes },
                  endTime: room.currentMeeting.endTime,
              }
            : null,
    };
}

export const RoomsManager = {
    players: {
        /**
         * @param {string} roomId
         * @param {import('../types/room.type.js').Player} player
         */
        add(roomId, player) {
            const room = rooms[roomId];
            if (!room) return undefined;
            const idx = Object.keys(room.players).length;
            PlayersManager.resetPlayer(player.id, idx);
            const updated = PlayersManager.setRoomId(player.id, roomId);
            if (!updated) return undefined;
            updated.emergencyCallsLeft = room.settings?.emergencyMeetings ?? DEFAULT_ROOM_SETTINGS.emergencyMeetings;
            room.players[updated.id] = updated;
            return updated;
        },

        /**
         * @param {string} roomId
         * @param {import('../types/room.type.js').Player} player
         * @returns {{ deleted: boolean, newHostId?: string }}
         */
        remove(roomId, player) {
            const room = rooms[roomId];
            if (!room) return { deleted: false };
            delete room.players[player.id];
            const remainingPlayers = Object.values(room.players);
            if (remainingPlayers.length < 1) {
                if (room.currentMeeting?.timeoutId) {
                    clearTimeout(room.currentMeeting.timeoutId);
                    room.currentMeeting.timeoutId = null;
                }
                delete rooms[roomId];
                return { deleted: true };
            }
            let newHostId;
            if (room.host.id === player.id) {
                room.host = remainingPlayers[0];
                newHostId = room.host.id;
            }
            return { deleted: false, newHostId };
        },

        /**
         * @param {string} roomId
         * @param {string} playerId
         * @param {Partial<import('../types/room.type.js').PlayerState>} state
         */
        updateState(roomId, playerId, state) {
            const room = rooms[roomId];
            if (!room || !room.players[playerId]) return;
            room.players[playerId].state = {
                ...room.players[playerId].state,
                ...state,
            };
        },
    },

    meetings: {
        /**
         * @param {string} roomId
         * @param {string} callerId
         * @param {'emergency' | 'body'} type
         * @param {string | null} bodyPlayerId
         * @param {(payload: { roomId: string }) => void} endFunc
         */
        create(roomId, callerId, type, bodyPlayerId, endFunc) {
            const room = rooms[roomId];
            if (!room) return null;
            if (room.currentMeeting?.timeoutId) {
                clearTimeout(room.currentMeeting.timeoutId);
            }

            const durationMs =
                (room.settings?.meetingDurationSec || DEFAULT_ROOM_SETTINGS.meetingDurationSec) * 1000;
            const endTime = Date.now() + durationMs;
            const timeoutId = setTimeout(() => {
                endFunc({ roomId });
            }, durationMs);

            room.currentMeeting = {
                isActive: true,
                type,
                callerId,
                bodyPlayerId,
                votes: {},
                endTime,
                timeoutId,
            };

            // Bring everyone out of vents during a meeting
            Object.values(room.players).forEach((p) => {
                p.inVent = false;
            });

            return room.currentMeeting;
        },

        /**
         * @param {string} roomId
         * @param {string} voterId
         * @param {string} votedForId
         */
        vote(roomId, voterId, votedForId) {
            const room = rooms[roomId];
            const meeting = room?.currentMeeting;
            if (!room || !meeting || !meeting.isActive) {
                return { accepted: false, allVoted: false, reason: 'No active meeting' };
            }

            const voter = room.players[voterId];
            if (!voter || !voter.isAlive) {
                return { accepted: false, allVoted: false, reason: 'Only alive players can vote' };
            }

            if (meeting.votes[voterId] !== undefined) {
                return { accepted: false, allVoted: false, reason: 'Already voted' };
            }

            const targetId = votedForId || 'skip';
            if (targetId !== 'skip') {
                const target = room.players[targetId];
                if (!target || !target.isAlive) {
                    return { accepted: false, allVoted: false, reason: 'Invalid vote target' };
                }
            }

            meeting.votes[voterId] = targetId;
            const alivePlayers = Object.values(room.players).filter((p) => p.isAlive);
            const voteCount = Object.keys(meeting.votes).length;

            return {
                accepted: true,
                allVoted: voteCount >= alivePlayers.length,
                votedForId: targetId,
                voteCount,
                totalAlive: alivePlayers.length,
            };
        },

        /**
         * @param {string} roomId
         * @returns {import('../types/room.type.js').MeetingResults | null}
         */
        end(roomId) {
            const room = rooms[roomId];
            const meeting = room?.currentMeeting;
            if (!room || !meeting || !meeting.isActive) return null;

            if (meeting.timeoutId) {
                clearTimeout(meeting.timeoutId);
                meeting.timeoutId = null;
            }

            meeting.isActive = false;
            const rawVotes = { ...(meeting.votes || {}) };
            const imposterSet = new Set(getImposterIds(room));
            const settings = room.settings || DEFAULT_ROOM_SETTINGS;

            /** @type {Record<string, number>} */
            const counts = {};
            let max = 0;
            /** @type {string[]} */
            let winners = [];

            Object.values(rawVotes).forEach((votedForId) => {
                if (!votedForId) return;
                counts[votedForId] = (counts[votedForId] || 0) + 1;
                if (counts[votedForId] > max) {
                    max = counts[votedForId];
                    winners = [votedForId];
                } else if (counts[votedForId] === max) {
                    winners.push(votedForId);
                }
            });

            let ejectedId = null;
            let ejectedName = null;
            let ejectedColor = null;
            let wasImposter = false;

            const tie = winners.length > 1;
            const skipped = winners.length === 0 || (winners.length === 1 && winners[0] === 'skip');

            if (!tie && !skipped && winners.length === 1) {
                const candidate = room.players[winners[0]];
                if (candidate && candidate.isAlive) {
                    ejectedId = candidate.id;
                    ejectedName = candidate.name;
                    ejectedColor = candidate.color;
                    wasImposter = imposterSet.has(candidate.id);
                    candidate.isAlive = false;
                }
            }

            const remainingImpostors = Object.values(room.players).filter(
                (p) => p.isAlive && imposterSet.has(p.id)
            ).length;

            // Clear dead bodies after meeting concludes and respawn players around Cafeteria table
            room.deadBodies = {};
            const playerList = Object.values(room.players);
            playerList.forEach((p, idx) => {
                const spawn = CAFETERIA_SPAWNS[idx % CAFETERIA_SPAWNS.length];
                p.state = { x: spawn.x, y: spawn.y, d: 'right', moving: false };
                p.inVent = false;
            });

            // Reset kill and emergency cooldowns after meeting
            const now = Date.now();
            room.lastKillAt = now;
            room.lastEmergencyAt = now;

            const anonymousVotes = Boolean(settings.anonymousVotes);
            meeting.results = {
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
            return meeting.results;
        },
    },

    /**
     * @param {string} roomId
     * @param {import('../types/room.type.js').Player} host
     * @param {{ name?: string, isPublic?: boolean, region?: string, settings?: Partial<import('../types/room.type.js').RoomSettings> }} [options]
     */
    createRoom(roomId, host, options = {}) {
        if (!roomId || rooms[roomId]) return null;
        const cleanName = String(options.name || `${host?.name || 'Crew'}'s Ship`)
            .trim()
            .slice(0, 28);
        const region = VALID_REGIONS.includes(options.region) ? options.region : 'SA';
        rooms[roomId] = {
            id: roomId,
            name: cleanName || `${host?.name || 'Crew'}'s Ship`,
            isPublic: options.isPublic !== false,
            region,
            map: 'The Skeld',
            started: false,
            imposter: null,
            imposters: [],
            host,
            settings: sanitizeRoomSettings(options.settings),
            players: {},
            deadBodies: {},
            lastKillAt: 0,
            lastEmergencyAt: 0,
            currentMeeting: null,
        };
        return rooms[roomId];
    },

    /**
     * @param {string} roomId
     * @param {Partial<import('../types/room.type.js').RoomSettings>} patch
     */
    updateSettings(roomId, patch) {
        const room = rooms[roomId];
        if (!room || room.started) return null;
        room.settings = sanitizeRoomSettings(patch, room.settings);
        return room.settings;
    },

    /**
     * @param {string} roomId
     * @param {{ isPublic?: boolean, region?: string, name?: string }} patch
     */
    updateMeta(roomId, patch = {}) {
        const room = rooms[roomId];
        if (!room || room.started) return null;
        if (typeof patch.isPublic === 'boolean') {
            room.isPublic = patch.isPublic;
        }
        if (patch.region && VALID_REGIONS.includes(patch.region)) {
            room.region = patch.region;
        }
        if (typeof patch.name === 'string' && patch.name.trim()) {
            room.name = patch.name.trim().slice(0, 28);
        }
        return room;
    },

    /**
     * Allow a player in waiting lobby to update their name/color via Laptop
     * @param {string} roomId
     * @param {string} playerId
     * @param {{ name?: string, color?: string }} patch
     */
    customizePlayer(roomId, playerId, patch = {}) {
        const room = rooms[roomId];
        if (!room || room.started) return { ok: false, message: 'Cannot customize right now' };
        const player = room.players[playerId];
        if (!player) return { ok: false, message: 'Player not in room' };

        const others = Object.values(room.players).filter((p) => p.id !== playerId);

        let cleanName;
        if (typeof patch.name === 'string') {
            cleanName = patch.name.trim().slice(0, 20);
            if (!cleanName) {
                return { ok: false, message: 'Name cannot be empty' };
            }
            const dupName = others.some((p) => p.name.toLowerCase() === cleanName.toLowerCase());
            if (dupName) {
                return { ok: false, message: 'Name already taken in this room' };
            }
        }

        let cleanColor;
        if (typeof patch.color === 'string' && patch.color.trim()) {
            cleanColor = patch.color.trim();
            const dupColor = others.some((p) => p.color.toLowerCase() === cleanColor.toLowerCase());
            if (dupColor) {
                return { ok: false, message: 'Color already taken in this room' };
            }
        }

        if (cleanName !== undefined) player.name = cleanName;
        if (cleanColor !== undefined) player.color = cleanColor;

        if (room.host?.id === playerId) {
            room.host = player;
        }
        return { ok: true, player };
    },

    fetchRooms() {
        return Object.values(rooms).map(serializeRoom);
    },

    /**
     * @param {string} roomId
     */
    fetchRoom(roomId) {
        return rooms[roomId];
    },

    /**
     * @param {string} roomId
     */
    fetchSafeRoom(roomId) {
        const room = rooms[roomId];
        return room ? serializeRoom(room) : null;
    },

    /**
     * @param {string} roomId
     */
    startGame(roomId) {
        const room = rooms[roomId];
        if (!room) return null;

        const players = Object.values(room.players);
        if (players.length === 0) {
            room.imposter = null;
            room.imposters = [];
            return null;
        }

        if (room.currentMeeting?.timeoutId) {
            clearTimeout(room.currentMeeting.timeoutId);
        }
        room.currentMeeting = null;
        room.deadBodies = {};
        room.started = true;

        const settings = sanitizeRoomSettings(room.settings);
        room.settings = settings;

        const killCooldownMs = settings.killCooldownSec * 1000;
        const initialCooldownMs = Math.min(GAME_CONSTANTS.INITIAL_KILL_COOLDOWN_MS, killCooldownMs);
        const now = Date.now();
        // Initial kill cooldown gives crewmates a short breather at round start
        room.lastKillAt = now - (killCooldownMs - initialCooldownMs);
        room.lastEmergencyAt = now;

        // Shuffle indices cleanly and pick 1..maxImpostors while ensuring crewmates start strictly ahead
        const maxPossibleImposters = Math.max(1, Math.floor((players.length - 1) / 2));
        const targetImpostorCount = Math.max(1, Math.min(settings.impostorCount, maxPossibleImposters));
        const shuffled = [...players];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        const chosenImposters = shuffled.slice(0, targetImpostorCount).map((p) => p.id);
        const imposterSet = new Set(chosenImposters);
        room.imposters = chosenImposters;
        room.imposter = chosenImposters[0] || null;

        players.forEach((p, i) => {
            const spawn = CAFETERIA_SPAWNS[i % CAFETERIA_SPAWNS.length];
            p.isAlive = true;
            p.inVent = false;
            p.isImposter = imposterSet.has(p.id);
            p.emergencyCallsLeft = settings.emergencyMeetings;
            p.tasks = pickRandomTasks(settings.tasksPerPlayer);
            p.state = { x: spawn.x, y: spawn.y, d: 'right', moving: false };
        });

        return room;
    },

    /**
     * Reset a finished room back to lobby state for Play Again
     * @param {string} roomId
     */
    resetToLobby(roomId) {
        const room = rooms[roomId];
        if (!room) return null;

        if (room.currentMeeting?.timeoutId) {
            clearTimeout(room.currentMeeting.timeoutId);
        }
        room.currentMeeting = null;
        room.deadBodies = {};
        room.started = false;
        room.imposter = null;
        room.imposters = [];
        room.lastKillAt = 0;
        room.lastEmergencyAt = 0;

        Object.values(room.players).forEach((p, idx) => {
            const spawn = LOBBY_SPAWNS[idx % LOBBY_SPAWNS.length];
            p.isAlive = true;
            p.isImposter = false;
            p.inVent = false;
            p.emergencyCallsLeft = room.settings?.emergencyMeetings ?? DEFAULT_ROOM_SETTINGS.emergencyMeetings;
            p.tasks = [];
            p.state = { x: spawn.x, y: spawn.y, d: 'right', moving: false };
        });

        return room;
    },

    /**
     * @param {string} roomId
     * @param {string} playerId
     * @param {string} taskId
     */
    completeTask(roomId, playerId, taskId) {
        const room = rooms[roomId];
        if (!room || !room.started) return { completed: false };
        const player = room.players[playerId];
        if (!player) return { completed: false };

        const task = (player.tasks || []).find((t) => t.id === taskId);
        if (!task || task.completed) return { completed: false };

        task.completed = true;
        const imposterSet = new Set(getImposterIds(room));
        return {
            completed: true,
            isCrewmateTask: !imposterSet.has(player.id),
            taskSummary: getTaskSummary(room),
        };
    },

    /**
     * @param {string} roomId
     * @returns {{ winner: 'imposter' | 'crewmates', isImposter: boolean, reason: string } | null}
     */
    checkWin(roomId) {
        const room = rooms[roomId];
        if (!room || !room.started) return null;

        const players = Object.values(room.players);
        const imposterIds = getImposterIds(room);
        if (imposterIds.length === 0) return null;

        const imposterSet = new Set(imposterIds);
        const alivePlayers = players.filter((p) => p.isAlive);
        const aliveImposters = alivePlayers.filter((p) => imposterSet.has(p.id));
        const aliveCrewmates = alivePlayers.filter((p) => !imposterSet.has(p.id));

        if (aliveImposters.length === 0) {
            return { winner: 'crewmates', isImposter: false, reason: 'imposter_eliminated' };
        }

        if (aliveImposters.length >= aliveCrewmates.length) {
            return { winner: 'imposter', isImposter: true, reason: 'outnumbered' };
        }

        const taskSummary = getTaskSummary(room);
        if (taskSummary.total > 0 && taskSummary.completed >= taskSummary.total) {
            return { winner: 'crewmates', isImposter: false, reason: 'tasks_completed' };
        }

        return null;
    },
};
