import Phaser from 'phaser';
import { BaseGameScene } from './BaseGameScene.js';
import { EventBus } from '../EventBus.js';
import { LOBBY_LAPTOP_POS, SKELD_CONSTANTS } from '../skeldData.js';
import { setPlayerColor } from '../utils/playerFactory.js';
import { GrayPipeline } from '../shaders/fragShader.js';
import { soundFX } from '../../utils/sound.js';

export class WaitingLobby extends BaseGameScene {
    constructor() {
        super('WaitingLobby');
        this.handleStartGame = this.handleStartGame.bind(this);
        this.handleLaptopState = this.handleLaptopState.bind(this);
    }

    init(data) {
        super.init(data);
        this.laptopOpen = false;
    }

    handleStartGame(data) {
        if (this.scene && this.scene.isActive('WaitingLobby')) {
            this.scene.start('Game', data);
        }
    }

    handleLaptopState(isOpen) {
        this.laptopOpen = Boolean(isOpen);
    }

    getMapConfig() {
        return {
            mapKey: 'lobbyMapJSON',
            mapJSON: 'lobby.json',
            tilesetName: 'red',
            tilesetKey: 'red',
            backgroundKey: 'lobby',
            backgroundImage: 'Lobby.png',
        };
    }

    preload() {
        this.preloadCommon();
        this.preloadMap();
        this.load.image('useIcon', 'assets/icons/useIcon.png');
    }

    async create() {
        if (this.game.renderer.type === Phaser.WEBGL) {
            const pipelines = this.game.renderer.pipelines;
            if (!pipelines.has('GrayScale')) {
                pipelines.add('GrayScale', new GrayPipeline(this.game));
            }
        }

        await this.createCommon();
        this.setupLobbyEffects();
        this.setupLobbyLaptopUI();
        this.setupLobbyCustomListeners();

        EventBus.off('start-game', this.handleStartGame, this);
        EventBus.on('start-game', this.handleStartGame, this);
        EventBus.off('laptop:modal-state', this.handleLaptopState, this);
        EventBus.on('laptop:modal-state', this.handleLaptopState, this);
    }

    setupLobbyEffects() {
        // Glowing ring + interactive hit target around the dropship customization/settings laptop
        this.laptopGlow = this.add
            .circle(LOBBY_LAPTOP_POS.x, LOBBY_LAPTOP_POS.y, 54, 0x4ecca3, 0.16)
            .setStrokeStyle(2, 0x4ecca3, 0.65)
            .setDepth(3)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
                if (this.isNearLaptop()) {
                    this.openLaptopModal();
                } else {
                    window.showToast?.('Walk closer to the Laptop to customize or edit settings!', 'info', 2200);
                }
            });
        this.worldContainer.add(this.laptopGlow);

        this.tweens.add({
            targets: this.laptopGlow,
            scale: 1.22,
            alpha: 0.08,
            duration: 1300,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        this.laptopWorldLabel = this.add
            .text(LOBBY_LAPTOP_POS.x, LOBBY_LAPTOP_POS.y - 68, '💻 [E] Customize / Settings', {
                fontFamily: 'Arial, sans-serif',
                fontSize: '13px',
                fontStyle: 'bold',
                color: '#a7f3d0',
                backgroundColor: 'rgba(15, 23, 42, 0.72)',
                padding: { x: 8, y: 4 },
            })
            .setOrigin(0.5)
            .setDepth(520);
        this.worldContainer.add(this.laptopWorldLabel);

        // Drop-ship rear engine thruster exhaust particles (left & right thrusters)
        if (this.textures.exists('starParticle')) {
            [115, 1115].forEach((tx) => {
                const emitter = this.add.particles(tx, 895, 'starParticle', {
                    speedY: { min: 70, max: 145 },
                    speedX: { min: -24, max: 24 },
                    scale: { start: 0.45, end: 0 },
                    alpha: { start: 0.65, end: 0 },
                    tint: [0x60efff, 0x38bdf8, 0xffffff],
                    lifespan: { min: 450, max: 850 },
                    frequency: 75,
                    blendMode: 'ADD',
                });
                emitter.setDepth(4);
                this.worldContainer.add(emitter);
            });
        }
    }

    setupLobbyLaptopUI() {
        this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.cKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);

        this.useBtn = this.add
            .image(920, 660, 'useIcon')
            .setScale(0.78)
            .setDepth(1000)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
                if (this.isNearLaptop()) this.openLaptopModal();
            });

        this.useHintText = this.add
            .text(920, 718, '[E] LAPTOP', {
                fontFamily: 'Arial, sans-serif',
                fontSize: '13px',
                fontStyle: 'bold',
                color: '#a7f3d0',
                stroke: '#000000',
                strokeThickness: 4,
            })
            .setOrigin(0.5)
            .setDepth(1002);

        this.ui.add([this.useBtn, this.useHintText]);
    }

    setupLobbyCustomListeners() {
        if (!this.socket) return;

        this._onPlayerCustomized = (data) => {
            if (!data?.player) return;
            const p = data.player;
            const sprite = p.id === this.playerObj?.id ? this.player : this.players[p.id];
            if (sprite) {
                setPlayerColor(this, sprite, p.color);
                sprite.playerColor = p.color;
                sprite.playerName = p.name;
                if (sprite.nameTag) sprite.nameTag.setText(p.name);
            }
            if (this.room?.players?.[p.id]) {
                this.room.players[p.id] = { ...this.room.players[p.id], name: p.name, color: p.color };
            }
            if (p.id === this.playerObj?.id) {
                this.playerObj.name = p.name;
                this.playerObj.color = p.color;
            }
        };

        this._onSettingsUpdated = (data) => {
            if (data?.settings && this.room) {
                this.room.settings = data.settings;
            }
        };

        this.socket.on('player:customized', this._onPlayerCustomized);
        this.socket.on('room:settings:updated', this._onSettingsUpdated);
    }

    isNearLaptop() {
        if (!this.player) return false;
        const d = Phaser.Math.Distance.Between(
            this.player.x,
            this.player.y,
            LOBBY_LAPTOP_POS.x,
            LOBBY_LAPTOP_POS.y
        );
        return d <= SKELD_CONSTANTS.LAPTOP_RANGE;
    }

    openLaptopModal(initialTab = 'settings') {
        if (this.laptopOpen) return;
        soundFX.playClick();
        const isHost = this.room?.host?.id === this.playerObj?.id;
        EventBus.emit('laptop:open', {
            tab: isHost ? initialTab : 'customize',
        });
    }

    update(time, delta) {
        this.handleMovement(time);
        this.interpolateRemotePlayers(delta);
        this.syncPlayerAttachments();

        const near = this.isNearLaptop();
        if (this.useBtn) {
            this.useBtn.setAlpha(near ? 1 : 0.42);
            if (this.game.renderer.type === Phaser.WEBGL) {
                if (near) this.useBtn.resetPipeline();
                else if (this.useBtn.pipeline?.name !== 'GrayScale') this.useBtn.setPipeline('GrayScale');
            }
            this.useHintText.setColor(near ? '#4ade80' : '#94a3b8');
        }
        if (this.laptopWorldLabel) {
            this.laptopWorldLabel.setVisible(near);
        }

        const activeTag = document.activeElement?.tagName;
        const typing = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
        if (!typing && !this.laptopOpen) {
            if (near && Phaser.Input.Keyboard.JustDown(this.eKey)) {
                this.openLaptopModal('settings');
            } else if (near && Phaser.Input.Keyboard.JustDown(this.cKey)) {
                this.openLaptopModal('customize');
            }
        }
    }

    onSceneShutdown() {
        if (this.socket) {
            if (this._onPlayerCustomized) this.socket.off('player:customized', this._onPlayerCustomized);
            if (this._onSettingsUpdated) this.socket.off('room:settings:updated', this._onSettingsUpdated);
        }
        super.onSceneShutdown();
        EventBus.off('start-game', this.handleStartGame, this);
        EventBus.off('laptop:modal-state', this.handleLaptopState, this);
    }
}
