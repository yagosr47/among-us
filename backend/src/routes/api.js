import express from "express";
import { RoomsManager, serializePlayer, serializeRoom } from "../managers/rooms.manager.js";
import { PlayersManager } from "../managers/players.manager.js";

const router = express.Router();

router.get("/status", (req, res) => {
    res.json({ status: "OK", uptime: process.uptime() });
});

router.get("/rooms", (req, res) => {
    res.json(RoomsManager.fetchRooms());
});

router.get("/player/room/:playerId", (req, res) => {
    const playerId = req.params.playerId;
    const player = PlayersManager.getPlayer(playerId);
    if (!player) {
        res.status(404).json({ error: "Player not found" });
        return;
    }
    const room = player.roomId ? RoomsManager.fetchRoom(player.roomId) : null;
    if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
    }
    res.json({
        room: serializeRoom(room),
        player: serializePlayer(player),
    });
});

router.get("/isImposter", (req, res) => {
    const playerId = String(req.query.playerId || "");
    const roomId = String(req.query.roomId || "");
    const room = RoomsManager.fetchRoom(roomId);
    if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
    }
    if (!room.started || !room.imposter) {
        res.status(400).json({ error: "Game has not started yet" });
        return;
    }
    res.json({ isImposter: room.imposter === playerId });
});

router.get("/rooms/:roomId", (req, res) => {
    const safeRoom = RoomsManager.fetchSafeRoom(req.params.roomId);
    if (!safeRoom) {
        res.status(404).json({ error: "Room not found" });
        return;
    }
    res.json(safeRoom);
});

export default router;
