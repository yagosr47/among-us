import { useState, useEffect, useRef, useCallback } from 'react';
import { PhaserGame } from './PhaserGame.jsx';
import socketService from './services/socket.js';
import Menu from './pages/Menu.jsx';
import styles from './App.module.css';
import Button from './components/Button.jsx';
import Meeting from './components/Meeting.jsx';
import MeetingBanner from './components/MeetingBanner.jsx';
import EjectionOverlay from './components/EjectionOverlay.jsx';
import RoleReveal from './components/RoleReveal.jsx';
import TaskModal from './components/TaskModal.jsx';
import MiniMap from './components/MiniMap.jsx';
import LaptopModal from './components/LaptopModal.jsx';
import EndGame from './components/EndGame.jsx';
import { EventBus } from './game/EventBus.js';
import { ToastContainer } from './components/Toast.jsx';
import { DEFAULT_ROOM_SETTINGS } from './game/skeldData.js';
import { soundFX } from './utils/sound.js';

const PAGES = { MENU: 'menu', WAITING: 'waiting', GAME: 'game', GAMEEND: 'gameend' };

function App() {
    const [currentPage, setCurrentPage] = useState(PAGES.MENU);
    const [roomId, setRoomId] = useState(null);
    const [roomMeta, setRoomMeta] = useState({
        isPublic: true,
        isOffline: false,
        region: 'SA',
        hostName: 'Host',
    });
    const [roomPlayers, setRoomPlayers] = useState({});
    const [roomSettings, setRoomSettings] = useState(DEFAULT_ROOM_SETTINGS);
    const [isLocalPlayerHost, setIsLocalPlayerHost] = useState(false);
    const [isLocalPlayerImposter, setIsLocalPlayerImposter] = useState(false);
    const [roleMeta, setRoleMeta] = useState({ impostorCount: 1, fellowImposters: [] });

    const [laptopOpen, setLaptopOpen] = useState(false);
    const [laptopTab, setLaptopTab] = useState('settings');
    const [customError, setCustomError] = useState('');

    const [showRoleReveal, setShowRoleReveal] = useState(false);
    const [meetingBanner, setMeetingBanner] = useState(null);
    const [meetingActive, setMeetingActive] = useState(false);
    const [meetingData, setMeetingData] = useState(null);
    const [meetingResults, setMeetingResults] = useState(null);
    const [ejectionResults, setEjectionResults] = useState(null);
    const [timeRemaining, setTimeRemaining] = useState(45000);
    const [chatMessages, setChatMessages] = useState([]);

    const [activeTask, setActiveTask] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [taskSummary, setTaskSummary] = useState({ completed: 0, total: 0, ratio: 0 });
    const [hudInfo, setHudInfo] = useState({
        roomName: 'Cafeteria',
        x: 560,
        y: 118,
        alive: true,
    });
    const [miniMapOpen, setMiniMapOpen] = useState(false);
    const [muted, setMuted] = useState(soundFX.isMuted());
    const [gameResult, setGameResult] = useState(null);

    const roomIdRef = useRef(null);
    const playerIdRef = useRef(null);
    const roleDataRef = useRef(null);
    const socket = socketService.getSocket();

    useEffect(() => {
        socketService.connect();

        const handleUnload = () => {
            const pid = sessionStorage.getItem('playerId');
            if (pid && socket.connected) {
                socket.emit('player:disconnect', { playerId: pid });
            }
        };
        window.addEventListener('beforeunload', handleUnload);

        return () => {
            window.removeEventListener('beforeunload', handleUnload);
        };
    }, [socket]);

    useEffect(() => {
        const handleStartGame = (data) => {
            if (data.roomId !== roomIdRef.current) return;

            setLaptopOpen(false);
            EventBus.emit('laptop:modal-state', false);
            setRoomPlayers(data.room?.players || {});
            if (data.settings) setRoomSettings(data.settings);
            setTaskSummary(data.room?.taskSummary || { completed: 0, total: 0, ratio: 0 });
            setChatMessages([]);
            setMeetingActive(false);
            setMeetingBanner(null);
            setEjectionResults(null);
            setActiveTask(null);
            setMiniMapOpen(false);
            setCurrentPage(PAGES.GAME);

            const roleInfo = roleDataRef.current;
            EventBus.emit('start-game', {
                roomId: data.roomId,
                room: data.room,
                initialCooldownMs: data.initialCooldownMs,
                ...(roleInfo
                    ? {
                          isImposter: roleInfo.isImposter,
                          tasks: roleInfo.tasks,
                          fellowImposters: roleInfo.fellowImposters,
                      }
                    : {}),
            });
        };

        const handleRoleAssigned = (data) => {
            if (data.roomId !== roomIdRef.current) return;
            roleDataRef.current = data;
            setIsLocalPlayerImposter(Boolean(data.isImposter));
            setRoleMeta({
                impostorCount: data.impostorCount || 1,
                fellowImposters: data.fellowImposters || [],
            });
            setTasks(data.tasks || []);
            setShowRoleReveal(true);
            EventBus.emit('role:assigned', data);
        };

        const onGameReadyForRole = () => {
            if (roleDataRef.current && roleDataRef.current.roomId === roomIdRef.current) {
                EventBus.emit('role:assigned', roleDataRef.current);
            }
        };

        const handlePlayerJoined = (data) => {
            if (data?.roomId !== roomIdRef.current || !data?.player) return;
            setRoomPlayers((prev) => ({
                ...prev,
                [data.player.id]: data.player,
            }));
        };

        const handlePlayerLeft = (data) => {
            if (data?.playerId) {
                setRoomPlayers((prev) => {
                    const next = { ...prev };
                    delete next[data.playerId];
                    return next;
                });
            }
            if (data?.newHostId && data.newHostId === playerIdRef.current) {
                setIsLocalPlayerHost(true);
                window.showToast?.('You are now the room host', 'info', 2500);
            }
        };

        const handleSettingsUpdated = (data) => {
            if (data?.roomId && data.roomId !== roomIdRef.current) return;
            if (data?.settings) setRoomSettings(data.settings);
            if (data?.room?.players) setRoomPlayers(data.room.players);
        };

        const handleMetaUpdated = (data) => {
            if (data?.roomId !== roomIdRef.current || !data?.room) return;
            setRoomMeta((prev) => ({
                ...prev,
                isPublic: data.room.isPublic !== false,
                region: data.room.region || prev.region,
            }));
        };

        const handlePlayerCustomized = (data) => {
            if (data?.roomId !== roomIdRef.current) return;
            setCustomError('');
            if (data?.room?.players) {
                setRoomPlayers(data.room.players);
            } else if (data?.player) {
                setRoomPlayers((prev) => ({ ...prev, [data.player.id]: data.player }));
            }
            if (data?.room?.host?.name) {
                setRoomMeta((prev) => ({ ...prev, hostName: data.room.host.name }));
            }
        };

        const handleCustomizeError = (data) => {
            setCustomError(data?.message || 'Could not update customization');
        };

        const handleTasksUpdated = (data) => {
            if (data?.taskSummary) {
                setTaskSummary(data.taskSummary);
            }
        };

        const handleVote = (data) => {
            setMeetingData((prev) => {
                if (!prev?.players) return prev;
                const target = prev.players[data.callerId];
                if (!target) return prev;
                return {
                    ...prev,
                    players: {
                        ...prev.players,
                        [data.callerId]: { ...target, voted: true },
                    },
                };
            });
        };

        const handleChatMessage = (msg) => {
            setChatMessages((prev) => [...prev, msg]);
        };

        const handleNotif = (data) => {
            window.showToast?.(data.message, 'info', 3000);
        };

        const handleRoomRestarted = (data) => {
            setGameResult(null);
            setMeetingActive(false);
            setMeetingBanner(null);
            setEjectionResults(null);
            setActiveTask(null);
            setShowRoleReveal(false);
            setLaptopOpen(false);
            roleDataRef.current = null;
            if (data.room?.settings) setRoomSettings(data.room.settings);
            setRoomPlayers(data.room?.players || {});
            setCurrentPage(PAGES.WAITING);
        };

        // Phaser EventBus bridges
        const onMeetingStarted = (data) => {
            setActiveTask(null);
            setMiniMapOpen(false);
            setMeetingResults(null);
            setMeetingData(data);
            setMeetingBanner({
                type: data.type,
                callerName: data.callerName,
                bodyName: data.bodyName,
            });
            setTimeout(() => {
                setMeetingBanner(null);
                setMeetingActive(true);
            }, 1750);
        };

        const onMeetingEnded = (data) => {
            setMeetingResults(data.results || null);
            if (data.room?.players) {
                setRoomPlayers(data.room.players);
            }

            setTimeout(() => {
                setMeetingActive(false);
                setMeetingData(null);
                setMeetingResults(null);
                setEjectionResults(data.results || { skipped: true });
            }, 1700);
        };

        const onGameEnded = (data) => {
            setMeetingActive(false);
            setMeetingBanner(null);
            setEjectionResults(null);
            setActiveTask(null);
            setMiniMapOpen(false);
            setGameResult(data);
            setCurrentPage(PAGES.GAMEEND);
        };

        const onTaskOpen = (task) => {
            setActiveTask(task);
            EventBus.emit('task:modal-state', true);
        };

        const onLaptopOpen = (payload) => {
            setCustomError('');
            setLaptopTab(payload?.tab || 'settings');
            setLaptopOpen(true);
            EventBus.emit('laptop:modal-state', true);
        };

        const onHudUpdate = (info) => {
            setHudInfo((prev) => ({
                ...prev,
                roomName: info.roomName,
                x: info.x,
                y: info.y,
                alive: info.alive,
            }));
            if (Array.isArray(info.tasks)) {
                setTasks(info.tasks);
            }
        };

        const onToggleMap = () => {
            setMiniMapOpen((o) => !o);
        };

        socket.on('game:started', handleStartGame);
        socket.on('game:role', handleRoleAssigned);
        socket.on('player:joined', handlePlayerJoined);
        socket.on('player:left', handlePlayerLeft);
        socket.on('room:settings:updated', handleSettingsUpdated);
        socket.on('room:meta:updated', handleMetaUpdated);
        socket.on('player:customized', handlePlayerCustomized);
        socket.on('player:customize:error', handleCustomizeError);
        socket.on('tasks:updated', handleTasksUpdated);
        socket.on('meeting:voted', handleVote);
        socket.on('room:message', handleChatMessage);
        socket.on('game:notif', handleNotif);
        socket.on('room:restarted', handleRoomRestarted);

        EventBus.on('meeting:started', onMeetingStarted);
        EventBus.on('meeting:ended', onMeetingEnded);
        EventBus.on('game:ended', onGameEnded);
        EventBus.on('task:open', onTaskOpen);
        EventBus.on('laptop:open', onLaptopOpen);
        EventBus.on('game:hud-update', onHudUpdate);
        EventBus.on('minimap:toggle', onToggleMap);
        EventBus.on('game:ready-for-role', onGameReadyForRole);

        return () => {
            socket.off('game:started', handleStartGame);
            socket.off('game:role', handleRoleAssigned);
            socket.off('player:joined', handlePlayerJoined);
            socket.off('player:left', handlePlayerLeft);
            socket.off('room:settings:updated', handleSettingsUpdated);
            socket.off('room:meta:updated', handleMetaUpdated);
            socket.off('player:customized', handlePlayerCustomized);
            socket.off('player:customize:error', handleCustomizeError);
            socket.off('tasks:updated', handleTasksUpdated);
            socket.off('meeting:voted', handleVote);
            socket.off('room:message', handleChatMessage);
            socket.off('game:notif', handleNotif);
            socket.off('room:restarted', handleRoomRestarted);

            EventBus.off('meeting:started', onMeetingStarted);
            EventBus.off('meeting:ended', onMeetingEnded);
            EventBus.off('game:ended', onGameEnded);
            EventBus.off('task:open', onTaskOpen);
            EventBus.off('laptop:open', onLaptopOpen);
            EventBus.off('game:hud-update', onHudUpdate);
            EventBus.off('minimap:toggle', onToggleMap);
            EventBus.off('game:ready-for-role', onGameReadyForRole);
        };
    }, [socket]);

    useEffect(() => {
        if (!meetingActive || !meetingData?.endTime) return;
        const tick = () => {
            setTimeRemaining(Math.max(0, meetingData.endTime - Date.now()));
        };
        tick();
        const interval = setInterval(tick, 500);
        return () => clearInterval(interval);
    }, [meetingActive, meetingData?.endTime]);

    const handleJoinRoom = useCallback((data) => {
        playerIdRef.current = data.playerId;
        roomIdRef.current = data.roomId;
        setRoomId(data.roomId);
        setRoomPlayers(data.room?.players || {});
        setRoomSettings(data.room?.settings || DEFAULT_ROOM_SETTINGS);
        setRoomMeta({
            isPublic: data.room?.isPublic !== false,
            isOffline: Boolean(data.isOffline || data.room?.isOffline),
            region: data.room?.region || 'SA',
            hostName: data.room?.host?.name || 'Host',
        });
        setIsLocalPlayerHost(Boolean(data.isHost));
        setLaptopOpen(false);
        setCurrentPage(PAGES.WAITING);
    }, []);

    const handleStartGameBtn = () => {
        soundFX.playClick();
        socket.emit('game:start', { roomId });
    };

    const handlePlayAgain = () => {
        soundFX.playClick();
        socket.emit('room:playAgain', { roomId });
    };

    const handleBackToMenu = () => {
        soundFX.playClick();
        const playerId = sessionStorage.getItem('playerId');
        if (socket && playerId) {
            socket.emit('room:leave', { playerId });
        }
        if (socketService.isOffline()) {
            socketService.stopOfflineGame();
        }
        roomIdRef.current = null;
        roleDataRef.current = null;
        setRoomId(null);
        setGameResult(null);
        setMeetingActive(false);
        setShowRoleReveal(false);
        setLaptopOpen(false);
        setCurrentPage(PAGES.MENU);
    };

    const handleUpdateSettings = (patch) => {
        socket.emit('room:update-settings', {
            roomId,
            settings: { ...roomSettings, ...patch },
        });
    };

    const handleResetSettings = () => {
        const resetPayload = roomMeta.isOffline
            ? DEFAULT_ROOM_SETTINGS
            : {
                  ...DEFAULT_ROOM_SETTINGS,
                  botCount: roomSettings.botCount,
                  botDifficulty: roomSettings.botDifficulty,
                  preferredRole: roomSettings.preferredRole,
              };
        socket.emit('room:update-settings', {
            roomId,
            settings: resetPayload,
        });
    };

    const handleCustomizePlayer = (patch) => {
        setCustomError('');
        socket.emit('player:customize', {
            roomId,
            ...patch,
        });
    };

    const handleToggleVisibility = () => {
        if (!isLocalPlayerHost || roomMeta.isOffline) return;
        soundFX.playClick();
        socket.emit('room:update-meta', {
            roomId,
            isPublic: !roomMeta.isPublic,
        });
    };

    const handleCloseLaptop = () => {
        setLaptopOpen(false);
        EventBus.emit('laptop:modal-state', false);
    };

    const handleVote = ({ votedForId }) => {
        socket.emit('meeting:vote', { roomId, votedForId });
    };

    const handleSendMessage = (message) => {
        socket.emit('room:send:message', { roomId, message });
    };

    const handleCompleteTask = (taskId) => {
        setActiveTask(null);
        EventBus.emit('task:modal-state', false);
        EventBus.emit('task:completed-local', { taskId });
    };

    const handleCloseTask = () => {
        setActiveTask(null);
        EventBus.emit('task:modal-state', false);
    };

    const handleCopyRoomCode = () => {
        if (!roomId || roomMeta.isOffline) return;
        navigator.clipboard?.writeText(roomId).catch(() => {});
        window.showToast?.(`Room code ${roomId} copied!`, 'success', 2000);
    };

    const localPlayer = roomPlayers?.[playerIdRef.current];
    const playerCount = Object.keys(roomPlayers || {}).length;
    const taskPct = Math.round((taskSummary.ratio || 0) * 100);

    return (
        <div id="app">
            <ToastContainer />

            {currentPage === PAGES.MENU && <Menu onJoinGame={handleJoinRoom} />}

            {currentPage === PAGES.GAMEEND && (
                <EndGame
                    result={gameResult}
                    isLocalPlayerImposter={isLocalPlayerImposter}
                    isHost={isLocalPlayerHost}
                    players={roomPlayers}
                    onPlayAgain={handlePlayAgain}
                    onBackToMenu={handleBackToMenu}
                />
            )}

            {(currentPage === PAGES.WAITING || currentPage === PAGES.GAME) && (
                <div className={styles.gameContainer}>
                    <PhaserGame />

                    {showRoleReveal && (
                        <RoleReveal
                            isImposter={isLocalPlayerImposter}
                            impostorCount={roleMeta.impostorCount}
                            fellowImposters={roleMeta.fellowImposters}
                            players={roomPlayers}
                            localPlayerId={playerIdRef.current}
                            onComplete={() => setShowRoleReveal(false)}
                        />
                    )}

                    {/* Top Bar HUD */}
                    <div className={styles.topLeftBar}>
                        <button type="button" className={styles.backButton} onClick={handleBackToMenu}>
                            Leave
                        </button>
                        <button
                            type="button"
                            className={styles.muteBtn}
                            onClick={() => setMuted(soundFX.toggleMute())}
                            title={muted ? 'Unmute SFX' : 'Mute SFX'}
                        >
                            {muted ? '🔇' : '🔊'}
                        </button>
                    </div>

                    <div
                        className={styles.roomTag}
                        onClick={handleCopyRoomCode}
                        title={roomMeta.isOffline ? 'Offline Bot Match' : 'Click to copy room code'}
                    >
                        {roomMeta.isOffline ? (
                            <span>🤖 OFFLINE VS BOTS • {playerCount}/10</span>
                        ) : currentPage === PAGES.GAME ? (
                            <span>
                                {hudInfo.roomName} • Room: {roomId}
                            </span>
                        ) : (
                            <span>
                                {roomMeta.isPublic ? '🔓 PUBLIC' : '🔒 PRIVATE'} • {roomId} • {playerCount}/10
                            </span>
                        )}
                    </div>

                    {currentPage === PAGES.WAITING && (
                        <>
                            {/* Live Among Us Style Lobby Settings Card */}
                            <div className={styles.lobbyRulesCard}>
                                <div className={styles.lobbyRulesTitle}>
                                    <span>⚙️ MATCH SETTINGS</span>
                                    <span className={styles.lobbyMapBadge}>The Skeld</span>
                                </div>
                                <div className={styles.lobbyRulesList}>
                                    <div>Impostors: <b>{roomSettings.impostorCount}</b></div>
                                    <div>Confirm Ejects: <b>{roomSettings.confirmEjects ? 'On' : 'Off'}</b></div>
                                    <div>Emergency Meetings: <b>{roomSettings.emergencyMeetings}</b></div>
                                    <div>Emergency Cooldown: <b>{roomSettings.emergencyCooldownSec}s</b></div>
                                    <div>Voting Time: <b>{roomSettings.meetingDurationSec}s</b></div>
                                    <div>Anonymous Votes: <b>{roomSettings.anonymousVotes ? 'On' : 'Off'}</b></div>
                                    <div>Player Speed: <b>{roomSettings.playerSpeed}x</b></div>
                                    <div>Crewmate Vision: <b>{roomSettings.crewVision}x</b></div>
                                    <div>Impostor Vision: <b>{roomSettings.impostorVision}x</b></div>
                                    <div>Kill Cooldown: <b>{roomSettings.killCooldownSec}s</b></div>
                                    <div>Kill Distance: <b>{String(roomSettings.killDistance).toUpperCase()}</b></div>
                                    <div>Tasks: <b>{roomSettings.tasksPerPlayer}</b></div>
                                    {roomMeta.isOffline && (
                                        <div className={styles.botRuleHighlight}>
                                            Bots: <b>{roomSettings.botCount} ({String(roomSettings.botDifficulty).toUpperCase()})</b>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className={styles.waitingFooter}>
                                <button
                                    type="button"
                                    className={styles.laptopShortcutBtn}
                                    onClick={() => {
                                        soundFX.playClick();
                                        setCustomError('');
                                        setLaptopTab(isLocalPlayerHost ? 'settings' : 'customize');
                                        setLaptopOpen(true);
                                        EventBus.emit('laptop:modal-state', true);
                                    }}
                                >
                                    💻 {isLocalPlayerHost ? 'Settings / Color' : 'Customize / Rules'}
                                </button>

                                {isLocalPlayerHost && !roomMeta.isOffline && (
                                    <button
                                        type="button"
                                        className={`${styles.visBtn} ${
                                            roomMeta.isPublic ? styles.visPublic : styles.visPrivate
                                        }`}
                                        onClick={handleToggleVisibility}
                                    >
                                        {roomMeta.isPublic ? '🔓 PUBLIC' : '🔒 PRIVATE'}
                                    </button>
                                )}

                                {isLocalPlayerHost ? (
                                    <Button
                                        onClick={handleStartGameBtn}
                                        className={styles.startBtn}
                                    >
                                        Start Game
                                    </Button>
                                ) : (
                                    <div className={styles.waitingPill}>Waiting for host to start...</div>
                                )}
                            </div>
                        </>
                    )}

                    {currentPage === PAGES.GAME && (
                        <>
                            <button
                                type="button"
                                className={styles.mapToggleBtn}
                                onClick={() => setMiniMapOpen((o) => !o)}
                            >
                                🗺️ Map [M]
                            </button>

                            <div className={styles.taskHud}>
                                <div className={styles.taskBarHeader}>
                                    <span>TOTAL TASKS</span>
                                    <span>{taskPct}%</span>
                                </div>
                                <div className={styles.taskBarTrack}>
                                    <div className={styles.taskBarFill} style={{ width: `${taskPct}%` }} />
                                </div>
                                <div className={styles.taskList}>
                                    <div className={styles.taskListTitle}>
                                        {isLocalPlayerImposter ? 'Fake Tasks (Impostor)' : 'Your Tasks'}
                                        {!hudInfo.alive && ' • 👻 Ghost'}
                                    </div>
                                    {tasks.map((t) => (
                                        <div
                                            key={t.id}
                                            className={`${styles.taskItem} ${
                                                t.completed ? styles.taskDone : ''
                                            }`}
                                        >
                                            <span>{t.completed ? '✅' : '⬜'}</span>
                                            <span>
                                                {t.room}: {t.title}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {laptopOpen && currentPage === PAGES.WAITING && (
                        <LaptopModal
                            initialTab={laptopTab}
                            isHost={isLocalPlayerHost}
                            isOffline={roomMeta.isOffline}
                            hostName={roomMeta.hostName}
                            player={localPlayer}
                            players={roomPlayers}
                            settings={roomSettings}
                            onUpdateSettings={handleUpdateSettings}
                            onResetSettings={handleResetSettings}
                            onCustomizePlayer={handleCustomizePlayer}
                            customError={customError}
                            onClose={handleCloseLaptop}
                        />
                    )}

                    {activeTask && (
                        <TaskModal
                            task={activeTask}
                            playerColor={localPlayer?.color || '#c51111'}
                            onComplete={handleCompleteTask}
                            onClose={handleCloseTask}
                        />
                    )}

                    {miniMapOpen && (
                        <MiniMap
                            playerPos={{ x: hudInfo.x, y: hudInfo.y }}
                            playerColor={localPlayer?.color || '#c51111'}
                            roomName={hudInfo.roomName}
                            tasks={tasks}
                            isImposter={isLocalPlayerImposter}
                            onClose={() => setMiniMapOpen(false)}
                        />
                    )}

                    {meetingBanner && (
                        <MeetingBanner
                            type={meetingBanner.type}
                            callerName={meetingBanner.callerName}
                            bodyName={meetingBanner.bodyName}
                        />
                    )}

                    {meetingActive && meetingData && (
                        <Meeting
                            players={meetingData.players}
                            callerId={meetingData.callerId}
                            currentPlayerId={playerIdRef.current}
                            onVote={handleVote}
                            timeRemaining={timeRemaining}
                            results={meetingResults}
                            messages={chatMessages}
                            onSendMessage={handleSendMessage}
                        />
                    )}

                    {ejectionResults && (
                        <EjectionOverlay
                            results={ejectionResults}
                            onComplete={() => setEjectionResults(null)}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

export default App;
