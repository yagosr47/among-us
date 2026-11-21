import { useEffect, useState } from 'react';
import styles from './EjectionOverlay.module.css';
import CrewmateAvatar from './CrewmateAvatar.jsx';
import { soundFX } from '../utils/sound.js';

export default function EjectionOverlay({ results, onComplete }) {
    const [typedText, setTypedText] = useState('');

    let fullMessage = 'No one was ejected. (Skipped)';
    if (results?.ejectedId) {
        fullMessage = `${results.ejectedName} was ${results.wasImposter ? '' : 'not '}The Impostor.`;
    } else if (results?.tie) {
        fullMessage = 'No one was ejected. (Tie)';
    }

    useEffect(() => {
        if (results?.ejectedId) {
            soundFX.playEject();
        }
        let idx = 0;
        const typeTimer = setInterval(() => {
            idx++;
            setTypedText(fullMessage.slice(0, idx));
            if (idx >= fullMessage.length) clearInterval(typeTimer);
        }, 42);

        const doneTimer = setTimeout(() => {
            onComplete?.();
        }, 3500);

        return () => {
            clearInterval(typeTimer);
            clearTimeout(doneTimer);
        };
    }, [fullMessage, results, onComplete]);

    return (
        <div className={styles.overlay}>
            <div className={styles.starsLayer} />
            {results?.ejectedId && (
                <div className={styles.ejectTrack}>
                    <div className={styles.ejectSpinner}>
                        <CrewmateAvatar color={results.ejectedColor} size={86} />
                    </div>
                </div>
            )}
            <p className={styles.caption}>
                {typedText}
                <span className={styles.cursor}>|</span>
            </p>
        </div>
    );
}
