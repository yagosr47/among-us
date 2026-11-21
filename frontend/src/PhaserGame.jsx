import { forwardRef, useEffect, useLayoutEffect, useRef } from 'react';
import StartGame from './game/main.js';
import { EventBus } from './game/EventBus.js';

export const PhaserGame = forwardRef(function PhaserGame({ currentActiveScene }, ref) {
    const game = useRef();

    useLayoutEffect(() => {
        if (game.current === undefined) {
            game.current = StartGame('game-container');
            if (ref) {
                ref.current = { game: game.current, scene: null };
            }
        }

        return () => {
            if (game.current) {
                game.current.destroy(true);
                game.current = undefined;
            }
        };
    }, [ref]);

    useEffect(() => {
        const handleReady = (currentScene) => {
            if (typeof currentActiveScene === 'function') {
                currentActiveScene(currentScene);
            }
            if (ref && ref.current) {
                ref.current.scene = currentScene;
            }
        };

        EventBus.on('current-scene-ready', handleReady);
        return () => {
            EventBus.off('current-scene-ready', handleReady);
        };
    }, [currentActiveScene, ref]);

    return <div id="game-container" />;
});
