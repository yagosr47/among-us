import { RoomsManager, serializeRoom } from "../managers/rooms.manager.js";
import { PlayersManager } from "../managers/players.manager.js";
import {
    EMERGENCY_BUTTON_POS,
    GAME_CONSTANTS,
    SKELD_VENTS,
} from "../config/skeldData.js";

function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
}

/**
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export const registerGameEvents = (io, socket) => {
    const endMeeting = ({ roomId }) => {
        const room = RoomsManager.fetchRoom(roomId);
        if (!room) return;

        const results = RoomsManager.meetings.end(roomId);
        if (!results) return;

        const safeRoom = serializeRoom(room);
        io.to(roomId).emit("meeting:ended", {
            roomId,
            results,
            room: safeRoom,
        });

        const win = RoomsManager.checkWin(roomId);
        if (win !== null) {
            const delay = results.ejectedId ? GAME_CONSTANTS.EJECTION_DELAY_MS : 2000;
            setTimeout(() => {
                // Re-verify room still exists and game still started
                const latest = RoomsManager.fetchRoom(roomId);
                if (!latest || !latest.started) return;
                io.to(roomId).emit("game:ended", {
                    roomId,
                    ...win,
                    imposterId: latest.imposter,
                    imposterName: latest.imposter ? latest.players[latest.imposter]?.name : null,
                });
            }, delay);
        }
    };

    const playerMove = (data) => {
        const playerId = socket.data.playerId || data?.id || data?.playerId;
        const roomId = data?.roomId;
        if (!roomId || !playerId) return;

        const room = RoomsManager.fetchRoom(roomId);
        const player = room?.players?.[playerId];
        if (!player) return;

        const nextState = {
            x: Number(data.x) || 0,
            y: Number(data.y) || 0,
            d: data.d === 'left' ? 'left' : 'right',
            moving: Boolean(data.moving),
        };

        RoomsManager.players.updateState(roomId, playerId, nextState);
        PlayersManager.updatePlayerState(playerId, nextState);

        // Broadcast to other players in the room (avoid echoing back to sender)
        socket.to(roomId).emit("player:moved", {
            id: playerId,
            ...nextState,
        });
    };

    const playerKill = (data) => {
        const killerId = socket.data.playerId || data?.killerId;
        const targetId = data?.targetId || data?.playerId;
        const roomId = data?.roomId;
        if (!roomId || !killerId || !targetId) return;

        const room = RoomsManager.fetchRoom(roomId);
        if (!room || !room.started || room.currentMeeting?.isActive) return;

        const killer = room.players[killerId];
        const victim = room.players[targetId];
        if (!killer || !victim || !killer.isAlive || !victim.isAlive) return;
        if (room.imposter !== killerId || targetId === killerId) return;
        if (killer.inVent) return;

        // Server-side kill cooldown enforcement
        const elapsed = Date.now() - (room.lastKillAt || 0);
        if (elapsed < GAME_CONSTANTS.KILL_COOLDOWN_MS - 400) {
            return;
        }

        // Distance check with latency margin
        const d = dist(killer.state.x, killer.state.y, victim.state.x, victim.state.y);
        if (d > GAME_CONSTANTS.KILL_RANGE + 30) {
            return;
        }

        victim.isAlive = false;
        room.lastKillAt = Date.now();
        killer.state.x = victim.state.x;
        killer.state.y = victim.state.y;

        room.deadBodies[victim.id] = {
            id: victim.id,
            name: victim.name,
            color: victim.color,
            x: victim.state.x,
            y: victim.state.y,
        };

        io.to(roomId).emit("player:killed", {
            playerId: victim.id,
            victimName: victim.name,
            killerId,
            x: victim.state.x,
            y: victim.state.y,
            color: victim.color,
            nextKillCooldownMs: GAME_CONSTANTS.KILL_COOLDOWN_MS,
        });

        const win = RoomsManager.checkWin(roomId);
        if (win !== null) {
            setTimeout(() => {
                io.to(roomId).emit("game:ended", {
                    roomId,
                    ...win,
                    imposterId: room.imposter,
                    imposterName: room.imposter ? room.players[room.imposter]?.name : null,
                });
            }, 900);
        }
    };

    const playerVent = (data) => {
        const playerId = socket.data.playerId;
        const roomId = data?.roomId;
        const action = data?.action; // 'enter' | 'exit' | 'move'
        const ventId = data?.ventId;
        if (!playerId || !roomId || !ventId) return;

        const room = RoomsManager.fetchRoom(roomId);
        if (!room || !room.started || room.currentMeeting?.isActive) return;
        const player = room.players[playerId];
        if (!player || !player.isAlive || room.imposter !== playerId) return;

        const vent = SKELD_VENTS.find((v) => v.id === ventId);
        if (!vent) return;

        if (action === "enter") {
            if (dist(player.state.x, player.state.y, vent.x, vent.y) > GAME_CONSTANTS.VENT_RANGE + 25) return;
            player.inVent = true;
            player.state.x = vent.x;
            player.state.y = vent.y;
        } else if (action === "move") {
            if (!player.inVent) return;
            player.state.x = vent.x;
            player.state.y = vent.y;
        } else if (action === "exit") {
            player.inVent = false;
            player.state.x = vent.x;
            player.state.y = vent.y;
        } else {
            return;
        }

        io.to(roomId).emit("player:vented", {
            playerId,
            action,
            ventId,
            x: vent.x,
            y: vent.y,
        });
    };

    const taskComplete = (data) => {
        const playerId = socket.data.playerId || data?.playerId;
        const roomId = data?.roomId;
        const taskId = data?.taskId;
        if (!playerId || !roomId || !taskId) return;

        const room = RoomsManager.fetchRoom(roomId);
        if (!room || !room.started || room.currentMeeting?.isActive) return;

        const res = RoomsManager.completeTask(roomId, playerId, taskId);
        if (!res.completed) return;

        socket.emit("task:completed:ack", { taskId });
        io.to(roomId).emit("tasks:updated", { taskSummary: res.taskSummary });

        const win = RoomsManager.checkWin(roomId);
        if (win !== null) {
            io.to(roomId).emit("game:ended", {
                roomId,
                ...win,
                imposterId: room.imposter,
                imposterName: room.imposter ? room.players[room.imposter]?.name : null,
            });
        }
    };

    const meetingStart = (data) => {
        const callerId = socket.data.playerId || data?.callerId;
        const roomId = data?.roomId;
        const type = data?.type === "body" ? "body" : "emergency";
        const bodyPlayerId = data?.bodyPlayerId || null;
        if (!roomId || !callerId) return;

        const room = RoomsManager.fetchRoom(roomId);
        if (!room || !room.started || room.currentMeeting?.isActive) return;

        const caller = room.players[callerId];
        if (!caller || !caller.isAlive || caller.inVent) return;

        let bodyColor = null;
        let bodyName = null;

        if (type === "body") {
            const body = bodyPlayerId ? room.deadBodies[bodyPlayerId] : null;
            if (!body) return;
            if (dist(caller.state.x, caller.state.y, body.x, body.y) > GAME_CONSTANTS.REPORT_RANGE + 40) {
                return;
            }
            bodyColor = body.color;
            bodyName = body.name;
        } else {
            if (
                dist(caller.state.x, caller.state.y, EMERGENCY_BUTTON_POS.x, EMERGENCY_BUTTON_POS.y) >
                GAME_CONSTANTS.EMERGENCY_RANGE + 40
            ) {
                return;
            }
        }

        const meeting = RoomsManager.meetings.create(
            roomId,
            callerId,
            type,
            bodyPlayerId,
            endMeeting
        );
        if (!meeting) return;

        const safeRoom = serializeRoom(room);
        io.to(roomId).emit("meeting:started", {
            roomId,
            type,
            callerId,
            callerName: caller.name,
            callerColor: caller.color,
            bodyPlayerId,
            bodyColor,
            bodyName,
            endTime: meeting.endTime,
            players: safeRoom.players,
        });
    };

    const meetingVote = (data) => {
        const voterId = socket.data.playerId || data?.callerId;
        const roomId = data?.roomId;
        const votedForId = data?.votedForId || "skip";
        if (!roomId || !voterId) return;

        const result = RoomsManager.meetings.vote(roomId, voterId, votedForId);
        if (!result.accepted) return;

        io.to(roomId).emit("meeting:voted", {
            callerId: voterId,
            voteCount: result.voteCount,
            totalAlive: result.totalAlive,
        });

        if (result.allVoted) {
            endMeeting({ roomId });
        }
    };

    socket.on("player:move", playerMove);
    socket.on("player:kill", playerKill);
    socket.on("player:vent", playerVent);
    socket.on("task:complete", taskComplete);
    socket.on("meeting:start", meetingStart);
    socket.on("meeting:vote", meetingVote);
};
