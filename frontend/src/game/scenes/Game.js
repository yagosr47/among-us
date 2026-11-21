import Phaser from 'phaser';
import { BaseGameScene } from './BaseGameScene.js';
import { GrayPipeline, VisionRadiusPipeline } from '../shaders/fragShader.js';
import { socketService } from '../../services/socket.js';
import { setPlayerColor, convertToGhost, spawnDustPuff } from '../utils/playerFactory.js';
import { EventBus } from '../EventBus.js';
import { handleImposter, handleImposterMovement, clearVentTargets } from '../utils/imposter.js';
import { setupVisionSystem, disableVisionSystem, updateVisionSystem, enableVisionSystem } from '../utils/vision.js';
import { EMERGENCY_BUTTON_POS, SKELD_CONSTANTS, SKELD_VENTS, getRoomNameAt } from '../skeldData.js';
import { soundFX } from '../../utils/sound.js';

export class Game extends BaseGameScene {
    constructor() {
        super('Game');
    }

    init(data) {
        super.init(data);
        this._roleApplied = false;
        this.imposter = Boolean(data?.isImposter);
        this.fellowImposterIds = new Set();
        this.tasks = Array.isArray(data?.tasks) ? data.tasks : [];
        this.initialCooldownMs = data?.initialCooldownMs || 10000;
        this.deadBodiesMap = {};
        this.taskModalOpen = false;
        this.meetingActive = false;
        this.roleRevealActive = false;
        this._lastHudEmitAt = 0;
        this._lastRoomName = '';
        this.emergencyCallsLeft = this.room?.settings?.emergencyMeetings ?? 1;
        this.lastEmergencyAt = Date.now();
    }

    getMapConfig() {
        return {
            mapKey: 'gameMapJSON',
            mapJSON: 'map.json',
            tilesetName: 'red',
            tilesetKey: 'red',
            backgroundKey: 'skled',
            backgroundImage: 'skled.png',
        };
    }

    preload() {
        this.preloadCommon();
        this.preloadMap();
        this.load.image('kill', 'assets/icons/kill_icon.png');
        this.load.image('reportBtn', 'assets/icons/reportBtn.png');
        this.load.image('useIcon', 'assets/icons/useIcon.png');
        this.load.atlas('death', 'assets/death/texture.png', 'assets/death/texture.json');
        this.load.image('deadBody', 'assets/sprites/Base/Dead0042.png');
    }

    async create() {
        if (this.game.renderer.type === Phaser.WEBGL) {
            const pipelines = this.game.renderer.pipelines;
            if (!pipelines.has('GrayScale')) {
                pipelines.add('GrayScale', new GrayPipeline(this.game));
            }
            if (!pipelines.has('VisionRadius')) {
                pipelines.add('VisionRadius', new VisionRadiusPipeline(this.game));
            }
        }

        await this.createCommon();
        if (!this.sys || !this.sys.displayList) return;
        this.socket = socketService.getSocket();
        if (this.room?.settings) {
            this.emergencyCallsLeft = this.room.settings.emergencyMeetings ?? 1;
        }
        this.lastEmergencyAt = Date.now();

        this.createGameAnimations();
        this.setupActionButtons();
        this.setupWorldHotspots();
        this.setupGameShortcuts();
        this.handleGameEvents();

        // Sync role & tasks deterministically regardless of socket event timing
        EventBus.on('role:assigned', this.onRoleAssigned);
        if (this.config?.isImposter !== undefined) {
            this.applyRoleData({
                isImposter: this.config.isImposter,
                tasks: this.config.tasks || [],
                fellowImposters: this.config.fellowImposters || [],
            });
        } else {
            EventBus.emit('game:ready-for-role');
        }

        setupVisionSystem(this);
    }

    applyRoleData({ isImposter, tasks, fellowImposters = [] }) {
        if (this._roleApplied) return;
        this._roleApplied = true;
        this.imposter = Boolean(isImposter);
        if (Array.isArray(tasks)) {
            this.tasks = tasks;
        }
        this.fellowImposterIds = new Set((fellowImposters || []).map((f) => f.id));

        // Color fellow impostors' nameplates red for impostor players
        if (this.imposter) {
            this.fellowImposterIds.forEach((fid) => {
                const sprite = fid === this.playerObj?.id ? this.player : this.players[fid];
                if (sprite?.nameTag) {
                    sprite.nameTag.setColor('#ff4d4d');
                }
            });
        }

        this.renderTaskMarkers();
        if (this.imposter && !this.killBtn) {
            handleImposter(this);
        }
        if (this.player) {
            const settings = this.room?.settings || {};
            const crewMult = settings.crewVision || 1.0;
            const impMult = settings.impostorVision || 1.25;
            this.VISION_RADIUS = this.imposter ? Math.round(112 * impMult) : Math.round(108 * crewMult);
        }
    }

    createGameAnimations() {
        // NOTE: death/texture.json uses frame names Dead0001..Dead0042 without '.png'
        if (!this.anims.exists('deathAnim')) {
            this.anims.create({
                key: 'deathAnim',
                frames: this.anims.generateFrameNames('death', {
                    prefix: 'Dead',
                    start: 1,
                    end: 42,
                    zeroPad: 4,
                }),
                frameRate: 22,
                repeat: 0,
            });
        }
    }

    setupActionButtons() {
        // Use / Task / Emergency Button (bottom-right above Vent)
        this.useBtn = this.add
            .image(805, 545, 'useIcon')
            .setScale(0.76)
            .setDepth(1000)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.handleUseAction());

        this.useHintText = this.add
            .text(805, 595, '[E] USE', {
                fontFamily: 'Arial, sans-serif',
                fontSize: '12px',
                fontStyle: 'bold',
                color: '#fef08a',
                stroke: '#000000',
                strokeThickness: 3,
            })
            .setOrigin(0.5)
            .setDepth(1002);

        // Report Body Button (above Kill)
        this.reportBtn = this.add
            .image(920, 545, 'reportBtn')
            .setScale(0.76)
            .setDepth(1000)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.handleReportAction());

        this.reportHintText = this.add
            .text(920, 595, '[R] REPORT', {
                fontFamily: 'Arial, sans-serif',
                fontSize: '12px',
                fontStyle: 'bold',
                color: '#fca5a5',
                stroke: '#000000',
                strokeThickness: 3,
            })
            .setOrigin(0.5)
            .setDepth(1002);

        this.ui.add([this.useBtn, this.useHintText, this.reportBtn, this.reportHintText]);
    }

    setupWorldHotspots() {
        // Emergency table pulsing aura
        this.emergencyRing = this.add
            .circle(EMERGENCY_BUTTON_POS.x, EMERGENCY_BUTTON_POS.y, 16, 0xef4444, 0.14)
            .setStrokeStyle(1.5, 0xf87171, 0.65)
            .setDepth(6);
        this.worldContainer.add(this.emergencyRing);
        this.tweens.add({
            targets: this.emergencyRing,
            scale: 1.25,
            alpha: 0.35,
            duration: 950,
            yoyo: true,
            repeat: -1,
        });

        // Subtle vent grates markers for visual clarity
        SKELD_VENTS.forEach((v) => {
            const marker = this.add
                .rectangle(v.x, v.y, 14, 10, 0x334155, 0.45)
                .setStrokeStyle(1, 0x94a3b8, 0.5)
                .setDepth(4);
            this.worldContainer.add(marker);
        });

        this.taskMarkers = {};
        this.renderTaskMarkers();
    }

    renderTaskMarkers() {
        Object.values(this.taskMarkers || {}).forEach((m) => m.destroy());
        this.taskMarkers = {};

        (this.tasks || []).forEach((task) => {
            if (task.completed) return;
            const container = this.add.container(task.x, task.y).setDepth(7);
            const ring = this.add
                .circle(0, 0, 11, 0xfacc15, 0.15)
                .setStrokeStyle(1.5, 0xfef08a, 0.85);
            const dot = this.add.circle(0, 0, 3, 0xfacc15, 0.95);
            container.add([ring, dot]);

            this.tweens.add({
                targets: ring,
                scale: 1.35,
                alpha: 0.25,
                duration: 850,
                yoyo: true,
                repeat: -1,
            });

            this.worldContainer.add(container);
            this.taskMarkers[task.id] = container;
        });
    }

    setupGameShortcuts() {
        this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.rKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.mKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    }

    handleGameEvents() {
        if (!this.socket) return;

        this.onRoleAssigned = (data) => {
            if (!data?.roomId || data.roomId === this.roomId) {
                this.applyRoleData(data);
            }
        };

        this.onPlayerKilled = (data) => {
            const targetId = String(data.playerId);
            const localId = String(this.playerObj?.id);
            const killedPlayer = targetId === localId ? this.player : this.players[targetId];

            if (this.room?.players?.[targetId]) {
                this.room.players[targetId].isAlive = false;
            }

            // Dash killer sprite visually to victim
            const killerId = data.killerId ? String(data.killerId) : null;
            if (killerId) {
                const killerSprite = killerId === localId ? this.player : this.players[killerId];
                if (killerSprite) {
                    killerSprite.x = data.x;
                    killerSprite.y = data.y;
                    killerSprite.targetX = data.x;
                    killerSprite.targetY = data.y;
                }
            }

            // Camera punch & crimson flash for victim or nearby witnesses
            const distToLocal = this.player
                ? Phaser.Math.Distance.Between(this.player.x, this.player.y, data.x, data.y)
                : 9999;

            if (targetId === localId || killerId === localId || distToLocal <= this.VISION_RADIUS) {
                soundFX.playKill();
                if (targetId === localId || killerId === localId) {
                    this.cameras.main.shake(220, 0.012);
                    this.cameras.main.flash(260, 175, 15, 25);
                }
            }

            // Spawn red impact particle burst
            for (let i = 0; i < 10; i++) {
                const angle = (Math.PI * 2 * i) / 10;
                const p = this.add.circle(data.x, data.y, 2.5, 0xef4444, 0.9).setDepth(550);
                this.worldContainer.add(p);
                this.tweens.add({
                    targets: p,
                    x: data.x + Math.cos(angle) * Phaser.Math.Between(10, 24),
                    y: data.y + Math.sin(angle) * Phaser.Math.Between(10, 24),
                    alpha: 0,
                    scale: 0.2,
                    duration: 380,
                    onComplete: () => p.destroy(),
                });
            }

            // Transform killed player into Ghost (never crash or delete this.player!)
            if (killedPlayer) {
                convertToGhost(this, killedPlayer);
            }

            // Play animated death sequence tinted with VICTIM's color -> persistent colored dead body
            const deathAnim = this.add
                .sprite(data.x, data.y, 'death', 'Dead0001')
                .setScale(0.125)
                .setDepth(450);
            setPlayerColor(this, deathAnim, data.color);
            this.worldContainer.add(deathAnim);
            deathAnim.anims.play('deathAnim');
            deathAnim.once('animationcomplete', () => {
                deathAnim.destroy();
                const body = this.add
                    .sprite(data.x, data.y, 'deadBody')
                    .setScale(0.125)
                    .setDepth(15);
                setPlayerColor(this, body, data.color);
                body.bodyPlayerId = targetId;
                this.worldContainer.add(body);
                this.deadBodiesMap[targetId] = body;
            });
        };

        this.onPlayerVented = (data) => {
            const targetId = String(data.playerId);
            const localId = String(this.playerObj?.id);
            const sprite = targetId === localId ? this.player : this.players[targetId];
            if (!sprite) return;

            // Play vent cover clank animation at the vent location
            const ventFx = this.add
                .sprite(data.x, data.y, 'vent1')
                .setScale(0.1)
                .setDepth(420);
            setPlayerColor(this, ventFx, sprite.playerColor);
            this.worldContainer.add(ventFx);
            ventFx.anims.play('ventAnim');
            ventFx.once('animationcomplete', () => ventFx.destroy());

            spawnDustPuff(this, data.x, data.y, 0x94a3b8, 1.4);

            if (data.action === 'enter') {
                sprite.inVent = true;
                sprite.x = data.x;
                sprite.y = data.y;
                sprite.targetX = data.x;
                sprite.targetY = data.y;
                sprite.setVisible(targetId === localId);
                if (targetId === localId) sprite.setAlpha(0.45);
                if (sprite.shadow) sprite.shadow.setVisible(false);
                if (sprite.nameTag) sprite.nameTag.setVisible(false);
            } else if (data.action === 'move') {
                sprite.inVent = true;
                sprite.x = data.x;
                sprite.y = data.y;
                sprite.targetX = data.x;
                sprite.targetY = data.y;
            } else if (data.action === 'exit') {
                sprite.inVent = false;
                sprite.x = data.x;
                sprite.y = data.y;
                sprite.targetX = data.x;
                sprite.targetY = data.y;
                sprite.setAlpha(1);
                sprite.setVisible(true);
                if (sprite.shadow) sprite.shadow.setVisible(true);
                if (sprite.nameTag) sprite.nameTag.setVisible(true);
            }
        };

        this.onTaskCompletedAck = (data) => {
            const t = (this.tasks || []).find((item) => item.id === data.taskId);
            if (t) {
                t.completed = true;
            }
            if (this.taskMarkers[data.taskId]) {
                this.taskMarkers[data.taskId].destroy();
                delete this.taskMarkers[data.taskId];
            }
            soundFX.playTaskComplete();

            // Sparkle burst on player
            if (this.player) {
                for (let i = 0; i < 8; i++) {
                    const angle = (Math.PI * 2 * i) / 8;
                    const spark = this.add.circle(this.player.x, this.player.y, 2, 0x4ade80, 0.95).setDepth(550);
                    this.worldContainer.add(spark);
                    this.tweens.add({
                        targets: spark,
                        x: this.player.x + Math.cos(angle) * 20,
                        y: this.player.y + Math.sin(angle) * 20,
                        alpha: 0,
                        duration: 420,
                        onComplete: () => spark.destroy(),
                    });
                }
            }
        };

        this.onMeetingStarted = (data) => {
            this.meetingActive = true;
            this.taskModalOpen = false;
            this.physics.pause();
            clearVentTargets(this);
            if (this.player) {
                this.player.inVent = false;
                if (this.player.alive) this.player.setAlpha(1);
            }
            disableVisionSystem(this);

            if (data.type === 'emergency' && data.callerId === this.playerObj?.id) {
                this.emergencyCallsLeft = Math.max(0, (this.emergencyCallsLeft ?? 1) - 1);
            }

            if (data.type === 'body') soundFX.playReport();
            else soundFX.playEmergency();

            EventBus.emit('meeting:started', {
                roomId: this.roomId,
                type: data.type,
                callerId: data.callerId,
                callerName: data.callerName,
                callerColor: data.callerColor,
                bodyColor: data.bodyColor,
                bodyName: data.bodyName,
                endTime: data.endTime,
                players: data.players || this.room.players,
            });
        };

        this.onMeetingEnded = (data) => {
            this.meetingActive = false;
            this.physics.resume();

            if (data.room?.players) {
                this.room.players = data.room.players;
            }

            // Remove reported/cleaned dead bodies
            Object.values(this.deadBodiesMap || {}).forEach((body) => body.destroy());
            this.deadBodiesMap = {};

            // Apply ejection state & convert ejected player into Ghost
            const ejectedId = data.results?.ejectedId;
            if (ejectedId) {
                const ejectedSprite = ejectedId === this.playerObj?.id ? this.player : this.players[ejectedId];
                if (ejectedSprite) {
                    convertToGhost(this, ejectedSprite);
                }
                if (this.room?.players?.[ejectedId]) {
                    this.room.players[ejectedId].isAlive = false;
                }
            }

            // Reset cooldowns & teleport players back around Cafeteria table
            const cdSec = this.room?.settings?.killCooldownSec || 15;
            if (this.imposter) {
                this.killCooldownEndsAt = Date.now() + cdSec * 1000;
            }
            this.lastEmergencyAt = Date.now();
            this.teleportPlayersFromRoom(data.room?.players);
            enableVisionSystem(this);

            EventBus.emit('meeting:ended', {
                results: data.results,
                room: data.room,
            });
        };

        this.onGameEnd = (data) => {
            EventBus.emit('game:ended', data);
            if (this.scene && this.scene.isActive('Game')) {
                this.scene.stop('Game');
            }
        };

        this.onTaskModalToggle = (isOpen) => {
            this.taskModalOpen = Boolean(isOpen);
        };

        this.onRoleRevealToggle = (isOpen) => {
            this.roleRevealActive = Boolean(isOpen);
        };

        this.onLocalTaskComplete = ({ taskId }) => {
            if (this.socket && this.roomId && taskId) {
                this.socket.emit('task:complete', { roomId: this.roomId, taskId });
            }
        };

        this.socket.on('game:role', this.onRoleAssigned);
        this.socket.on('player:killed', this.onPlayerKilled);
        this.socket.on('player:vented', this.onPlayerVented);
        this.socket.on('task:completed:ack', this.onTaskCompletedAck);
        this.socket.on('meeting:started', this.onMeetingStarted);
        this.socket.on('meeting:ended', this.onMeetingEnded);
        this.socket.on('game:ended', this.onGameEnd);

        EventBus.on('task:modal-state', this.onTaskModalToggle);
        EventBus.on('role:reveal-state', this.onRoleRevealToggle);
        EventBus.on('task:completed-local', this.onLocalTaskComplete);
    }

    teleportPlayersFromRoom(roomPlayers) {
        if (!roomPlayers) return;
        Object.entries(roomPlayers).forEach(([pid, pData]) => {
            const sprite = pid === this.playerObj?.id ? this.player : this.players[pid];
            if (sprite && pData?.state) {
                sprite.x = pData.state.x;
                sprite.y = pData.state.y;
                sprite.targetX = pData.state.x;
                sprite.targetY = pData.state.y;
            }
        });
    }

    findNearestDeadBody() {
        if (!this.player?.alive) return null;
        let closestBody = null;
        let minDist = SKELD_CONSTANTS.REPORT_RANGE;
        Object.entries(this.deadBodiesMap || {}).forEach(([id, body]) => {
            if (!body || !body.active) return;
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, body.x, body.y);
            if (d <= minDist) {
                minDist = d;
                closestBody = { id, body };
            }
        });
        return closestBody;
    }

    findNearestTask() {
        if (!this.player || this.imposter) return null;
        let closestTask = null;
        let minDist = SKELD_CONSTANTS.TASK_RANGE;
        (this.tasks || []).forEach((task) => {
            if (task.completed) return;
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, task.x, task.y);
            if (d <= minDist) {
                minDist = d;
                closestTask = task;
            }
        });
        return closestTask;
    }

    isNearEmergencyButton() {
        if (!this.player?.alive) return false;
        const d = Phaser.Math.Distance.Between(
            this.player.x,
            this.player.y,
            EMERGENCY_BUTTON_POS.x,
            EMERGENCY_BUTTON_POS.y
        );
        return d <= SKELD_CONSTANTS.EMERGENCY_RANGE;
    }

    getEmergencyCooldownRemainingSec() {
        const cdSec = this.room?.settings?.emergencyCooldownSec ?? 15;
        const leftMs = Math.max(0, this.lastEmergencyAt + cdSec * 1000 - Date.now());
        return Math.ceil(leftMs / 1000);
    }

    handleUseAction() {
        if (!this.player || this.meetingActive || this.taskModalOpen || this.roleRevealActive || this.player.inVent) return;

        const nearestTask = this.findNearestTask();
        if (nearestTask) {
            soundFX.playClick();
            EventBus.emit('task:open', nearestTask);
            return;
        }

        if (this.isNearEmergencyButton() && this.player.alive) {
            if ((this.emergencyCallsLeft ?? 0) <= 0) {
                window.showToast?.('No emergency meetings remaining!', 'info', 2000);
                return;
            }
            const cdLeft = this.getEmergencyCooldownRemainingSec();
            if (cdLeft > 0) {
                window.showToast?.(`Emergency cooldown: ${cdLeft}s remaining`, 'info', 2000);
                return;
            }
            this.socket.emit('meeting:start', {
                roomId: this.roomId,
                type: 'emergency',
            });
        }
    }

    handleReportAction() {
        if (!this.player?.alive || this.meetingActive || this.roleRevealActive || this.player.inVent) return;
        const body = this.findNearestDeadBody();
        if (!body) return;

        this.socket.emit('meeting:start', {
            roomId: this.roomId,
            type: 'body',
            bodyPlayerId: body.id,
        });
    }

    updateActionButtonsState() {
        const nearestTask = this.findNearestTask();
        const nearEmergency = this.isNearEmergencyButton();
        const nearestBody = this.findNearestDeadBody();
        const emergencyCd = this.getEmergencyCooldownRemainingSec();
        const hasEmergencies = (this.emergencyCallsLeft ?? 0) > 0;

        const canEmergency = nearEmergency && hasEmergencies && emergencyCd === 0;
        const canUse = Boolean((nearestTask || canEmergency) && !this.player?.inVent);
        const canReport = Boolean(nearestBody && this.player?.alive && !this.player?.inVent);

        if (this.useBtn) {
            this.useBtn.setAlpha(canUse ? 1 : 0.45);
            if (this.game.renderer.type === Phaser.WEBGL) {
                if (canUse) this.useBtn.resetPipeline();
                else if (this.useBtn.pipeline?.name !== 'GrayScale') this.useBtn.setPipeline('GrayScale');
            }
            if (nearestTask) {
                this.useHintText.setText('[E] TASK');
            } else if (nearEmergency) {
                if (!hasEmergencies) this.useHintText.setText('NO CALLS LEFT');
                else if (emergencyCd > 0) this.useHintText.setText(`[E] WAIT ${emergencyCd}s`);
                else this.useHintText.setText(`[E] MEETING (${this.emergencyCallsLeft})`);
            } else {
                this.useHintText.setText('[E] USE');
            }
        }

        if (this.reportBtn) {
            this.reportBtn.setVisible(Boolean(this.player?.alive));
            this.reportHintText.setVisible(Boolean(this.player?.alive));
            this.reportBtn.setAlpha(canReport ? 1 : 0.45);
            if (this.game.renderer.type === Phaser.WEBGL) {
                if (canReport) this.reportBtn.resetPipeline();
                else if (this.reportBtn.pipeline?.name !== 'GrayScale') this.reportBtn.setPipeline('GrayScale');
            }
        }
    }

    update(time, delta) {
        if (!this.player) return;

        this.handleMovement(time);
        this.interpolateRemotePlayers(delta);
        this.syncPlayerAttachments();
        handleImposterMovement(this);
        this.updateActionButtonsState();

        const activeTag = document.activeElement?.tagName;
        const typing = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
        if (!typing && !this.roleRevealActive) {
            if (Phaser.Input.Keyboard.JustDown(this.eKey)) this.handleUseAction();
            if (Phaser.Input.Keyboard.JustDown(this.rKey)) this.handleReportAction();
            if (Phaser.Input.Keyboard.JustDown(this.mKey)) EventBus.emit('minimap:toggle');
        }

        if (this.visionEnabled) {
            updateVisionSystem(this);
        }

        // Emit throttled HUD & MiniMap coordinates to React
        if (time - this._lastHudEmitAt >= 120) {
            this._lastHudEmitAt = time;
            const roomName = getRoomNameAt(this.player.x, this.player.y);
            EventBus.emit('game:hud-update', {
                roomName,
                x: this.player.x,
                y: this.player.y,
                alive: this.player.alive,
                tasks: [...(this.tasks || [])],
                isImposter: this.imposter,
            });
        }
    }

    onSceneShutdown() {
        if (this.socket) {
            if (this.onRoleAssigned) this.socket.off('game:role', this.onRoleAssigned);
            if (this.onPlayerKilled) this.socket.off('player:killed', this.onPlayerKilled);
            if (this.onPlayerVented) this.socket.off('player:vented', this.onPlayerVented);
            if (this.onTaskCompletedAck) this.socket.off('task:completed:ack', this.onTaskCompletedAck);
            if (this.onMeetingStarted) this.socket.off('meeting:started', this.onMeetingStarted);
            if (this.onMeetingEnded) this.socket.off('meeting:ended', this.onMeetingEnded);
            if (this.onGameEnd) this.socket.off('game:ended', this.onGameEnd);
        }
        if (this.onRoleAssigned) EventBus.off('role:assigned', this.onRoleAssigned);
        EventBus.off('task:modal-state', this.onTaskModalToggle);
        if (this.onRoleRevealToggle) EventBus.off('role:reveal-state', this.onRoleRevealToggle);
        EventBus.off('task:completed-local', this.onLocalTaskComplete);
        super.onSceneShutdown();
    }
}
