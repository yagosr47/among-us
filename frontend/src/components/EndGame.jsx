import { useEffect } from 'react';
import styles from './EndGame.module.css';
import Button from './Button.jsx';
import CrewmateAvatar from './CrewmateAvatar.jsx';
import { soundFX } from '../utils/sound.js';

const REASON_TEXT = {
    tasks_completed: 'Crewmates completed all ship tasks!',
    imposter_eliminated: 'The Impostor was ejected!',
    outnumbered: 'The Impostor outnumbered the crew!',
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
        (isImposterWin ? 'The Impostor took over the ship!' : 'Crewmates saved The Skeld!');

    const winnerPlayers = Object.values(players || {}).filter((p) =>
        isImposterWin ? p.id === result?.imposterId : p.id !== result?.imposterId
    );

    return (
        <div className={`${styles.endGameOverlay} ${isVictory ? styles.victory : styles.defeat}`}>
            <div className={styles.starsLayer} />
            <div className={styles.content}>
                <h1 className={styles.title}>{isVictory ? 'VICTORY' : 'DEFEAT'}</h1>
                <p className={styles.winnerMessage}>
                    {isImposterWin ? 'Impostor Wins' : 'Crewmates Win'}
                </p>
                <p className={styles.reason}>{reasonText}</p>
                {result?.imposterName && (
                    <p className={styles.revealImposter}>
                        The Impostor was <span>{result.imposterName}</span>
                    </p>
                )}

                <div className={styles.characterRow}>
                    {(winnerPlayers.length > 0 ? winnerPlayers.slice(0, 6) : [{ id: 'fallback', color: isImposterWin ? '#c51111' : '#38fedc', name: '' }]).map(
                        (p, idx) => (
                            <div
                                key={p.id}
                                className={`${styles.character} ${isVictory ? styles.jump : styles.float}`}
                                style={{ animationDelay: `${idx * 110}ms` }}
                            >
                                <CrewmateAvatar color={p.color} size={84} />
                                {p.name && <span className={styles.charName}>{p.name}</span>}
                            </div>
                        )
                    )}
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
