import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import styles from './TaskModal.module.css';
import CrewmateAvatar from './CrewmateAvatar.jsx';
import { soundFX } from '../utils/sound.js';

function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function SwipeCardGame({ playerColor, onSuccess }) {
    const [progress, setProgress] = useState(0);
    const [startTime, setStartTime] = useState(null);
    const [status, setStatus] = useState('Slide card steadily from left to right');

    const handleChange = (e) => {
        const val = Number(e.target.value);
        if (val > 5 && startTime === null) {
            setStartTime(performance.now());
            setStatus('Swiping...');
        }
        setProgress(val);
        if (val >= 98) {
            const elapsed = performance.now() - (startTime || performance.now());
            if (elapsed < 180) {
                setStatus('Too fast! Try a steadier swipe.');
                setProgress(0);
                setStartTime(null);
            } else if (elapsed > 2600) {
                setStatus('Too slow! Try again.');
                setProgress(0);
                setStartTime(null);
            } else {
                setStatus('ACCEPTED!');
                setTimeout(onSuccess, 350);
            }
        }
    };

    const handlePointerUp = () => {
        if (progress < 98) {
            setProgress(0);
            setStartTime(null);
            setStatus('Bad read. Swipe all the way across.');
        }
    };

    return (
        <div className={styles.gameBox}>
            <div className={styles.cardReaderTop}>
                <span className={styles.ledGreen} />
                <span className={styles.readerText}>{status}</span>
            </div>
            <div className={styles.swipeTrack}>
                <div
                    className={styles.idCard}
                    style={{ left: `calc(${progress}% * 0.68)` }}
                >
                    <CrewmateAvatar color={playerColor} size={34} />
                    <div>
                        <div className={styles.cardTitle}>MIRA HQ ID</div>
                        <div className={styles.cardSub}>CREW CLEARANCE</div>
                    </div>
                </div>
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={progress}
                    onChange={handleChange}
                    onMouseUp={handlePointerUp}
                    onTouchEnd={handlePointerUp}
                    className={styles.swipeSlider}
                />
            </div>
        </div>
    );
}

function MedbayScanGame({ playerColor, onSuccess }) {
    const [scanning, setScanning] = useState(false);
    const [pct, setPct] = useState(0);
    const onSuccessRef = useRef(onSuccess);

    useEffect(() => {
        onSuccessRef.current = onSuccess;
    }, [onSuccess]);

    useEffect(() => {
        if (!scanning) return;
        const iv = setInterval(() => {
            setPct((prev) => {
                if (prev >= 100) {
                    clearInterval(iv);
                    setTimeout(() => onSuccessRef.current?.(), 300);
                    return 100;
                }
                return prev + 4;
            });
        }, 100);
        return () => clearInterval(iv);
    }, [scanning]);

    return (
        <div className={styles.gameBox}>
            <div className={styles.scanChamber}>
                <CrewmateAvatar color={playerColor} size={82} />
                {scanning && <div className={styles.laserBeam} />}
            </div>
            <div className={styles.scanBar}>
                <div className={styles.scanFill} style={{ width: `${pct}%` }} />
            </div>
            <p className={styles.scanStatus}>
                {pct >= 100
                    ? 'SCAN COMPLETE — BIOMETRICS VERIFIED'
                    : scanning
                      ? `SCANNING... ${pct}%`
                      : 'Step onto scanner pad to verify'}
            </p>
            {!scanning && (
                <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => {
                        soundFX.playClick();
                        setScanning(true);
                    }}
                >
                    Begin Bio-Scan
                </button>
            )}
        </div>
    );
}

const WIRE_COLORS = [
    { id: 'red', hex: '#ef4444' },
    { id: 'blue', hex: '#3b82f6' },
    { id: 'yellow', hex: '#eab308' },
    { id: 'pink', hex: '#ec4899' },
];

function FixWiringGame({ onSuccess }) {
    const leftWires = useMemo(() => shuffle(WIRE_COLORS), []);
    const rightWires = useMemo(() => shuffle(WIRE_COLORS), []);
    const [selectedLeft, setSelectedLeft] = useState(null);
    const [connected, setConnected] = useState([]);

    const handleRightClick = (colorId) => {
        if (!selectedLeft) return;
        if (selectedLeft === colorId && !connected.includes(colorId)) {
            soundFX.playClick();
            const next = [...connected, colorId];
            setConnected(next);
            setSelectedLeft(null);
            if (next.length === WIRE_COLORS.length) {
                setTimeout(onSuccess, 320);
            }
        } else {
            setSelectedLeft(null);
        }
    };

    return (
        <div className={styles.gameBox}>
            <p className={styles.helperText}>Select a wire on the left, then click its matching color on the right.</p>
            <div className={styles.wiringBoard}>
                <svg className={styles.wireSvg} viewBox="0 0 300 180" preserveAspectRatio="none">
                    {connected.map((cid) => {
                        const li = leftWires.findIndex((w) => w.id === cid);
                        const ri = rightWires.findIndex((w) => w.id === cid);
                        const y1 = 24 + li * 44;
                        const y2 = 24 + ri * 44;
                        const hex = WIRE_COLORS.find((w) => w.id === cid)?.hex;
                        return (
                            <line
                                key={cid}
                                x1="25"
                                y1={y1}
                                x2="275"
                                y2={y2}
                                stroke={hex}
                                strokeWidth="8"
                                strokeLinecap="round"
                            />
                        );
                    })}
                </svg>
                <div className={styles.wireCol}>
                    {leftWires.map((w) => {
                        const done = connected.includes(w.id);
                        return (
                            <button
                                key={w.id}
                                type="button"
                                disabled={done}
                                onClick={() => {
                                    soundFX.playClick();
                                    setSelectedLeft(w.id);
                                }}
                                className={`${styles.wireNode} ${selectedLeft === w.id ? styles.wireSelected : ''}`}
                                style={{ background: w.hex, opacity: done ? 0.6 : 1 }}
                            />
                        );
                    })}
                </div>
                <div className={styles.wireCol}>
                    {rightWires.map((w) => {
                        const done = connected.includes(w.id);
                        return (
                            <button
                                key={w.id}
                                type="button"
                                disabled={done}
                                onClick={() => handleRightClick(w.id)}
                                className={styles.wireNode}
                                style={{ background: w.hex, opacity: done ? 0.6 : 1 }}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function AsteroidsGame({ onSuccess }) {
    const [destroyed, setDestroyed] = useState(0);
    const [rocks, setRocks] = useState(() =>
        Array.from({ length: 6 }, (_, i) => ({
            id: i,
            x: 15 + ((i * 19) % 72),
            y: 15 + ((i * 29) % 68),
            size: 28 + (i % 3) * 8,
            hit: false,
        }))
    );

    const handleShoot = (id) => {
        soundFX.playClick();
        setRocks((prev) => prev.map((r) => (r.id === id ? { ...r, hit: true } : r)));
        const nextCount = destroyed + 1;
        setDestroyed(nextCount);
        if (nextCount >= 6) {
            setTimeout(onSuccess, 300);
        }
    };

    return (
        <div className={styles.gameBox}>
            <p className={styles.helperText}>Destroyed: {destroyed} / 6</p>
            <div className={styles.radarScreen}>
                {rocks.map(
                    (r) =>
                        !r.hit && (
                            <button
                                key={r.id}
                                type="button"
                                onClick={() => handleShoot(r.id)}
                                className={styles.asteroidBtn}
                                style={{
                                    left: `${r.x}%`,
                                    top: `${r.y}%`,
                                    width: r.size,
                                    height: r.size,
                                }}
                            >
                                ☄️
                            </button>
                        )
                )}
            </div>
        </div>
    );
}

function ManifoldsGame({ onSuccess }) {
    const numbers = useMemo(() => shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), []);
    const [nextNum, setNextNum] = useState(1);
    const [errorFlash, setErrorFlash] = useState(false);

    const handleTap = (n) => {
        if (n === nextNum) {
            soundFX.playClick();
            if (n === 10) {
                setNextNum(11);
                setTimeout(onSuccess, 280);
            } else {
                setNextNum(n + 1);
            }
        } else {
            setErrorFlash(true);
            setNextNum(1);
            setTimeout(() => setErrorFlash(false), 300);
        }
    };

    return (
        <div className={styles.gameBox}>
            <p className={styles.helperText}>Press numbers 1 to 10 in order (Next: {Math.min(nextNum, 10)})</p>
            <div className={`${styles.manifoldGrid} ${errorFlash ? styles.manifoldErr : ''}`}>
                {numbers.map((n) => {
                    const done = n < nextNum;
                    return (
                        <button
                            key={n}
                            type="button"
                            disabled={done}
                            onClick={() => handleTap(n)}
                            className={`${styles.manifoldBtn} ${done ? styles.manifoldDone : ''}`}
                        >
                            {n}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function ShieldsGame({ onSuccess }) {
    const [hexes, setHexes] = useState([false, true, false, false, true, false, false]);

    const toggleHex = (idx) => {
        soundFX.playClick();
        const next = hexes.map((v, i) => (i === idx ? true : v));
        setHexes(next);
        if (next.every(Boolean)) {
            setTimeout(onSuccess, 280);
        }
    };

    return (
        <div className={styles.gameBox}>
            <p className={styles.helperText}>Tap all red panels to prime ship shields</p>
            <div className={styles.shieldsGrid}>
                {hexes.map((active, i) => (
                    <button
                        key={i}
                        type="button"
                        onClick={() => toggleHex(i)}
                        className={`${styles.shieldHex} ${active ? styles.shieldActive : ''}`}
                    >
                        {active ? 'ON' : 'OFF'}
                    </button>
                ))}
            </div>
        </div>
    );
}

function GarbageGame({ onSuccess }) {
    const [pull, setPull] = useState(0);
    const handleChange = (e) => {
        const val = Number(e.target.value);
        setPull(val);
        if (val >= 95) {
            soundFX.playClick();
            setTimeout(onSuccess, 300);
        }
    };
    return (
        <div className={styles.gameBox}>
            <p className={styles.helperText}>Pull lever all the way right to eject garbage</p>
            <div className={styles.chuteBox}>
                <span style={{ opacity: Math.max(0.1, 1 - pull / 100), fontSize: '2rem' }}>
                    🥫 🍌 📦 🧻
                </span>
            </div>
            <input
                type="range"
                min="0"
                max="100"
                value={pull}
                onChange={handleChange}
                className={styles.leverRange}
            />
        </div>
    );
}

function ChartCourseGame({ onSuccess }) {
    const [step, setStep] = useState(0);
    const points = [
        { x: 14, y: 70 },
        { x: 38, y: 32 },
        { x: 64, y: 62 },
        { x: 86, y: 24 },
    ];

    const handlePointClick = (idx) => {
        if (idx !== step) return;
        soundFX.playClick();
        const next = step + 1;
        setStep(next);
        if (next >= points.length) {
            setTimeout(onSuccess, 300);
        }
    };

    return (
        <div className={styles.gameBox}>
            <p className={styles.helperText}>Click waypoints in order (1 → 4)</p>
            <div className={styles.chartSpace}>
                {points.map((pt, idx) => (
                    <button
                        key={idx}
                        type="button"
                        onClick={() => handlePointClick(idx)}
                        className={`${styles.waypointBtn} ${idx < step ? styles.waypointDone : ''} ${
                            idx === step ? styles.waypointNext : ''
                        }`}
                        style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                    >
                        {idx + 1}
                    </button>
                ))}
            </div>
        </div>
    );
}

export default function TaskModal({ task, playerColor, onComplete, onClose }) {
    const taskId = task?.id;
    const handleSuccess = useCallback(() => {
        if (taskId) onComplete?.(taskId);
    }, [onComplete, taskId]);

    if (!task) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.title}>{task.title}</h2>
                        <span className={styles.roomBadge}>{task.room}</span>
                    </div>
                    <button type="button" className={styles.closeBtn} onClick={onClose}>
                        ✕
                    </button>
                </div>

                {task.type === 'swipeCard' && (
                    <SwipeCardGame playerColor={playerColor} onSuccess={handleSuccess} />
                )}
                {task.type === 'medbayScan' && (
                    <MedbayScanGame playerColor={playerColor} onSuccess={handleSuccess} />
                )}
                {task.type === 'fixWiring' && <FixWiringGame onSuccess={handleSuccess} />}
                {task.type === 'asteroids' && <AsteroidsGame onSuccess={handleSuccess} />}
                {task.type === 'manifolds' && <ManifoldsGame onSuccess={handleSuccess} />}
                {task.type === 'shields' && <ShieldsGame onSuccess={handleSuccess} />}
                {task.type === 'garbage' && <GarbageGame onSuccess={handleSuccess} />}
                {task.type === 'chartCourse' && <ChartCourseGame onSuccess={handleSuccess} />}
            </div>
        </div>
    );
}
