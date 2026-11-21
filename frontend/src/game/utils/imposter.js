import Phaser from 'phaser';
import { KILL_DISTANCE_MAP, SKELD_CONSTANTS, SKELD_VENTS } from '../skeldData.js';
import { soundFX } from '../../utils/sound.js';

function getRoomKillRange(scene) {
    const distKey = scene.room?.settings?.killDistance || 'medium';
    return KILL_DISTANCE_MAP[distKey] || SKELD_CONSTANTS.KILL_RANGE;
}

function getRoomKillCooldownMs(scene) {
    const sec = scene.room?.settings?.killCooldownSec || 15;
    return sec * 1000;
}

/**
 * Initialize imposter-specific UI, cooldown radial, target highlight, and venting.
 */
export function handleImposter(scene) {
    if (!scene.imposter || !scene.player) return;

    const killRange = getRoomKillRange(scene);
    const cooldownMs = getRoomKillCooldownMs(scene);

    scene.killCooldownEndsAt = Date.now() + (scene.initialCooldownMs || Math.min(10000, cooldownMs));
    scene.closest = { player: null, distance: killRange };
    scene.nearestVent = null;
    scene.ventTargetButtons = [];

    // Pulsing crimson target ring around nearest killable crewmate
    scene.targetRing = scene.add.graphics().setDepth(18);
    scene.worldContainer.add(scene.targetRing);

    // Kill button (bottom-right HUD, UI camera space 1024x768)
    scene.killBtn = scene.add
        .image(920, 665, 'kill')
        .setScale(0.85)
        .setDepth(1000)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => triggerKill());

    scene.killCooldownText = scene.add
        .text(920, 665, '', {
            fontFamily: 'Arial Black, sans-serif',
            fontSize: '28px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(1002);

    scene.killShortcutText = scene.add
        .text(920, 720, '[Q] KILL', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#ff9b9b',
            stroke: '#000000',
            strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(1002);

    // Vent button (next to kill button)
    scene.ventBtnContainer = scene.add.container(805, 665).setDepth(1000);
    const ventBg = scene.add.circle(0, 0, 38, 0x1b263b, 0.9).setStrokeStyle(3, 0x94a3b8);
    const ventSprite = scene.add.image(0, -4, 'vent1').setScale(0.22);
    const ventLabel = scene.add
        .text(0, 22, 'VENT', {
            fontFamily: 'Arial Black, sans-serif',
            fontSize: '11px',
            color: '#e2e8f0',
            stroke: '#000000',
            strokeThickness: 3,
        })
        .setOrigin(0.5);
    scene.ventBtnContainer.add([ventBg, ventSprite, ventLabel]);
    ventBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => toggleVent());
    scene.ventBtnBg = ventBg;

    scene.ventShortcutText = scene.add
        .text(805, 720, '[V] VENT', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#cbd5e1',
            stroke: '#000000',
            strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(1002);

    scene.ui.add([
        scene.killBtn,
        scene.killCooldownText,
        scene.killShortcutText,
        scene.ventBtnContainer,
        scene.ventShortcutText,
    ]);

    const triggerKill = () => {
        if (!scene.player?.alive || scene.meetingActive || scene.roleRevealActive || scene.taskModalOpen || scene.player.inVent) return;
        const remaining = Math.max(0, scene.killCooldownEndsAt - Date.now());
        if (remaining > 0) return;

        const victim = scene.closest?.player;
        if (!victim || !victim.alive) return;

        scene.socket.emit('player:kill', {
            roomId: scene.roomId,
            targetId: victim.id,
        });

        scene.killCooldownEndsAt = Date.now() + getRoomKillCooldownMs(scene);
        scene.closest = { player: null, distance: getRoomKillRange(scene) };
    };

    const toggleVent = () => {
        if (!scene.player?.alive || scene.meetingActive || scene.roleRevealActive || scene.taskModalOpen) return;

        if (scene.player.inVent && scene.currentVent) {
            scene.socket.emit('player:vent', {
                roomId: scene.roomId,
                action: 'exit',
                ventId: scene.currentVent.id,
            });
            soundFX.playVent();
            clearVentTargets(scene);
        } else if (scene.nearestVent) {
            scene.currentVent = scene.nearestVent;
            scene.socket.emit('player:vent', {
                roomId: scene.roomId,
                action: 'enter',
                ventId: scene.nearestVent.id,
            });
            soundFX.playVent();
            showVentTargets(scene, scene.nearestVent);
        }
    };

    scene.triggerImposterKill = triggerKill;
    scene.toggleImposterVent = toggleVent;

    scene.qKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    scene.kKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    scene.vKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V);
}

export function clearVentTargets(scene) {
    if (scene.ventTargetButtons) {
        scene.ventTargetButtons.forEach((b) => b.destroy());
        scene.ventTargetButtons = [];
    }
}

export function showVentTargets(scene, currentVent) {
    clearVentTargets(scene);
    if (!currentVent || !scene.player?.alive) return;

    currentVent.targets.forEach((targetId) => {
        const target = SKELD_VENTS.find((v) => v.id === targetId);
        if (!target) return;

        const angle = Phaser.Math.Angle.Between(currentVent.x, currentVent.y, target.x, target.y);
        const bx = currentVent.x + Math.cos(angle) * 48;
        const by = currentVent.y + Math.sin(angle) * 48;

        const container = scene.add.container(bx, by).setDepth(700);
        const bg = scene.add.circle(0, 0, 16, 0x38bdf8, 0.92).setStrokeStyle(2, 0xffffff);
        const arrow = scene.add
            .text(0, 0, '➤', { fontSize: '16px', color: '#0f172a', fontStyle: 'bold' })
            .setOrigin(0.5)
            .setRotation(angle);
        const label = scene.add
            .text(0, 22, target.label, {
                fontSize: '11px',
                fontStyle: 'bold',
                color: '#e0f2fe',
                stroke: '#000',
                strokeThickness: 3,
            })
            .setOrigin(0.5);

        container.add([bg, arrow, label]);
        bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            scene.currentVent = target;
            scene.socket.emit('player:vent', {
                roomId: scene.roomId,
                action: 'move',
                ventId: target.id,
            });
            soundFX.playVent();
            showVentTargets(scene, target);
        });

        scene.worldContainer.add(container);
        scene.ventTargetButtons.push(container);
    });
}

export function handleImposterMovement(scene) {
    if (!scene.imposter || !scene.player) return;

    // Hide imposter UI once dead (ghost)
    const alive = scene.player.alive;
    if (scene.killBtn) {
        scene.killBtn.setVisible(alive);
        scene.killCooldownText.setVisible(alive);
        scene.killShortcutText.setVisible(alive);
        scene.ventBtnContainer.setVisible(alive);
        scene.ventShortcutText.setVisible(alive);
    }

    if (!alive) {
        if (scene.targetRing) scene.targetRing.clear();
        clearVentTargets(scene);
        return;
    }

    const activeTag = document.activeElement?.tagName;
    const typing = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
    if (!typing && !scene.roleRevealActive) {
        if (scene.qKey && Phaser.Input.Keyboard.JustDown(scene.qKey)) scene.triggerImposterKill?.();
        if (scene.kKey && Phaser.Input.Keyboard.JustDown(scene.kKey)) scene.triggerImposterKill?.();
        if (scene.vKey && Phaser.Input.Keyboard.JustDown(scene.vKey)) scene.toggleImposterVent?.();
    }

    // Find nearest alive crewmate (never target fellow impostor) within room killDistance
    const killRange = getRoomKillRange(scene);
    const fellowSet = scene.fellowImposterIds || new Set();
    let best = null;
    let bestDist = killRange;

    Object.values(scene.players).forEach((p) => {
        if (!p || p === scene.player || !p.alive || p.inVent) return;
        if (fellowSet.has(p.id)) return;
        const d = Phaser.Math.Distance.Between(scene.player.x, scene.player.y, p.x, p.y);
        if (d <= bestDist) {
            bestDist = d;
            best = p;
        }
    });
    scene.closest = { player: best, distance: bestDist };

    // Draw pulsing crimson outline around nearest target
    if (scene.targetRing) {
        scene.targetRing.clear();
        if (best && !scene.player.inVent && !scene.meetingActive) {
            const pulse = 1 + Math.sin(scene.time.now * 0.01) * 0.12;
            scene.targetRing.lineStyle(3, 0xff2b2b, 0.92);
            scene.targetRing.strokeCircle(best.x, best.y + 4, 24 * pulse);
        }
    }

    // Cooldown countdown UI
    const remainingMs = Math.max(0, (scene.killCooldownEndsAt || 0) - Date.now());
    const remainingSec = Math.ceil(remainingMs / 1000);
    const canKill = Boolean(best && remainingMs === 0 && !scene.player.inVent && !scene.meetingActive);

    if (scene.killBtn) {
        if (remainingMs > 0) {
            scene.killCooldownText.setText(String(remainingSec));
        } else {
            scene.killCooldownText.setText('');
        }

        if (canKill) {
            scene.killBtn.resetPipeline();
            scene.killBtn.setAlpha(1);
        } else {
            if (scene.game.renderer.type === Phaser.WEBGL && scene.killBtn.pipeline?.name !== 'GrayScale') {
                scene.killBtn.setPipeline('GrayScale');
            }
            scene.killBtn.setAlpha(0.65);
        }
    }

    // Nearest vent detection
    let nearVent = null;
    let nearVentDist = SKELD_CONSTANTS.VENT_RANGE;
    SKELD_VENTS.forEach((v) => {
        const d = Phaser.Math.Distance.Between(scene.player.x, scene.player.y, v.x, v.y);
        if (d <= nearVentDist) {
            nearVentDist = d;
            nearVent = v;
        }
    });
    scene.nearestVent = nearVent;

    if (scene.ventBtnBg) {
        const canVent = Boolean(scene.player.inVent || nearVent);
        scene.ventBtnContainer.setAlpha(canVent ? 1 : 0.45);
        scene.ventBtnBg.setStrokeStyle(3, scene.player.inVent ? 0x38bdf8 : canVent ? 0xfacc15 : 0x64748b);
    }
}
