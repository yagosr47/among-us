import CrewmateAvatar from './CrewmateAvatar.jsx';
import styles from './meetingTile.module.css';

const ivotedIcon = '/assets/meeting/ivoted.png';
const cancelIcon = '/assets/meeting/cancel.png';
const confirmIcon = '/assets/meeting/confirm.png';

export default function MeetingTile({
    player,
    isCaller,
    isLocalPlayer,
    canVote,
    isSelected,
    voters = [],
    onSelect,
    onConfirm,
    onCancel,
}) {
    const isAlive = player.isAlive !== false;

    return (
        <div
            className={`${styles.tile} ${!isAlive ? styles.deadTile : ''} ${
                isSelected ? styles.selectedTile : ''
            } ${canVote && isAlive ? styles.clickable : ''}`}
            onClick={() => {
                if (canVote && isAlive) onSelect(player.id);
            }}
        >
            <div className={styles.leftRow}>
                <div className={styles.playerIcon}>
                    <CrewmateAvatar color={player.color} size={34} dead={!isAlive} />
                    {player.voted && isAlive && (
                        <img src={ivotedIcon} alt="Voted" className={styles.ivoted} />
                    )}
                </div>

                <div className={styles.textContainer}>
                    <div className={styles.nameRow}>
                        <span className={styles.name}>{player.name}</span>
                        {isLocalPlayer && <span className={styles.youTag}>(You)</span>}
                        {isCaller && <span className={styles.callerTag}>📣</span>}
                    </div>

                    {voters.length > 0 && (
                        <div className={styles.votesContainer}>
                            {voters.map((voter) => (
                                <span
                                    key={voter.id}
                                    className={styles.votePip}
                                    title={voter.name}
                                >
                                    <CrewmateAvatar color={voter.color} size={18} />
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {isSelected && canVote && isAlive && (
                <div
                    className={styles.actionIcons}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => onConfirm(player.id)}
                        title="Confirm vote"
                    >
                        <img src={confirmIcon} alt="Confirm" />
                    </button>
                    <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={onCancel}
                        title="Cancel"
                    >
                        <img src={cancelIcon} alt="Cancel" />
                    </button>
                </div>
            )}
        </div>
    );
}
