import { LOBBY_SPAWNS } from "../config/skeldData.js";

/**
 * @type {Record<string, import('../types/room.type.js').Player>}
 */
const players = {};

export const PlayersManager = {
    /**
     * @param {string} id
     * @param {string} name
     * @param {string} color
     * @param {string | null} roomId
     * @param {string | null} socketId
     */
    createPlayer(id, name, color, roomId = null, socketId = null) {
        const cleanName = String(name || 'Crewmate').trim().slice(0, 20) || 'Crewmate';
        if (!players[id]) {
            const spawn = LOBBY_SPAWNS[Object.keys(players).length % LOBBY_SPAWNS.length];
            players[id] = {
                id,
                name: cleanName,
                roomId,
                socketId,
                state: { x: spawn.x, y: spawn.y, d: 'right', moving: false },
                color,
                isImposter: false,
                isAlive: true,
                inVent: false,
                tasks: [],
            };
        } else {
            players[id].name = cleanName;
            players[id].color = color;
            if (socketId) players[id].socketId = socketId;
        }
        return players[id];
    },

    /**
     * @param {string} id
     */
    deletePlayer(id) {
        delete players[id];
    },

    /**
     * @param {string} id
     * @param {Partial<import('../types/room.type.js').PlayerState>} state
     */
    updatePlayerState(id, state) {
        if (players[id]) {
            players[id].state = { ...players[id].state, ...state };
        }
    },

    /**
     * @param {string} id
     */
    getPlayer(id) {
        return players[id];
    },

    getAllPlayers() {
        return Object.values(players);
    },

    /**
     * @param {string} id
     * @param {number} [spawnIdx]
     */
    resetPlayer(id, spawnIdx = 0) {
        if (players[id]) {
            const spawn = LOBBY_SPAWNS[spawnIdx % LOBBY_SPAWNS.length];
            players[id].state = { x: spawn.x, y: spawn.y, d: 'right', moving: false };
            players[id].isAlive = true;
            players[id].isImposter = false;
            players[id].inVent = false;
            players[id].tasks = [];
        }
    },

    /**
     * @param {string} id
     * @param {string | null} roomId
     */
    setRoomId(id, roomId) {
        if (players[id]) {
            players[id].roomId = roomId;
            return players[id];
        }
        return undefined;
    },

    /**
     * @param {string} id
     * @param {string | null} socketId
     */
    setSocketId(id, socketId) {
        if (players[id]) {
            players[id].socketId = socketId;
        }
    },
};
