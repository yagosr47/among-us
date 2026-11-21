import Phaser from 'phaser';
import { SKELD_CONSTANTS } from '../skeldData.js';

export function setupVisionSystem(scene) {
    if (!scene.player || !scene.collisionLayer) return;

    scene.mapObjectBounds = [];
    scene.mapObjects = [];

    const useShader = scene.game.renderer.type === Phaser.WEBGL;

    if (scene.background) {
        if (useShader) scene.background.setPipeline('VisionRadius');
        scene.mapObjectBounds.push({
            object: scene.background,
            origin: { x: 0, y: 0 },
            size: {
                width: scene.background.displayWidth || scene.background.width,
                height: scene.background.displayHeight || scene.background.height,
            },
        });
        scene.mapObjects.push(scene.background);
    }

    if (scene.collisionLayer) {
        if (useShader) scene.collisionLayer.setPipeline('VisionRadius');
        scene.mapObjectBounds.push({
            object: scene.collisionLayer,
            origin: { x: 0, y: 0 },
            size: {
                width: scene.collisionLayer.displayWidth || scene.collisionLayer.width,
                height: scene.collisionLayer.displayHeight || scene.collisionLayer.height,
            },
        });
        scene.mapObjects.push(scene.collisionLayer);
    }

    const settings = scene.room?.settings || {};
    const crewMult = settings.crewVision || 1.0;
    const impMult = settings.impostorVision || 1.25;
    scene.VISION_RADIUS = scene.imposter
        ? Math.round(SKELD_CONSTANTS.IMPOSTOR_BASE_VISION * impMult)
        : Math.round(SKELD_CONSTANTS.CREW_BASE_VISION * crewMult);
    scene.visionEnabled = true;
}

export function disableVisionSystem(scene) {
    scene.visionEnabled = false;

    (scene.mapObjects || []).forEach((obj) => {
        if (obj && obj.resetPipeline) {
            obj.resetPipeline();
        }
    });

    Object.values(scene.players || {}).forEach((p) => {
        if (!p) return;
        const canSeeGhost = !scene.player?.alive;
        const visible = (p.alive || canSeeGhost) && !p.inVent;
        p.setVisible(visible);
        if (p.shadow) p.shadow.setVisible(p.alive && visible);
        if (p.nameTag) p.nameTag.setVisible(visible);
    });

    Object.values(scene.deadBodiesMap || {}).forEach((b) => {
        if (b && b.setVisible) b.setVisible(true);
    });
}

export function enableVisionSystem(scene) {
    // Ghosts keep full map vision
    if (scene.player && !scene.player.alive) {
        disableVisionSystem(scene);
        return;
    }

    scene.visionEnabled = true;
    const useShader = scene.game.renderer.type === Phaser.WEBGL;
    if (useShader) {
        (scene.mapObjects || []).forEach((obj) => {
            if (obj && obj.setPipeline) {
                obj.setPipeline('VisionRadius');
            }
        });
    }
}

export function updateVisionSystem(scene) {
    if (!scene.player || !scene.cameras.main || !scene.mapObjectBounds) return;

    // Ghosts see the entire ship clearly
    if (!scene.player.alive) {
        if (scene.visionEnabled) disableVisionSystem(scene);
        return;
    }

    if (scene.game.renderer.type === Phaser.WEBGL) {
        const pipeline = scene.game.renderer.pipelines.get('VisionRadius');
        if (pipeline) {
            pipeline.set2f('uPlayerPosition', scene.player.x, scene.player.y);
            pipeline.set1f('uVisionRadius', scene.VISION_RADIUS);

            scene.mapObjectBounds.forEach((bounds) => {
                const obj = bounds.object;
                if (obj && obj.pipeline && obj.pipeline.name === 'VisionRadius') {
                    obj.pipeline.set2f('uTextureOrigin', bounds.origin.x, bounds.origin.y);
                    obj.pipeline.set2f('uTextureSize', bounds.size.width, bounds.size.height);
                }
            });
        }
    }

    // Show/hide remote players + nameplates + shadows by vision radius
    Object.values(scene.players || {}).forEach((p) => {
        if (!p || p === scene.player) return;

        if (!p.alive || p.inVent) {
            p.setVisible(false);
            if (p.shadow) p.shadow.setVisible(false);
            if (p.nameTag) p.nameTag.setVisible(false);
            return;
        }

        const dist = Phaser.Math.Distance.Between(scene.player.x, scene.player.y, p.x, p.y);
        const inSight = dist <= scene.VISION_RADIUS;
        p.setVisible(inSight);
        if (p.shadow) p.shadow.setVisible(inSight);
        if (p.nameTag) p.nameTag.setVisible(inSight);
    });

    // Show/hide dead bodies by vision radius
    Object.values(scene.deadBodiesMap || {}).forEach((bodySprite) => {
        if (!bodySprite) return;
        const dist = Phaser.Math.Distance.Between(
            scene.player.x,
            scene.player.y,
            bodySprite.x,
            bodySprite.y
        );
        bodySprite.setVisible(dist <= scene.VISION_RADIUS);
    });
}
