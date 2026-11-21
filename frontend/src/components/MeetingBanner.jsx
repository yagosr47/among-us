import styles from './MeetingBanner.module.css';

export default function MeetingBanner({ type = 'emergency', callerName = 'Someone', bodyName = null }) {
    const isBody = type === 'body';
    return (
        <div className={`${styles.overlay} ${isBody ? styles.bodyTheme : styles.emergencyTheme}`}>
            <div className={styles.bannerCard}>
                <img
                    src={isBody ? '/assets/meeting/bodyReported.png' : '/assets/meeting/meetingCalled.png'}
                    alt={isBody ? 'Dead Body Reported' : 'Emergency Meeting'}
                    className={styles.bannerImg}
                />
                <p className={styles.subtitle}>
                    {isBody
                        ? `${callerName} reported ${bodyName ? `${bodyName}'s body` : 'a dead body'}!`
                        : `${callerName} called an Emergency Meeting!`}
                </p>
            </div>
        </div>
    );
}
