import Phaser from 'phaser';
import { BaseGameScene } from './BaseGameScene.js';
import { EventBus } from '../EventBus.js';

export class WaitingLobby extends BaseGameScene {
    constructor() {
        super('WaitingLobby');
        this.handleStartGame = this.handleStartGame.bind(this);
    }

    init(data) {
        super.init(data);
    }

    handleStartGame(data) {
        if (this.scene && this.scene.isActive('WaitingLobby')) {
            this.scene.start('Game', data);
        }
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
    }

    async create() {
        await this.createCommon();
        this.setupLobbyEffects();

        EventBus.off('start-game', this.handleStartGame, this);
        EventBus.on('start-game', this.handleStartGame, this);
    }

    setupLobbyEffects() {
        // Subtle glowing ring around the customization laptop crate
        const laptopGlow = this.add.circle(618, 375, 48, 0x4ecca3, 0.14).setDepth(3);
        this.worldContainer.add(laptopGlow);
        this.tweens.add({
            targets: laptopGlow,
            scale: 1.25,
            alpha: 0.05,
            duration: 1400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

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

    update(time, delta) {
        this.handleMovement(time);
        this.interpolateRemotePlayers(delta);
        this.syncPlayerAttachments();
    }

    onSceneShutdown() {
        super.onSceneShutdown();
        EventBus.off('start-game', this.handleStartGame, this);
    }
}
