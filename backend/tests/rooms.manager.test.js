import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayersManager } from '../src/managers/players.manager.js';
import { RoomsManager, serializeRoom } from '../src/managers/rooms.manager.js';

function setupThreePlayerRoom(roomId) {
    const p1 = PlayersManager.createPlayer(`${roomId}-p1`, 'Alice', '#c51111');
    const p2 = PlayersManager.createPlayer(`${roomId}-p2`, 'Bob', '#132ed1');
    const p3 = PlayersManager.createPlayer(`${roomId}-p3`, 'Carol', '#117f2d');
    const room = RoomsManager.createRoom(roomId, p1);
    RoomsManager.players.add(roomId, p1);
    RoomsManager.players.add(roomId, p2);
    RoomsManager.players.add(roomId, p3);
    return { room, p1, p2, p3 };
}

function cleanupRoom(roomId, playerIds) {
    playerIds.forEach((id) => {
        const p = PlayersManager.getPlayer(id);
        if (p) {
            RoomsManager.players.remove(roomId, p);
            PlayersManager.deletePlayer(id);
        }
    });
}

test('serializeRoom hides imposter identity and exposes safe player fields', () => {
    const roomId = 'TEST-SAFE';
    const { room, p1, p2, p3 } = setupThreePlayerRoom(roomId);
    RoomsManager.startGame(roomId);

    const safe = serializeRoom(room);
    assert.ok(safe);
    assert.equal('imposter' in safe, false);
    Object.values(safe.players).forEach((sp) => {
        assert.equal('isImposter' in sp, false);
        assert.equal(sp.isAlive, true);
    });

    cleanupRoom(roomId, [p1.id, p2.id, p3.id]);
});

test('meeting voting prevents double-voting, supports skip, and handles ties cleanly', () => {
    const roomId = 'TEST-VOTE';
    const { room, p1, p2, p3 } = setupThreePlayerRoom(roomId);
    RoomsManager.startGame(roomId);

    let ended = false;
    RoomsManager.meetings.create(roomId, p1.id, 'emergency', null, () => {
        ended = true;
    });

    const v1 = RoomsManager.meetings.vote(roomId, p1.id, p2.id);
    assert.equal(v1.accepted, true);
    assert.equal(v1.allVoted, false);

    // Double vote rejected
    const v1Dup = RoomsManager.meetings.vote(roomId, p1.id, p3.id);
    assert.equal(v1Dup.accepted, false);

    // Tie between p2 and p3, plus p1 skipped -> tie or majority
    const v2 = RoomsManager.meetings.vote(roomId, p2.id, p3.id);
    assert.equal(v2.accepted, true);
    const v3 = RoomsManager.meetings.vote(roomId, p3.id, 'skip');
    assert.equal(v3.accepted, true);
    assert.equal(v3.allVoted, true);

    const results = RoomsManager.meetings.end(roomId);
    assert.ok(results);
    assert.equal(results.tie, true);
    assert.equal(results.ejectedId, null);
    assert.equal(ended, false); // ended manually before timeout

    // Everyone stays alive on tie
    assert.equal(room.players[p1.id].isAlive, true);
    assert.equal(room.players[p2.id].isAlive, true);
    assert.equal(room.players[p3.id].isAlive, true);

    cleanupRoom(roomId, [p1.id, p2.id, p3.id]);
});

test('crewmates win when imposter is ejected or when all crewmate tasks are completed', () => {
    const roomId = 'TEST-WIN';
    const { room, p1, p2, p3 } = setupThreePlayerRoom(roomId);
    RoomsManager.startGame(roomId);

    const impId = room.imposter;
    assert.ok(impId);

    const crewmates = [p1, p2, p3].filter((p) => p.id !== impId);
    crewmates.forEach((crew) => {
        crew.tasks.forEach((t) => {
            const res = RoomsManager.completeTask(roomId, crew.id, t.id);
            assert.equal(res.completed, true);
            assert.equal(res.isCrewmateTask, true);
        });
    });

    const win = RoomsManager.checkWin(roomId);
    assert.ok(win);
    assert.equal(win.winner, 'crewmates');
    assert.equal(win.reason, 'tasks_completed');

    cleanupRoom(roomId, [p1.id, p2.id, p3.id]);
});

test('imposter wins when alive imposter >= alive crewmates', () => {
    const roomId = 'TEST-IMP';
    const { room, p1, p2, p3 } = setupThreePlayerRoom(roomId);
    RoomsManager.startGame(roomId);

    const impId = room.imposter;
    const crew = [p1, p2, p3].find((p) => p.id !== impId);
    assert.ok(crew);
    room.players[crew.id].isAlive = false;

    const win = RoomsManager.checkWin(roomId);
    assert.ok(win);
    assert.equal(win.winner, 'imposter');
    assert.equal(win.isImposter, true);

    cleanupRoom(roomId, [p1.id, p2.id, p3.id]);
});
