import Phaser from 'phaser';
import { ColorSwapPipeline } from '../shaders/fragShader.js';

export function ensureColorSwapPipeline(scene) {
    if (scene.game.renderer.type !== Phaser.WEBGL) return false;
    const pipelines = scene.game.renderer.pipelines;
    if (!pipelines.has('ColorSwap')) {
        pipelines.add('ColorSwap', new ColorSwapPipeline(scene.game));
    }
    return true;
}

export function setPlayerColor(scene, sprite, colorHex) {
    const colorInt = Phaser.Display.Color.HexStringToColor(colorHex || '#c51111').color;
    sprite.setTint(colorInt);
    if (ensureColorSwapPipeline(scene)) {
        sprite.setPipeline('ColorSwap');
    }
    sprite.setBlendMode(Phaser.BlendModes.NORMAL);
}

export function createPlayer(scene, playerData, options = {}) {
    const { addCollision = false, collisionLayer = null, isImposterTag = false } = options;
    const isLobby = scene.scene.key === 'WaitingLobby';
    const baseScale = isLobby ? 0.24 : 0.1;

    // Ground drop shadow
    const shadow = scene.add.ellipse(
        playerData.x,
        playerData.y + (isLobby ? 20 : 9),
        isLobby ? 34 : 15,
        isLobby ? 12 : 5,
        0x000000,
        0.38
    );
    shadow.setDepth(5);
    scene.worldContainer.add(shadow);

    const player = scene.physics.add.sprite(
        playerData.x,
        playerData.y,
        'player',
        'Walk0001.png'
    );
    player.setDepth(20);
    scene.worldContainer.add(player);

    let wallCollider = null;
    if (addCollision && collisionLayer) {
        wallCollider = scene.physics.add.collider(player, collisionLayer);
    }

    player.setScale(baseScale);
    player.body.setSize(player.width * 0.4, player.height * 0.55);
    player.body.setOffset(player.width * 0.3, player.height * 0.25);

    setPlayerColor(scene, player, playerData.color);

    // Floating nameplate
    const nameText = scene.add
        .text(0, 0, playerData.name || 'Player', {
            fontFamily: 'Arial, sans-serif',
            fontSize: isLobby ? '15px' : '11px',
            fontStyle: 'bold',
            color: isImposterTag ? '#ff4d4d' : '#ffffff',
            stroke: '#000000',
            strokeThickness: isLobby ? 4 : 3,
            align: 'center',
        })
        .setOrigin(0.5, 1)
        .setDepth(500);
    if (!isLobby) {
        nameText.setScale(0.75);
    }
    scene.worldContainer.add(nameText);

    player.id = playerData.id;
    player.playerName = playerData.name || 'Player';
    player.playerColor = playerData.color || '#c51111';
    player.alive = playerData.isAlive !== false;
    player.inVent = false;
    player.baseScale = baseScale;
    player.shadow = shadow;
    player.nameTag = nameText;
    player.wallCollider = wallCollider;
    player.targetX = playerData.x;
    player.targetY = playerData.y;

    if (!player.alive) {
        convertToGhost(scene, player);
    }

    return player;
}

export function convertToGhost(scene, player) {
    if (!player || !player.scene) return;
    player.alive = false;
    player.inVent = false;

    // Ghosts can pass through walls
    if (player.wallCollider) {
        player.wallCollider.active = false;
    }

    if (player.shadow) {
        player.shadow.setVisible(false);
    }

    if (player.nameTag) {
        player.nameTag.setColor('#9ad8ff');
        player.nameTag.setAlpha(0.75);
    }

    player.setAlpha(0.52);
    if (scene.anims.exists('ghost')) {
        player.anims.play('ghost');
    }

    // Gentle floating bobbing tween
    if (!player.ghostTween) {
        player.ghostTween = scene.tweens.add({
            targets: player,
            scaleY: { from: player.baseScale * 0.96, to: player.baseScale * 1.04 },
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }
}

export function spawnDustPuff(scene, x, y, color = 0xdbe7f3, scale = 1) {
    if (!scene || !scene.worldContainer) return;
    const puff = scene.add.circle(x, y + 6 * scale, 2.6 * scale, color, 0.45);
    puff.setDepth(8);
    scene.worldContainer.add(puff);

    scene.tweens.add({
        targets: puff,
        y: puff.y - 4 * scale,
        scale: 1.9,
        alpha: 0,
        duration: 320,
        ease: 'Quad.easeOut',
        onComplete: () => puff.destroy(),
    });
}
