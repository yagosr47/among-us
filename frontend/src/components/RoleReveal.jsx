import { useEffect, useState } from 'react';
import styles from './RoleReveal.module.css';
import CrewmateAvatar from './CrewmateAvatar.jsx';
import { soundFX } from '../utils/sound.js';

export default function RoleReveal({
    isImposter,
    impostorCount = 1,
    fellowImposters = [],
    players = {},
    localPlayerId,
    onComplete,
}) {
    const [phase, setPhase] = useState('shh'); // 'shh' -> 'role' -> fadeout

    useEffect(() => {
        soundFX.playShhh();
        const t1 = setTimeout(() => {
            setPhase('role');
            soundFX.playRoleReveal(isImposter);
        }, 1600);
        const t2 = setTimeout(() => {
            setPhase('exit');
        }, 3900);
        const t3 = setTimeout(() => {
            onComplete?.();
        }, 4350);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, [isImposter, onComplete]);

    const playerList = Object.values(players || {});
    const localPlayer = playerList.find((p) => p.id === localPlayerId);
    const impDisplayList =
        fellowImposters?.length > 0
            ? fellowImposters
            : localPlayer
              ? [{ id: localPlayer.id, name: localPlayer.name, color: localPlayer.color }]
              : [];

    return (
        <div className={`${styles.overlay} ${phase === 'exit' ? styles.fadeOut : ''}`}>
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
                                    style={{ animationDelay: `${idx * 90}ms` }}
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
                                    style={{ animationDelay: `${idx * 65}ms` }}
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
                </div>
            )}
        </div>
    );
}
