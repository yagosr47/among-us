import { useState, useRef, useEffect } from 'react';
import styles from './Meeting.module.css';
import MeetingTile from './MeetingTile.jsx';
import CrewmateAvatar from './CrewmateAvatar.jsx';
import { soundFX } from '../utils/sound.js';

export default function Meeting({
    players = {},
    callerId,
    currentPlayerId,
    onVote,
    timeRemaining,
    results = null,
    messages = [],
    onSendMessage,
}) {
    const [selectedTarget, setSelectedTarget] = useState(null); // playerId | 'skip' | null
    const [hasVoted, setHasVoted] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [chatText, setChatText] = useState('');
    const chatBottomRef = useRef(null);
    const prevMsgCount = useRef(messages.length);

    const playerList = Object.values(players || {}).sort((a, b) => {
        if ((a.isAlive !== false) === (b.isAlive !== false)) return 0;
        return a.isAlive !== false ? -1 : 1;
    });

    const localPlayer = players?.[currentPlayerId];
    const isLocalAlive = localPlayer?.isAlive !== false;
    const canVote = isLocalAlive && !hasVoted && !results;

    useEffect(() => {
        if (messages.length > prevMsgCount.current) {
            if (!chatOpen) {
                setUnreadCount((c) => c + (messages.length - prevMsgCount.current));
            }
            soundFX.playChat();
        }
        prevMsgCount.current = messages.length;
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, chatOpen]);

    const handleConfirmVote = (targetId) => {
        if (!canVote) return;
        soundFX.playVote();
        setHasVoted(true);
        setSelectedTarget(null);
        onVote({ votedForId: targetId });
    };

    const handleSendChat = (e) => {
        e.preventDefault();
        const trimmed = chatText.trim();
        if (!trimmed) return;
        onSendMessage?.(trimmed);
        setChatText('');
    };

    // Map votes per candidate once results are revealed
    const isAnon = Boolean(results?.anonymousVotes);
    const votersByTarget = {};
    if (results?.votes && !isAnon) {
        Object.entries(results.votes).forEach(([voterId, votedForId]) => {
            const voter = players?.[voterId];
            if (!voter) return;
            if (!votersByTarget[votedForId]) votersByTarget[votedForId] = [];
            votersByTarget[votedForId].push(voter);
        });
    }
    const countsByTarget = results?.counts || {};

    const secondsLeft = Math.max(0, Math.ceil(timeRemaining / 1000));
    const skipVoters = votersByTarget['skip'] || [];
    const skipAnonCount = isAnon ? countsByTarget['skip'] || 0 : 0;

    return (
        <div className={styles.meetingOverlay}>
            <div className={styles.tablet}>
                <div className={styles.headerRow}>
                    <h1 className={styles.title}>
                        {results ? 'Voting Results' : 'Who Is The Impostor?'}
                    </h1>
                    <button
                        type="button"
                        className={styles.chatToggleBtn}
                        onClick={() => {
                            setChatOpen((o) => !o);
                            setUnreadCount(0);
                        }}
                    >
                        <img src="/assets/meeting/chat.png" alt="Chat" className={styles.chatIcon} />
                        <span>Chat</span>
                        {unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount}</span>}
                    </button>
                </div>

                <div className={styles.bodySplit}>
                    <div className={styles.gridColumn}>
                        <div className={styles.playerGrid}>
                            {playerList.map((player) => (
                                <MeetingTile
                                    key={player.id}
                                    player={player}
                                    isCaller={player.id === callerId}
                                    isLocalPlayer={player.id === currentPlayerId}
                                    canVote={canVote}
                                    isSelected={selectedTarget === player.id}
                                    voters={votersByTarget[player.id] || []}
                                    anonymousCount={isAnon ? countsByTarget[player.id] || 0 : 0}
                                    onSelect={(id) =>
                                        setSelectedTarget((prev) => (prev === id ? null : id))
                                    }
                                    onConfirm={handleConfirmVote}
                                    onCancel={() => setSelectedTarget(null)}
                                />
                            ))}
                        </div>

                        <div className={styles.footerRow}>
                            <div className={styles.skipArea}>
                                {canVote ? (
                                    selectedTarget === 'skip' ? (
                                        <div className={styles.skipConfirmGroup}>
                                            <button
                                                type="button"
                                                className={styles.confirmSkipBtn}
                                                onClick={() => handleConfirmVote('skip')}
                                            >
                                                Confirm Skip
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.cancelSkipBtn}
                                                onClick={() => setSelectedTarget(null)}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            className={styles.skipBtn}
                                            onClick={() => setSelectedTarget('skip')}
                                        >
                                            Skip Vote
                                        </button>
                                    )
                                ) : (
                                    <span className={styles.statusNotice}>
                                        {!isLocalAlive
                                            ? 'Ghost Mode — Observing vote'
                                            : results
                                              ? 'Tallying votes...'
                                              : 'Vote Locked In'}
                                    </span>
                                )}

                                {(skipVoters.length > 0 || skipAnonCount > 0) && (
                                    <div className={styles.skipVoters}>
                                        <span className={styles.skipLabel}>Skipped:</span>
                                        {skipVoters.length > 0
                                            ? skipVoters.map((v) => (
                                                  <CrewmateAvatar key={v.id} color={v.color} size={18} />
                                              ))
                                            : Array.from({ length: skipAnonCount }).map((_, i) => (
                                                  <CrewmateAvatar key={i} color="#94a3b8" size={18} />
                                              ))}
                                    </div>
                                )}
                            </div>

                            <div className={styles.timerBox}>
                                {!results ? (
                                    <span className={secondsLeft <= 10 ? styles.urgentTimer : ''}>
                                        Proceeding in: {secondsLeft}s
                                    </span>
                                ) : (
                                    <span>Revealing result...</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {chatOpen && (
                        <div className={styles.chatDrawer}>
                            <div className={styles.chatHeader}>
                                <span>{isLocalAlive ? 'Discussion Chat' : '👻 Ghost Chat'}</span>
                            </div>
                            <div className={styles.chatMessages}>
                                {messages.length === 0 ? (
                                    <p className={styles.emptyChat}>No messages yet...</p>
                                ) : (
                                    messages.map((m) => (
                                        <div
                                            key={m.id}
                                            className={`${styles.chatMsg} ${m.isGhost ? styles.ghostMsg : ''}`}
                                        >
                                            <CrewmateAvatar color={m.color} size={22} ghost={m.isGhost} />
                                            <div className={styles.chatBubble}>
                                                <span className={styles.chatAuthor}>
                                                    {m.playerName} {m.isGhost ? '(Ghost)' : ''}
                                                </span>
                                                <p className={styles.chatBody}>{m.message}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                                <div ref={chatBottomRef} />
                            </div>
                            <form className={styles.chatForm} onSubmit={handleSendChat}>
                                <input
                                    type="text"
                                    value={chatText}
                                    onChange={(e) => setChatText(e.target.value)}
                                    placeholder="Say something..."
                                    maxLength={200}
                                    className={styles.chatInput}
                                />
                                <button type="submit" className={styles.chatSendBtn}>
                                    Send
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
