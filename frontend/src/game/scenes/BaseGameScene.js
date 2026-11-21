import Phaser from 'phaser';
import { Scene } from 'phaser';
import { socketService } from '../../services/socket.js';
import { EventBus } from '../EventBus.js';
import { createPlayer, spawnDustPuff } from '../utils/playerFactory.js';
import { soundFX } from '../../utils/sound.js';

export class BaseGameScene extends Scene {
    constructor(key) {
        super(key);
    }

    init(data) {
        this.config = data || {};
        this.roomId = data?.roomId || null;
        this.room = data?.room || null;
    }

    getMapConfig() {
        throw new Error('getMapConfig() must be implemented by child class');
    }

    preloadCommon() {
        this.load.atlas('player', 'assets/walk/texture.png', 'assets/walk/texture.json');
        this.load.image('idleImage', 'assets/sprites/Base/idle.png');
        this.load.image('starParticle', 'assets/star.png');

        // Load Ghost animation frames (every 2nd frame for smooth loop & fast load)
        for (let i = 1; i <= 47; i += 2) {
            const num = String(i).padStart(4, '0');
            this.load.image(`ghost_${num}`, `assets/sprites/Base/ghost/ghost${num}.png`);
        }

        // Load Vent frames
        for (let i = 1; i <= 7; i++) {
            const num = String(i).padStart(4, '0');
            this.load.image(`vent${i}`, `assets/sprites/Base/Vent${num}.png`);
        }
    }

    preloadMap() {
        const config = this.getMapConfig();
        this.load.image(config.tilesetKey, `assets/map/${config.tilesetKey}.png`);
        this.load.image(config.backgroundKey, `assets/map/${config.backgroundImage}`);
        this.load.tilemapTiledJSON(config.mapKey, `assets/map/${config.mapJSON}`);
    }

    createCommonAnimations() {
        if (!this.anims.exists('walk')) {
            const frames = [];
            for (let i = 1; i <= 12; i++) {
                frames.push({ key: 'player', frame: `Walk${String(i).padStart(4, '0')}.png` });
            }
            this.anims.create({
                key: 'walk',
                frames,
                frameRate: 15,
                repeat: -1,
            });
        }

        if (!this.anims.exists('ghost')) {
            const ghostFrames = [];
            for (let i = 1; i <= 47; i += 2) {
                ghostFrames.push({ key: `ghost_${String(i).padStart(4, '0')}` });
            }
            this.anims.create({
                key: 'ghost',
                frames: ghostFrames,
                frameRate: 18,
                repeat: -1,
            });
        }

        if (!this.anims.exists('ventAnim')) {
            const ventFrames = [];
            for (let i = 1; i <= 7; i++) {
                ventFrames.push({ key: `vent${i}` });
            }
            this.anims.create({
                key: 'ventAnim',
                frames: ventFrames,
                frameRate: 18,
                repeat: 0,
            });
        }
    }

    setupMap() {
        const config = this.getMapConfig();
        const map = this.make.tilemap({ key: config.mapKey });
        const tileset = map.addTilesetImage(config.tilesetName, config.tilesetKey);
        const collisionLayer = map.createLayer('collisions', tileset, 0, 0);

        this.background = this.add.image(0, 0, config.backgroundKey).setOrigin(0, 0).setName('background');
        this.worldContainer.add(this.background);

        if (collisionLayer) {
            if (this.scene.key === 'WaitingLobby') {
                const scaleX = 1232 / map.widthInPixels;
                const scaleY = 1008 / map.heightInPixels;
                collisionLayer.setScale(scaleX, scaleY);
            }
            collisionLayer.setVisible(false);
            collisionLayer.setCollisionByExclusion([-1, 0]);
            this.collisionLayer = collisionLayer;
            this.worldContainer.add(collisionLayer);
        }

        return { map, tileset, collisionLayer };
    }

    setupInput() {
        this.wKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.aKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.sKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.dKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        this.cursors = this.input.keyboard.createCursorKeys();
    }

    addPlayer(playerData) {
        if (!playerData?.id) return null;
        if (this.players[playerData.id]) {
            this.removePlayer(playerData.id);
        }

        const newPlayer = createPlayer(this, playerData, {
            addCollision: true,
            collisionLayer: this.collisionLayer,
        });

        this.players[playerData.id] = newPlayer;
        if (!this.spawnPositions[playerData.id]) {
            this.spawnPositions[playerData.id] = { x: playerData.x, y: playerData.y };
        }
        return newPlayer;
    }

    removePlayer(playerId) {
        const p = this.players[playerId];
        if (!p) return;
        if (p.ghostTween) p.ghostTween.stop();
        if (p.shadow) p.shadow.destroy();
        if (p.nameTag) p.nameTag.destroy();
        if (p.destroy) p.destroy();
        delete this.players[playerId];
    }

    async fetchAndSetupPlayers() {
        const playerId = sessionStorage.getItem('playerId');
        const data = await socketService.fetchPlayerRoom(playerId);
        if (!this.sys || !this.sys.displayList) return;
        if (!data?.room || !data?.player) {
            console.error('Failed to fetch player room snapshot');
            return;
        }

        this.room = data.room;
        this.roomId = data.room.id;
        this.playerObj = data.player;

        this.player = this.addPlayer({
            id: data.player.id,
            name: data.player.name,
            x: data.player.state.x,
            y: data.player.state.y,
            color: data.player.color,
            isAlive: data.player.isAlive,
        });

        const zoom = this.scene.key === 'WaitingLobby' ? 1 : 3;
        this.cameras.main.setZoom(zoom);
        this.cameras.main.startFollow(this.player, true, 0.14, 0.14);
        this.cameras.main.ignore(this.ui);

        Object.values(this.room.players).forEach((p) => {
            if (p.id === this.playerObj.id) return;
            this.addPlayer({
                id: p.id,
                name: p.name,
                x: p.state.x,
                y: p.state.y,
                color: p.color,
                isAlive: p.isAlive,
            });
        });
    }

    setupSocketListeners() {
        const socket = socketService.getSocket();
        if (!socket || this._socketListenersAdded) return;
        this.socket = socket;

        this._onPlayerJoined = (data) => {
            if (!this.sys || !this.sys.displayList || !data?.player) return;
            if (data.player.id === this.playerObj?.id) return;

            this.addPlayer({
                id: data.player.id,
                name: data.player.name,
                x: data.player.state.x,
                y: data.player.state.y,
                color: data.player.color,
                isAlive: data.player.isAlive,
            });
            if (this.room?.players) {
                this.room.players[data.player.id] = data.player;
            }
        };

        this._onPlayerLeft = (data) => {
            if (!data?.playerId) return;
            this.removePlayer(data.playerId);
            if (this.room?.players) {
                delete this.room.players[data.playerId];
            }
        };

        this._onPlayerMoved = (data) => {
            const player = this.players[data.id];
            if (!player || player === this.player) return;

            player.targetX = data.x;
            player.targetY = data.y;
            player.netMoving = Boolean(data.moving);
            if (data.d) {
                player.flipX = data.d === 'left';
            }
        };

        socket.on('player:joined', this._onPlayerJoined);
        socket.on('player:left', this._onPlayerLeft);
        socket.on('player:moved', this._onPlayerMoved);
        this._socketListenersAdded = true;
    }

    cleanupSocketListeners() {
        if (this.socket && this._socketListenersAdded) {
            if (this._onPlayerJoined) this.socket.off('player:joined', this._onPlayerJoined);
            if (this._onPlayerLeft) this.socket.off('player:left', this._onPlayerLeft);
            if (this._onPlayerMoved) this.socket.off('player:moved', this._onPlayerMoved);
            this._onPlayerJoined = null;
            this._onPlayerLeft = null;
            this._onPlayerMoved = null;
            this._socketListenersAdded = false;
        }
    }

    async createCommon() {
        this.ui = this.add.container(0, 0).setScrollFactor(0).setDepth(1000);
        this.worldContainer = this.add.container(0, 0).setDepth(0);
        this.players = {};
        this.spawnPositions = {};
        this._lastMoveEmitAt = 0;
        this._lastDustAt = 0;
        this._lastFootstepAt = 0;
        this._lastSentMoving = false;
        this._lastSentDir = 'right';

        const uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
        uiCam.setScroll(0, 0);
        uiCam.setZoom(1);
        uiCam.ignore(this.worldContainer);

        this.cameras.main.ignore(this.ui);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.onSceneShutdown());

        this.createCommonAnimations();
        this.setupMap();
        this.setupInput();
        this.setupSocketListeners();
        await this.fetchAndSetupPlayers();
        EventBus.emit('current-scene-ready', this);
    }

    interpolateRemotePlayers(delta) {
        const lerpFactor = 1 - Math.exp(-18 * (delta / 1000));
        Object.values(this.players || {}).forEach((p) => {
            if (!p || p === this.player) return;

            if (typeof p.targetX === 'number' && typeof p.targetY === 'number') {
                const dx = p.targetX - p.x;
                const dy = p.targetY - p.y;
                if (Math.hypot(dx, dy) > 80) {
                    p.x = p.targetX;
                    p.y = p.targetY;
                } else {
                    p.x = Phaser.Math.Linear(p.x, p.targetX, lerpFactor);
                    p.y = Phaser.Math.Linear(p.y, p.targetY, lerpFactor);
                }
            }

            if (!p.alive) {
                if (p.anims && p.anims.currentAnim?.key !== 'ghost') {
                    p.anims.play('ghost');
                }
            } else if (p.netMoving) {
                if (p.anims && (!p.anims.isPlaying || p.anims.currentAnim?.key !== 'walk')) {
                    p.anims.play('walk');
                }
            } else if (p.anims) {
                if (p.anims.isPlaying) p.anims.stop();
                p.setTexture('idleImage');
            }
        });
    }

    syncPlayerAttachments() {
        const isLobby = this.scene.key === 'WaitingLobby';
        const shadowOffsetY = isLobby ? 20 : 9;
        const nameOffsetY = isLobby ? 26 : 12;

        Object.values(this.players || {}).forEach((p) => {
            if (!p || !p.active) return;
            if (p.shadow) {
                p.shadow.setPosition(p.x, p.y + shadowOffsetY);
            }
            if (p.nameTag) {
                p.nameTag.setPosition(p.x, p.y - nameOffsetY);
            }
        });
    }

    handleMovement(time = 0) {
        if (!this.player || !this.player.body || !this.playerObj) return;

        // Disable keyboard movement while modal/meeting/venting/laptop is active
        if (this.meetingActive || this.taskModalOpen || this.laptopOpen || this.player.inVent) {
            this.player.body.setVelocity(0, 0);
            if (this.player.alive && this.player.anims.isPlaying) {
                this.player.anims.stop();
                this.player.setTexture('idleImage');
            }
            return;
        }

        // Prevent Phaser movement while typing inside chat/inputs in React
        const activeTag = document.activeElement?.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
            this.player.body.setVelocity(0, 0);
            return;
        }

        this.player.body.setVelocity(0, 0);

        const speedMultiplier = this.room?.settings?.playerSpeed || 1.0;
        const baseSpeed = this.scene.key === 'WaitingLobby' ? 300 * Math.min(1.4, speedMultiplier) : 112 * speedMultiplier;
        const speed = this.player.alive ? baseSpeed : baseSpeed * 1.25;
        let vx = 0;
        let vy = 0;

        if (this.wKey.isDown || this.cursors.up.isDown) vy = -speed;
        if (this.sKey.isDown || this.cursors.down.isDown) vy = speed;
        if (this.aKey.isDown || this.cursors.left.isDown) {
            vx = -speed;
            this.playerObj.state.d = 'left';
        }
        if (this.dKey.isDown || this.cursors.right.isDown) {
            vx = speed;
            this.playerObj.state.d = 'right';
        }

        if (vx !== 0 && vy !== 0) {
            vx *= 0.7071;
            vy *= 0.7071;
        }

        this.player.body.setVelocity(vx, vy);
        if (vx < 0) this.player.flipX = true;
        else if (vx > 0) this.player.flipX = false;

        const isMoving = vx !== 0 || vy !== 0;

        if (this.player.alive) {
            if (isMoving) {
                if (!this.player.anims.isPlaying || this.player.anims.currentAnim?.key !== 'walk') {
                    this.player.anims.play('walk');
                }
                if (time - this._lastDustAt > 170) {
                    this._lastDustAt = time;
                    spawnDustPuff(
                        this,
                        this.player.x,
                        this.player.y,
                        0xcbd5e1,
                        this.scene.key === 'WaitingLobby' ? 2.1 : 0.9
                    );
                }
                if (time - this._lastFootstepAt > 280) {
                    this._lastFootstepAt = time;
                    soundFX.playFootstep();
                }
            } else if (this.player.anims.isPlaying) {
                this.player.anims.stop();
                this.player.setTexture('idleImage');
            }
        } else if (this.player.anims.currentAnim?.key !== 'ghost') {
            this.player.anims.play('ghost');
        }

        // Throttled socket movement broadcast (~20 Hz, plus instant stop/direction flush)
        const dirChanged = this.playerObj.state.d !== this._lastSentDir;
        const stateChanged = isMoving !== this._lastSentMoving || dirChanged;
        if ((isMoving && time - this._lastMoveEmitAt >= 50) || stateChanged) {
            this._lastMoveEmitAt = time;
            this._lastSentMoving = isMoving;
            this._lastSentDir = this.playerObj.state.d;

            if (this.socket && this.roomId) {
                this.socket.emit('player:move', {
                    id: this.playerObj.id,
                    x: Math.round(this.player.x * 10) / 10,
                    y: Math.round(this.player.y * 10) / 10,
                    roomId: this.roomId,
                    d: this.playerObj.state.d,
                    moving: isMoving,
                });
            }
        }
    }

    onSceneShutdown() {
        this.cleanupSocketListeners();
    }
}
