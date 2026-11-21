import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayersManager } from '../src/managers/players.manager.js';
import { RoomsManager, serializeRoom } from '../src/managers/rooms.manager.js';

function setupPlayersRoom(roomId, count = 3, options = {}) {
    const colors = [
        '#c51111',
        '#132ed1',
        '#117f2d',
        '#ed54ba',
        '#ef7d0d',
        '#f5f557',
        '#3f474e',
        '#d6e0f0',
    ];
    const players = [];
    for (let i = 0; i < count; i++) {
        const p = PlayersManager.createPlayer(
            `${roomId}-p${i + 1}`,
            `Player${i + 1}`,
            colors[i % colors.length]
        );
        players.push(p);
    }
    const room = RoomsManager.createRoom(roomId, players[0], options);
    players.forEach((p) => RoomsManager.players.add(roomId, p));
    return { room, players };
}

function cleanupRoom(roomId, players) {
    players.forEach((p) => {
        const found = PlayersManager.getPlayer(p.id);
        if (found) {
            RoomsManager.players.remove(roomId, found);
            PlayersManager.deletePlayer(p.id);
        }
    });
}

test('serializeRoom hides imposter identity and exposes safe player & settings fields', () => {
    const roomId = 'TEST-SAFE';
    const { room, players } = setupPlayersRoom(roomId, 3, {
        name: 'Skeld Alpha',
        isPublic: false,
        region: 'NA',
    });
    RoomsManager.startGame(roomId);

    const safe = serializeRoom(room);
    assert.ok(safe);
    assert.equal('imposter' in safe, false);
    assert.equal('imposters' in safe, false);
    assert.equal(safe.isPublic, false);
    assert.equal(safe.region, 'NA');
    assert.equal(safe.name, 'Skeld Alpha');
    assert.ok(safe.settings);
    Object.values(safe.players).forEach((sp) => {
        assert.equal('isImposter' in sp, false);
        assert.equal(sp.isAlive, true);
    });

    cleanupRoom(roomId, players);
});

test('meeting voting prevents double-voting, supports skip, and handles ties cleanly', () => {
    const roomId = 'TEST-VOTE';
    const { room, players } = setupPlayersRoom(roomId, 3);
    const [p1, p2, p3] = players;
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

    const v2 = RoomsManager.meetings.vote(roomId, p2.id, p3.id);
    assert.equal(v2.accepted, true);
    const v3 = RoomsManager.meetings.vote(roomId, p3.id, 'skip');
    assert.equal(v3.accepted, true);
    assert.equal(v3.allVoted, true);

    const results = RoomsManager.meetings.end(roomId);
    assert.ok(results);
    assert.equal(results.tie, true);
    assert.equal(results.ejectedId, null);
    assert.equal(ended, false);

    assert.equal(room.players[p1.id].isAlive, true);
    assert.equal(room.players[p2.id].isAlive, true);
    assert.equal(room.players[p3.id].isAlive, true);

    cleanupRoom(roomId, players);
});

test('crewmates win when imposter is ejected or when all crewmate tasks are completed', () => {
    const roomId = 'TEST-WIN';
    const { room, players } = setupPlayersRoom(roomId, 3);
    RoomsManager.startGame(roomId);

    const impId = room.imposter;
    assert.ok(impId);

    const crewmates = players.filter((p) => p.id !== impId);
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

    cleanupRoom(roomId, players);
});

test('imposter wins when alive imposter >= alive crewmates', () => {
    const roomId = 'TEST-IMP';
    const { room, players } = setupPlayersRoom(roomId, 3);
    RoomsManager.startGame(roomId);

    const impId = room.imposter;
    const crew = players.find((p) => p.id !== impId);
    assert.ok(crew);
    room.players[crew.id].isAlive = false;

    const win = RoomsManager.checkWin(roomId);
    assert.ok(win);
    assert.equal(win.winner, 'imposter');
    assert.equal(win.isImposter, true);

    cleanupRoom(roomId, players);
});

test('host room settings sanitize values, support multiple impostors, anonymous votes, and confirm ejects off', () => {
    const roomId = 'TEST-SETTINGS';
    const { room, players } = setupPlayersRoom(roomId, 6);

    const updated = RoomsManager.updateSettings(roomId, {
        impostorCount: 2,
        playerSpeed: 1.5,
        killCooldownSec: 20,
        killDistance: 'long',
        tasksPerPlayer: 6,
        anonymousVotes: true,
        confirmEjects: false,
        bogusField: 'ignored',
    });

    assert.equal(updated.impostorCount, 2);
    assert.equal(updated.playerSpeed, 1.5);
    assert.equal(updated.killCooldownSec, 20);
    assert.equal(updated.killDistance, 'long');
    assert.equal(updated.tasksPerPlayer, 6);
    assert.equal(updated.anonymousVotes, true);
    assert.equal(updated.confirmEjects, false);
    assert.equal('bogusField' in updated, false);

    // Invalid value falls back cleanly
    const clamped = RoomsManager.updateSettings(roomId, { playerSpeed: 99 });
    assert.equal(clamped.playerSpeed, 1.5);

    RoomsManager.startGame(roomId);
    assert.equal(room.imposters.length, 2);
    assert.equal(players[0].tasks.length, 6);

    // Test anonymous vote & confirmEjects: false
    RoomsManager.meetings.create(roomId, players[0].id, 'emergency', null, () => {});
    const target = players[1];
    RoomsManager.meetings.vote(roomId, players[0].id, target.id);
    RoomsManager.meetings.vote(roomId, players[2].id, target.id);
    const res = RoomsManager.meetings.end(roomId);
    assert.equal(res.ejectedId, target.id);
    assert.equal(res.anonymousVotes, true);
    assert.deepEqual(res.votes, {}); // voter identities stripped
    assert.equal(res.counts[target.id], 2);
    assert.equal(res.confirmEjects, false);
    assert.equal(res.wasImposter, false);

    cleanupRoom(roomId, players);
});

test('customizePlayer enforces unique names and colors in room', () => {
    const roomId = 'TEST-CUSTOM';
    const { players } = setupPlayersRoom(roomId, 2);
    const [p1, p2] = players;

    const dupName = RoomsManager.customizePlayer(roomId, p1.id, { name: p2.name });
    assert.equal(dupName.ok, false);

    const dupColor = RoomsManager.customizePlayer(roomId, p1.id, { color: p2.color });
    assert.equal(dupColor.ok, false);

    const ok = RoomsManager.customizePlayer(roomId, p1.id, {
        name: 'Captain',
        color: '#38fedc',
    });
    assert.equal(ok.ok, true);
    assert.equal(p1.name, 'Captain');
    assert.equal(p1.color, '#38fedc');

    cleanupRoom(roomId, players);
});
