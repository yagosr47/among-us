import { PlayersManager } from "../managers/players.manager.js";
import { RoomsManager, serializePlayer, serializeRoom } from "../managers/rooms.manager.js";
import { GAME_CONSTANTS } from "../config/skeldData.js";

/** @type {Record<string, string>} */
const socketToPlayerId = {};

/**
 * Helper to clean up a player leaving/disconnecting from their room
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {string} playerId
 * @param {boolean} deletePlayer
 */
function leaveCurrentRoom(io, socket, playerId, deletePlayer = false) {
    const player = PlayersManager.getPlayer(playerId);
    if (!player) return;

    const roomId = player.roomId;
    if (roomId) {
        const room = RoomsManager.fetchRoom(roomId);
        const { deleted, newHostId } = RoomsManager.players.remove(roomId, player);
        socket.leave(roomId);

        io.to(roomId).emit("player:left", {
            playerId: player.id,
            newHostId: newHostId || null,
        });

        if (!deleted && room) {
            const win = RoomsManager.checkWin(roomId);
            if (win !== null) {
                io.to(roomId).emit("game:ended", {
                    roomId,
                    ...win,
                    imposterId: room.imposter,
                    imposterName: room.imposter ? room.players[room.imposter]?.name : null,
                });
            }
            io.emit("room:updated", { room: serializeRoom(room) });
        }

        if (deleted) {
            io.emit("room:deleted", { roomId });
        }
    }

    if (deletePlayer) {
        PlayersManager.deletePlayer(playerId);
    } else {
        PlayersManager.resetPlayer(playerId);
        PlayersManager.setRoomId(playerId, null);
    }
}

/**
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export const registerRoomEvents = (io, socket) => {
    /**
     * @param {{ id: string, name: string, color: string }} data
     */
    const playerRegister = (data) => {
        if (!data?.id || !data?.name) return;
        socketToPlayerId[socket.id] = data.id;
        socket.data.playerId = data.id;
        PlayersManager.createPlayer(data.id, data.name, data.color, null, socket.id);
        socket.emit("player:registered", { playerId: data.id });
    };

    const playerUnregister = (data) => {
        const playerId = socket.data.playerId || data?.playerId;
        if (!playerId) return;
        leaveCurrentRoom(io, socket, playerId, true);
        delete socketToPlayerId[socket.id];
        socket.data.playerId = null;
        socket.emit("player:unregistered");
    };

    /**
     * @param {{ hostId?: string, roomId: string }} data
     */
    const roomCreate = (data) => {
        const hostId = socket.data.playerId || data?.hostId;
        const roomId = String(data?.roomId || "").trim().toUpperCase();
        if (!hostId || !roomId) return;

        const player = PlayersManager.getPlayer(hostId);
        if (!player) {
            socket.emit("room:join:error", { message: "Player not registered. Register first." });
            return;
        }

        const room = RoomsManager.createRoom(roomId, player);
        if (!room) {
            socket.emit("room:join:error", { message: "Room ID already exists. Try again." });
            return;
        }

        io.emit("room:created", { roomId, room: serializeRoom(room) });
        roomJoin({ playerId: hostId, roomId });
    };

    /**
     * @param {{ playerId?: string, roomId: string }} data
     */
    const roomJoin = (data) => {
        const playerId = socket.data.playerId || data?.playerId;
        const roomId = data?.roomId;
        if (!playerId || !roomId) {
            socket.emit("room:join:error", { message: "Missing playerId or roomId" });
            return;
        }

        socketToPlayerId[socket.id] = playerId;
        socket.data.playerId = playerId;

        let player = PlayersManager.getPlayer(playerId);
        if (!player) {
            socket.emit("room:join:error", { message: "Player not registered. Register first." });
            return;
        }
        PlayersManager.setSocketId(playerId, socket.id);

        if (player.roomId && player.roomId !== roomId) {
            leaveCurrentRoom(io, socket, playerId, false);
        }

        const room = RoomsManager.fetchRoom(roomId);
        if (!room || room.started) {
            socket.emit("room:join:error", { message: "Room not found or game already started" });
            return;
        }

        const existingPlayers = Object.values(room.players);
        if (existingPlayers.length >= GAME_CONSTANTS.MAX_PLAYERS_PER_ROOM) {
            socket.emit("room:join:error", { message: "Room is full (max 10 players)" });
            return;
        }

        const nameTaken = existingPlayers.some(
            (p) => p.id !== player.id && p.name.toLowerCase() === player.name.toLowerCase()
        );
        if (nameTaken) {
            socket.emit("room:join:error", { message: "Name already taken in this room" });
            return;
        }

        const colorTaken = existingPlayers.some(
            (p) => p.id !== player.id && p.color.toLowerCase() === player.color.toLowerCase()
        );
        if (colorTaken) {
            socket.emit("room:join:error", { message: "Color already taken in this room" });
            return;
        }

        player = RoomsManager.players.add(roomId, player);
        socket.join(roomId);

        const safeRoom = serializeRoom(room);
        const safePlayer = serializePlayer(player);

        socket.emit("room:joined", {
            roomId,
            room: safeRoom,
            player: safePlayer,
            started: room.started,
        });
        socket.to(roomId).emit("player:joined", { player: safePlayer, roomId });
        io.emit("room:updated", { room: safeRoom });
    };

    const roomLeave = (data) => {
        const playerId = socket.data.playerId || data?.playerId;
        if (!playerId) return;
        leaveCurrentRoom(io, socket, playerId, false);
    };

    const gameStart = (data) => {
        const playerId = socket.data.playerId;
        const roomId = data?.roomId;
        const room = RoomsManager.fetchRoom(roomId);
        if (!room) {
            socket.emit("game:notif", { message: "Room not found" });
            return;
        }
        if (playerId && room.host?.id !== playerId) {
            socket.emit("game:notif", { message: "Only the host can start the game" });
            return;
        }
        if (Object.keys(room.players).length < 2) {
            socket.emit("game:notif", { message: "Need at least 2 players to start the game" });
            return;
        }

        RoomsManager.startGame(roomId);
        const safeRoom = serializeRoom(room);

        io.to(roomId).emit("game:started", {
            roomId,
            room: safeRoom,
            killCooldownMs: GAME_CONSTANTS.KILL_COOLDOWN_MS,
            initialCooldownMs: GAME_CONSTANTS.INITIAL_KILL_COOLDOWN_MS,
        });

        // Deliver private role & task list individually to each player's socket
        Object.values(room.players).forEach((p) => {
            if (p.socketId) {
                io.to(p.socketId).emit("game:role", {
                    roomId,
                    isImposter: p.id === room.imposter,
                    tasks: p.tasks,
                });
            }
        });

        io.emit("room:updated", { room: safeRoom });
    };

    const roomPlayAgain = (data) => {
        const playerId = socket.data.playerId;
        const roomId = data?.roomId;
        const room = RoomsManager.fetchRoom(roomId);
        if (!room) return;
        if (playerId && room.host?.id !== playerId) {
            socket.emit("game:notif", { message: "Only the host can return the room to lobby" });
            return;
        }

        RoomsManager.resetToLobby(roomId);
        const safeRoom = serializeRoom(room);
        io.to(roomId).emit("room:restarted", { roomId, room: safeRoom });
        io.emit("room:updated", { room: safeRoom });
    };

    const sendMessage = (data) => {
        const playerId = socket.data.playerId || data?.playerId;
        const roomId = data?.roomId;
        const rawText = String(data?.message || "").trim().slice(0, 200);
        if (!roomId || !playerId || !rawText) return;

        const room = RoomsManager.fetchRoom(roomId);
        const sender = room?.players?.[playerId];
        if (!sender) return;

        const payload = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            playerId: sender.id,
            playerName: sender.name,
            color: sender.color,
            message: rawText,
            isGhost: !sender.isAlive,
            timestamp: Date.now(),
        };

        if (!sender.isAlive) {
            // Ghosts only chat with other dead players
            Object.values(room.players).forEach((p) => {
                if (!p.isAlive && p.socketId) {
                    io.to(p.socketId).emit("room:message", payload);
                }
            });
        } else {
            io.to(roomId).emit("room:message", payload);
        }
    };

    const handleDisconnect = () => {
        const playerId = socketToPlayerId[socket.id];
        if (playerId) {
            leaveCurrentRoom(io, socket, playerId, true);
            delete socketToPlayerId[socket.id];
        }
    };

    const playerDisconnect = (data) => {
        const playerId = socket.data.playerId || data?.playerId;
        if (playerId) {
            leaveCurrentRoom(io, socket, playerId, true);
            delete socketToPlayerId[socket.id];
        }
    };

    socket.on("player:register", playerRegister);
    socket.on("player:unregister", playerUnregister);
    socket.on("player:disconnect", playerDisconnect);
    socket.on("room:create", roomCreate);
    socket.on("room:join", roomJoin);
    socket.on("room:leave", roomLeave);
    socket.on("room:playAgain", roomPlayAgain);
    socket.on("game:start", gameStart);
    socket.on("room:send:message", sendMessage);
    socket.on("disconnect", handleDisconnect);
};
