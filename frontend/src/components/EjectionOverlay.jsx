import { useEffect, useRef, useState } from 'react';
import styles from './EjectionOverlay.module.css';
import CrewmateAvatar from './CrewmateAvatar.jsx';
import { soundFX } from '../utils/sound.js';

export default function EjectionOverlay({ results, onComplete }) {
    const [typedText, setTypedText] = useState('');
    const onCompleteRef = useRef(onComplete);
    const playedEjectRef = useRef(false);

    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    let fullMessage = 'No one was ejected. (Skipped)';
    if (results?.ejectedId) {
        if (results.confirmEjects === false) {
            fullMessage = `${results.ejectedName} was ejected.`;
        } else {
            const roleWord = results.wasImposter ? 'An Impostor' : 'not An Impostor';
            const rem = results.remainingImpostors;
            const remNote =
                typeof rem === 'number' && rem >= 0
                    ? ` (${rem} Impostor${rem === 1 ? '' : 's'} remain${rem === 1 ? 's' : ''})`
                    : '';
            fullMessage = `${results.ejectedName} was ${roleWord}.${remNote}`;
        }
    } else if (results?.tie) {
        fullMessage = 'No one was ejected. (Tie)';
    }

    const hasEjected = Boolean(results?.ejectedId);

    useEffect(() => {
        if (hasEjected && !playedEjectRef.current) {
            playedEjectRef.current = true;
            soundFX.playEject();
        }
        let idx = 0;
        const typeTimer = setInterval(() => {
            idx++;
            setTypedText(fullMessage.slice(0, idx));
            if (idx >= fullMessage.length) clearInterval(typeTimer);
        }, 38);

        const doneTimer = setTimeout(() => {
            onCompleteRef.current?.();
        }, 3500);

        return () => {
            clearInterval(typeTimer);
            clearTimeout(doneTimer);
        };
    }, [fullMessage, hasEjected]);

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
