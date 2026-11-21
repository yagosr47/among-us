import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './RoleReveal.module.css';
import CrewmateAvatar from './CrewmateAvatar.jsx';
import { EventBus } from '../game/EventBus.js';
import { soundFX } from '../utils/sound.js';

const SHH_DURATION_MS = 1100;
const ROLE_HOLD_UNTIL_MS = 2950;
const EXIT_FADE_MS = 320;

export default function RoleReveal({
    isImposter,
    impostorCount = 1,
    fellowImposters = [],
    players = {},
    localPlayerId,
    onComplete,
}) {
    const [phase, setPhase] = useState('shh'); // 'shh' -> 'role' -> 'exit'

    const isImposterRef = useRef(isImposter);
    const onCompleteRef = useRef(onComplete);
    const phaseRef = useRef(phase);
    const playedShhRef = useRef(false);
    const finishedRef = useRef(false);
    const timersRef = useRef({ t1: null, t2: null, t3: null });

    phaseRef.current = phase;

    useEffect(() => {
        isImposterRef.current = isImposter;
    }, [isImposter]);

    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    const clearAllTimers = useCallback(() => {
        const { t1, t2, t3 } = timersRef.current;
        if (t1) clearTimeout(t1);
        if (t2) clearTimeout(t2);
        if (t3) clearTimeout(t3);
        timersRef.current = { t1: null, t2: null, t3: null };
    }, []);

    const finish = useCallback(() => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        onCompleteRef.current?.();
    }, []);

    const triggerSkip = useCallback(() => {
        if (finishedRef.current || phaseRef.current !== 'role') return;
        phaseRef.current = 'exit';
        clearAllTimers();
        setPhase('exit');
        timersRef.current.t3 = setTimeout(finish, EXIT_FADE_MS);
    }, [clearAllTimers, finish]);

    useEffect(() => {
        EventBus.emit('role:reveal-state', true);

        if (!playedShhRef.current) {
            playedShhRef.current = true;
            soundFX.playShhh();
        }

        timersRef.current.t1 = setTimeout(() => {
            setPhase('role');
            soundFX.playRoleReveal(Boolean(isImposterRef.current));
        }, SHH_DURATION_MS);

        timersRef.current.t2 = setTimeout(() => {
            setPhase('exit');
        }, ROLE_HOLD_UNTIL_MS);

        timersRef.current.t3 = setTimeout(() => {
            finish();
        }, ROLE_HOLD_UNTIL_MS + EXIT_FADE_MS);

        return () => {
            clearAllTimers();
            EventBus.emit('role:reveal-state', false);
        };
    }, [clearAllTimers, finish]);

    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.code === 'Space' || e.key === 'Enter' || e.key === 'Escape') {
                triggerSkip();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [triggerSkip]);

    const playerList = Object.values(players || {});
    const localPlayer = playerList.find((p) => p.id === localPlayerId);
    const impDisplayList =
        fellowImposters?.length > 0
            ? fellowImposters
            : localPlayer
              ? [{ id: localPlayer.id, name: localPlayer.name, color: localPlayer.color }]
              : [];

    return (
        <div
            className={`${styles.overlay} ${phase === 'exit' ? styles.fadeOut : ''}`}
            onClick={phase === 'role' ? triggerSkip : undefined}
        >
            <div className={styles.starsLayer} />

            {phase === 'shh' && (
                <div className={styles.shhStage}>
                    <img src="/assets/sh/shBg.png" alt="" className={styles.shBg} />
                    <img src="/assets/sh/shHead.png" alt="Shhh" className={styles.shHead} />
                    <img src="/assets/sh/shHand.png" alt="" className={styles.shHand} />
                    <img src="/assets/sh/shText.png" alt="SHHHHHHH!" className={styles.shText} />
                </div>
            )}

            {phase !== 'shh' && (
                <div className={`${styles.roleStage} ${isImposter ? styles.imposterTheme : styles.crewTheme}`}>
                    <div className={styles.spotlight} />
                    <h1 className={styles.roleTitle}>
                        {isImposter ? 'IMPOSTOR' : 'CREWMATE'}
                    </h1>
                    <p className={styles.roleSub}>
                        {isImposter
                            ? 'Sabotage, vent, and eliminate the crew without getting caught.'
                            : `Complete all tasks or find the ${impostorCount} ${
                                  impostorCount === 1 ? 'Impostor' : 'Impostors'
                              } among us.`}
                    </p>

                    <div className={styles.lineup}>
                        {isImposter ? (
                            impDisplayList.map((imp, idx) => (
                                <div
                                    key={imp.id}
                                    className={styles.featuredAvatar}
                                    style={{ animationDelay: `${idx * 70}ms` }}
                                >
                                    <CrewmateAvatar
                                        color={imp.color || '#c51111'}
                                        size={imp.id === localPlayerId ? 116 : 92}
                                    />
                                    <span className={styles.playerLabel}>{imp.name}</span>
                                </div>
                            ))
                        ) : (
                            playerList.slice(0, 10).map((p, idx) => (
                                <div
                                    key={p.id}
                                    className={styles.lineupItem}
                                    style={{ animationDelay: `${idx * 50}ms` }}
                                >
                                    <CrewmateAvatar
                                        color={p.color}
                                        size={p.id === localPlayerId ? 92 : 70}
                                    />
                                    <span className={styles.playerLabel}>{p.name}</span>
                                </div>
                            ))
                        )}
                    </div>

                    {phase === 'role' && (
                        <p className={styles.skipHint}>Click or press Space to continue</p>
                    )}
                </div>
            )}
        </div>
    );
}
