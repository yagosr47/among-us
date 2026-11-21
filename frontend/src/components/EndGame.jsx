import { useEffect } from 'react';
import styles from './EndGame.module.css';
import Button from './Button.jsx';
import CrewmateAvatar from './CrewmateAvatar.jsx';
import { soundFX } from '../utils/sound.js';

const REASON_TEXT = {
    tasks_completed: 'Crewmates completed all ship tasks!',
    imposter_eliminated: 'All Impostors were eliminated!',
    outnumbered: 'The Impostors outnumbered the crew!',
};

export default function EndGame({
    result,
    isLocalPlayerImposter,
    isHost,
    players = {},
    onPlayAgain,
    onBackToMenu,
}) {
    const isImposterWin = Boolean(result?.isImposter);
    const isVictory = isLocalPlayerImposter ? isImposterWin : !isImposterWin;

    useEffect(() => {
        if (isVictory) soundFX.playVictory();
        else soundFX.playDefeat();
    }, [isVictory]);

    const reasonText =
        REASON_TEXT[result?.reason] ||
        (isImposterWin ? 'The Impostors took over the ship!' : 'Crewmates saved The Skeld!');

    const impSet = new Set(
        result?.imposters?.length ? result.imposters : result?.imposterId ? [result.imposterId] : []
    );

    const winnerPlayers = Object.values(players || {}).filter((p) =>
        isImposterWin ? impSet.has(p.id) : !impSet.has(p.id)
    );

    const impNamesText =
        result?.imposterNames?.length > 0
            ? result.imposterNames.join(', ')
            : result?.imposterName || '';

    return (
        <div className={`${styles.endGameOverlay} ${isVictory ? styles.victory : styles.defeat}`}>
            <div className={styles.starsLayer} />
            <div className={styles.content}>
                <h1 className={styles.title}>{isVictory ? 'VICTORY' : 'DEFEAT'}</h1>
                <p className={styles.winnerMessage}>
                    {isImposterWin
                        ? impSet.size > 1
                            ? 'Impostors Win'
                            : 'Impostor Wins'
                        : 'Crewmates Win'}
                </p>
                <p className={styles.reason}>{reasonText}</p>
                {impNamesText && (
                    <p className={styles.revealImposter}>
                        {impSet.size > 1 ? 'The Impostors were ' : 'The Impostor was '}
                        <span>{impNamesText}</span>
                    </p>
                )}

                <div className={styles.characterRow}>
                    {(winnerPlayers.length > 0
                        ? winnerPlayers.slice(0, 8)
                        : [
                              {
                                  id: 'fallback',
                                  color: isImposterWin ? '#c51111' : '#38fedc',
                                  name: '',
                              },
                          ]
                    ).map((p, idx) => (
                        <div
                            key={p.id}
                            className={`${styles.character} ${isVictory ? styles.jump : styles.float}`}
                            style={{ animationDelay: `${idx * 110}ms` }}
                        >
                            <CrewmateAvatar color={p.color} size={84} />
                            {p.name && <span className={styles.charName}>{p.name}</span>}
                        </div>
                    ))}
                </div>

                <div className={styles.btnRow}>
                    {isHost && (
                        <Button onClick={onPlayAgain} className={styles.playAgainBtn}>
                            Play Again
                        </Button>
                    )}
                    <Button onClick={onBackToMenu} className={styles.menuBtn}>
                        Leave Room
                    </Button>
                </div>
            </div>
        </div>
    );
}
