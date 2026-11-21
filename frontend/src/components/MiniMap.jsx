import styles from './MiniMap.module.css';

export default function MiniMap({
    playerPos = { x: 560, y: 118 },
    playerColor = '#c51111',
    roomName = 'Cafeteria',
    tasks = [],
    isImposter = false,
    onClose,
}) {
    // skled.png is 1000 x 560
    const leftPct = Math.max(0, Math.min(100, (playerPos.x / 1000) * 100));
    const topPct = Math.max(0, Math.min(100, (playerPos.y / 560) * 100));

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <span>
                        The Skeld Map — <strong>{roomName}</strong>
                    </span>
                    <button type="button" className={styles.closeBtn} onClick={onClose}>
                        [M] Close ✕
                    </button>
                </div>

                <div className={styles.mapFrame}>
                    <img src="/assets/map/skled.png" alt="Skeld Map" className={styles.mapImg} />

                    {!isImposter &&
                        tasks
                            .filter((t) => !t.completed)
                            .map((t) => (
                                <div
                                    key={t.id}
                                    className={styles.taskPin}
                                    style={{
                                        left: `${(t.x / 1000) * 100}%`,
                                        top: `${(t.y / 560) * 100}%`,
                                    }}
                                    title={`${t.title} (${t.room})`}
                                >
                                    !
                                </div>
                            ))}

                    <div
                        className={styles.playerDot}
                        style={{
                            left: `${leftPct}%`,
                            top: `${topPct}%`,
                            backgroundColor: playerColor,
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
