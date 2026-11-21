import { RoomsManager, getImposterIds, serializeRoom } from "../managers/rooms.manager.js";
import { PlayersManager } from "../managers/players.manager.js";
import {
    DEFAULT_ROOM_SETTINGS,
    EMERGENCY_BUTTON_POS,
    GAME_CONSTANTS,
    KILL_DISTANCE_MAP,
    SKELD_VENTS,
} from "../config/skeldData.js";
import { buildGameEndedPayload } from "./roomEvents.js";

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
                const latest = RoomsManager.fetchRoom(roomId);
                if (!latest || !latest.started) return;
                io.to(roomId).emit("game:ended", buildGameEndedPayload(latest, win));
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
            d: data.d === "left" ? "left" : "right",
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

        const imposterSet = new Set(getImposterIds(room));
        if (!imposterSet.has(killerId) || imposterSet.has(targetId) || targetId === killerId) return;
        if (killer.inVent) return;

        const settings = room.settings || DEFAULT_ROOM_SETTINGS;
        const cooldownMs = (settings.killCooldownSec || 15) * 1000;
        const killRange = KILL_DISTANCE_MAP[settings.killDistance] || GAME_CONSTANTS.KILL_RANGE;

        // Server-side kill cooldown enforcement
        const elapsed = Date.now() - (room.lastKillAt || 0);
        if (elapsed < cooldownMs - 400) {
            return;
        }

        // Distance check with latency margin
        const d = dist(killer.state.x, killer.state.y, victim.state.x, victim.state.y);
        if (d > killRange + 30) {
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
            nextKillCooldownMs: cooldownMs,
        });

        const win = RoomsManager.checkWin(roomId);
        if (win !== null) {
            setTimeout(() => {
                const latest = RoomsManager.fetchRoom(roomId);
                if (!latest || !latest.started) return;
                io.to(roomId).emit("game:ended", buildGameEndedPayload(latest, win));
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
        const imposterSet = new Set(getImposterIds(room));
        if (!player || !player.isAlive || !imposterSet.has(playerId)) return;

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
            io.to(roomId).emit("game:ended", buildGameEndedPayload(room, win));
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

        const settings = room.settings || DEFAULT_ROOM_SETTINGS;
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
            if ((caller.emergencyCallsLeft ?? 1) <= 0) {
                socket.emit("game:notif", { message: "No emergency meetings remaining!" });
                return;
            }
            const emergencyCooldownMs = (settings.emergencyCooldownSec || 15) * 1000;
            const sinceLast = Date.now() - (room.lastEmergencyAt || 0);
            if (sinceLast < emergencyCooldownMs - 400) {
                const waitSec = Math.ceil((emergencyCooldownMs - sinceLast) / 1000);
                socket.emit("game:notif", {
                    message: `Emergency meeting on cooldown (${waitSec}s left)`,
                });
                return;
            }
            caller.emergencyCallsLeft = Math.max(0, (caller.emergencyCallsLeft ?? 1) - 1);
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
            anonymousVotes: Boolean(settings.anonymousVotes),
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
