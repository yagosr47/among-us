import { PlayersManager } from "./players.manager.js";
import {
    CAFETERIA_SPAWNS,
    GAME_CONSTANTS,
    LOBBY_SPAWNS,
    SKELD_TASKS,
} from "../config/skeldData.js";

/**
 * @type {Record<string, import('../types/room.type.js').GameRoom>}
 */
const rooms = {};

function pickRandomTasks(count = GAME_CONSTANTS.TASKS_PER_PLAYER) {
    const pool = [...SKELD_TASKS];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count).map((t) => ({ ...t, completed: false }));
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
    };
}

/**
 * Compute aggregate crewmate task completion stats (excludes imposter fake tasks)
 * @param {import('../types/room.type.js').GameRoom} room
 */
export function getTaskSummary(room) {
    if (!room) return { completed: 0, total: 0, ratio: 0 };
    let completed = 0;
    let total = 0;
    Object.values(room.players).forEach((p) => {
        if (p.id === room.imposter) return;
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
        started: room.started,
        host: serializePlayer(room.host),
        players: safePlayers,
        deadBodies: { ...(room.deadBodies || {}) },
        taskSummary: getTaskSummary(room),
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

            const endTime = Date.now() + GAME_CONSTANTS.MEETING_DURATION_MS;
            const timeoutId = setTimeout(() => {
                endFunc({ roomId });
            }, GAME_CONSTANTS.MEETING_DURATION_MS);

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
            const votes = { ...(meeting.votes || {}) };

            /** @type {Record<string, number>} */
            const counts = {};
            let max = 0;
            /** @type {string[]} */
            let winners = [];

            Object.values(votes).forEach((votedForId) => {
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
                    wasImposter = room.imposter === candidate.id;
                    candidate.isAlive = false;
                }
            }

            // Clear dead bodies after meeting concludes and respawn players around Cafeteria table
            room.deadBodies = {};
            const playerList = Object.values(room.players);
            playerList.forEach((p, idx) => {
                const spawn = CAFETERIA_SPAWNS[idx % CAFETERIA_SPAWNS.length];
                p.state = { x: spawn.x, y: spawn.y, d: 'right', moving: false };
                p.inVent = false;
            });

            // Reset kill cooldown after meeting
            room.lastKillAt = Date.now();

            meeting.results = {
                ejectedId,
                ejectedName,
                ejectedColor,
                wasImposter,
                tie,
                skipped,
                counts,
                votes,
            };
            return meeting.results;
        },
    },

    /**
     * @param {string} roomId
     * @param {import('../types/room.type.js').Player} host
     */
    createRoom(roomId, host) {
        if (!roomId || rooms[roomId]) return null;
        rooms[roomId] = {
            id: roomId,
            started: false,
            imposter: null,
            host,
            players: {},
            deadBodies: {},
            lastKillAt: 0,
            currentMeeting: null,
        };
        return rooms[roomId];
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
            return null;
        }

        if (room.currentMeeting?.timeoutId) {
            clearTimeout(room.currentMeeting.timeoutId);
        }
        room.currentMeeting = null;
        room.deadBodies = {};
        room.started = true;

        // Initial kill cooldown gives crewmates a short breather at round start
        room.lastKillAt =
            Date.now() -
            (GAME_CONSTANTS.KILL_COOLDOWN_MS - GAME_CONSTANTS.INITIAL_KILL_COOLDOWN_MS);

        const idx = Math.floor(Math.random() * players.length);
        room.imposter = players[idx].id;

        players.forEach((p, i) => {
            const spawn = CAFETERIA_SPAWNS[i % CAFETERIA_SPAWNS.length];
            p.isAlive = true;
            p.inVent = false;
            p.isImposter = p.id === room.imposter;
            p.tasks = pickRandomTasks(GAME_CONSTANTS.TASKS_PER_PLAYER);
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
        room.lastKillAt = 0;

        Object.values(room.players).forEach((p, idx) => {
            const spawn = LOBBY_SPAWNS[idx % LOBBY_SPAWNS.length];
            p.isAlive = true;
            p.isImposter = false;
            p.inVent = false;
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
        return {
            completed: true,
            isCrewmateTask: player.id !== room.imposter,
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
        const imposterId = room.imposter;
        if (!imposterId) return null;

        const alivePlayers = players.filter((p) => p.isAlive);
        const aliveImposters = alivePlayers.filter((p) => p.id === imposterId);
        const aliveCrewmates = alivePlayers.filter((p) => p.id !== imposterId);

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
