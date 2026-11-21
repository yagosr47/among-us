import { useState, useEffect, useRef, useCallback } from 'react';
import socketService from '../services/socket.js';
import styles from './room.module.css';
import { apiUrl } from '../utils/urls.js';
import { Button } from '../components/Button.jsx';
import CrewmateAvatar from '../components/CrewmateAvatar.jsx';
import { PLAYER_COLORS, getRandomColor, getColorMeta } from '../utils/colors.js';
import { DEFAULT_ROOM_SETTINGS, REGION_OPTIONS, SETTING_OPTIONS } from '../game/skeldData.js';
import { soundFX } from '../utils/sound.js';
import SettingsModal from '../components/SettingsModal.jsx';
import { loadHudPrefs, saveHudPrefs } from '../utils/hudPrefs.js';

const FLOATING_CREW = [
    { color: '#c51111', top: '10%', left: '6%', delay: '0s', size: 52 },
    { color: '#38fedc', top: '76%', left: '9%', delay: '1.4s', size: 46 },
    { color: '#f5f557', top: '16%', right: '7%', delay: '0.8s', size: 50 },
    { color: '#ed54ba', top: '74%', right: '8%', delay: '2.1s', size: 44 },
];

export function Menu({ onJoinGame }) {
    const [view, setView] = useState('home'); // 'home' | 'online' | 'offline' | 'howto'
    const [playerName, setPlayerName] = useState('');
    const [selectedColor, setSelectedColor] = useState(null);
    const [error, setError] = useState('');

    // Server browser state
    const [rooms, setRooms] = useState({});
    const [serverStatus, setServerStatus] = useState({ online: false, pingMs: null, checking: true });
    const [regionFilter, setRegionFilter] = useState('ALL');
    const [impostorFilter, setImpostorFilter] = useState('ANY');
    const [searchQuery, setSearchQuery] = useState('');
    const [showInGame, setShowInGame] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Host Room options
    const [hostRoomName, setHostRoomName] = useState('');
    const [hostRegion, setHostRegion] = useState('SA');
    const [hostIsPublic, setHostIsPublic] = useState(true);
    const [hostImpostors, setHostImpostors] = useState(1);
    const [joinCode, setJoinCode] = useState('');

    // Offline Bots config
    const [botCount, setBotCount] = useState(7);
    const [botDifficulty, setBotDifficulty] = useState('normal');
    const [preferredRole, setPreferredRole] = useState('random');
    const [offlineImpostors, setOfflineImpostors] = useState(1);

    // Settings & Audio UI state
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [muted, setMuted] = useState(() => soundFX.isMuted());
    const [hudPrefs, setHudPrefs] = useState(() => loadHudPrefs());

    const pendingActionRef = useRef(null);
    const socket = socketService.getSocket();

    const handleToggleMute = useCallback((forcedState) => {
        const next =
            typeof forcedState === 'boolean' ? soundFX.setMuted(forcedState) : soundFX.toggleMute();
        setMuted(next);
        return next;
    }, []);

    const handleUpdateHudPrefs = useCallback((nextPrefs) => {
        setHudPrefs(nextPrefs);
        saveHudPrefs(nextPrefs);
    }, []);

    useEffect(() => {
        const savedName = localStorage.getItem('playerName');
        const savedColor = localStorage.getItem('playerColor');
        if (savedName) setPlayerName(savedName);
        if (savedColor) setSelectedColor(savedColor);
    }, []);

    const refreshServerAndRooms = useCallback(async () => {
        setRefreshing(true);
        const start = performance.now();
        try {
            const [statusRes, roomsRes] = await Promise.all([
                fetch(apiUrl('/status')),
                fetch(apiUrl('/rooms')),
            ]);
            const pingMs = Math.max(1, Math.round(performance.now() - start));
            if (statusRes.ok) {
                setServerStatus({ online: true, pingMs, checking: false });
            } else {
                setServerStatus({ online: false, pingMs: null, checking: false });
            }
            if (roomsRes.ok) {
                setRooms(roomsToMap(await roomsRes.json()));
            }
        } catch {
            setServerStatus({ online: false, pingMs: null, checking: false });
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        refreshServerAndRooms();
        const interval = setInterval(() => {
            if (view === 'online' || view === 'home') {
                refreshServerAndRooms();
            }
        }, 8000);
        return () => clearInterval(interval);
    }, [view, refreshServerAndRooms]);

    useEffect(() => {
        const onRoomCreated = (data) => {
            if (data?.room) {
                setRooms((prev) => ({ ...prev, [data.roomId]: data.room }));
            }
        };

        const onRoomUpdated = (data) => {
            if (data?.room?.id) {
                setRooms((prev) => ({ ...prev, [data.room.id]: data.room }));
            }
        };

        const onRoomDeleted = (data) => {
            setRooms((prev) => {
                const updated = { ...prev };
                delete updated[data.roomId];
                return updated;
            });
        };

        const onRoomJoined = (data) => {
            const playerId = getPlayerId();
            soundFX.playClick();
            onJoinGame({
                roomId: data.roomId,
                playerId,
                player: data.player,
                room: data.room,
                isHost: data.room.host?.id === playerId,
                isOffline: Boolean(data.isOffline || data.room?.isOffline),
            });
        };

        const onPlayerRegistered = () => {
            const pending = pendingActionRef.current;
            if (pending) {
                pendingActionRef.current = null;
                pending();
            }
        };

        const handleCantJoin = (data) => {
            setError(data?.message || 'Cannot join room');
        };

        socket.on('room:created', onRoomCreated);
        socket.on('room:updated', onRoomUpdated);
        socket.on('room:deleted', onRoomDeleted);
        socket.on('room:joined', onRoomJoined);
        socket.on('player:registered', onPlayerRegistered);
        socket.on('room:join:error', handleCantJoin);

        return () => {
            socket.off('room:created', onRoomCreated);
            socket.off('room:updated', onRoomUpdated);
            socket.off('room:deleted', onRoomDeleted);
            socket.off('room:joined', onRoomJoined);
            socket.off('player:registered', onPlayerRegistered);
            socket.off('room:join:error', handleCantJoin);
        };
    }, [socket, onJoinGame]);

    const validateProfile = () => {
        const trimmed = playerName.trim();
        if (!trimmed) {
            setError('Please enter your crewmate name first.');
            return null;
        }
        const color = selectedColor || getRandomColor();
        localStorage.setItem('playerName', trimmed);
        if (selectedColor) localStorage.setItem('playerColor', selectedColor);
        else localStorage.removeItem('playerColor');
        return { id: getPlayerId(), name: trimmed, color };
    };

    const ensureOnlineRegistered = (nextAction) => {
        const profile = validateProfile();
        if (!profile) return;

        socketService.switchToOnline();
        if (!socket.connected) {
            setError('Backend server unreachable. Try Refresh or play Offline vs Bots!');
            return;
        }
        setError('');
        pendingActionRef.current = nextAction;
        socket.emit('player:register', profile);
    };

    const handleCreateOnlineRoom = (e) => {
        if (e) e.preventDefault();
        soundFX.playClick();
        const profile = validateProfile();
        if (!profile) return;

        ensureOnlineRegistered(() => {
            const newRoomId = generateRoomId();
            socket.emit('room:create', {
                hostId: profile.id,
                roomId: newRoomId,
                name: hostRoomName.trim() || `${profile.name}'s Ship`,
                isPublic: hostIsPublic,
                region: hostRegion,
                settings: {
                    ...DEFAULT_ROOM_SETTINGS,
                    impostorCount: hostImpostors,
                },
            });
        });
    };

    const handleJoinOnlineRoom = async (roomId) => {
        const cleanId = String(roomId || '').trim().toUpperCase();
        if (!cleanId) {
            setError('Enter a room code.');
            return;
        }
        const profile = validateProfile();
        if (!profile) return;

        soundFX.playClick();
        setError('');

        try {
            const response = await fetch(apiUrl(`/rooms/${cleanId}`));
            if (!response.ok) {
                setError(`Room "${cleanId}" not found.`);
                return;
            }
            const data = await response.json();
            if (data.started) {
                setError('Match already in progress in that room.');
                return;
            }
            if (data?.players) {
                const takenNames = Object.values(data.players).map((p) => p.name.toLowerCase());
                const takenColors = Object.values(data.players).map((p) => p.color.toLowerCase());
                if (takenNames.includes(profile.name.toLowerCase())) {
                    setError('That name is already taken in this room.');
                    return;
                }
                if (selectedColor && takenColors.includes(selectedColor.toLowerCase())) {
                    setError('That color is taken in this room — pick another or use Random.');
                    return;
                }
            }

            ensureOnlineRegistered(() => {
                socket.emit('room:join', {
                    playerId: profile.id,
                    roomId: cleanId,
                });
            });
        } catch {
            setError('Could not reach server. Check connection or play Offline vs Bots!');
        }
    };

    const handleStartOffline = () => {
        const profile = validateProfile();
        if (!profile) return;
        soundFX.playClick();
        setError('');
        socketService.startOfflineGame({
            player: profile,
            settings: {
                ...DEFAULT_ROOM_SETTINGS,
                impostorCount: offlineImpostors,
                botCount,
                botDifficulty,
                preferredRole,
            },
        });
    };

    const previewColor = selectedColor || '#c51111';
    const previewMeta = getColorMeta(previewColor);

    const filteredServers = Object.values(rooms).filter((room) => {
        if (!room || room.isPublic === false) return false;
        if (!showInGame && room.started) return false;
        if (regionFilter !== 'ALL' && (room.region || 'SA') !== regionFilter) return false;
        if (impostorFilter !== 'ANY' && (room.settings?.impostorCount || 1) !== Number(impostorFilter)) {
            return false;
        }
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            const matchId = room.id.toLowerCase().includes(q);
            const matchName = (room.name || '').toLowerCase().includes(q);
            const matchHost = (room.host?.name || '').toLowerCase().includes(q);
            if (!matchId && !matchName && !matchHost) return false;
        }
        return true;
    });

    const publicWaitingCount = Object.values(rooms).filter((r) => r.isPublic !== false && !r.started).length;

    return (
        <div className={styles.container}>
            <div className={styles.starsLayer} />
            {FLOATING_CREW.map((fc, i) => (
                <div
                    key={i}
                    className={styles.floatingCrew}
                    style={{ top: fc.top, left: fc.left, right: fc.right, animationDelay: fc.delay }}
                >
                    <CrewmateAvatar color={fc.color} size={fc.size} />
                </div>
            ))}

            <div className={styles.shell}>
                {/* Header Brand + Server Status + Settings */}
                <div className={styles.topHeader}>
                    <img src="/assets/logo.png" alt="Among Us" className={styles.logoImg} />
                    <div className={styles.headerActions}>
                        <div className={styles.statusPill}>
                            <span
                                className={`${styles.statusDot} ${
                                    serverStatus.online ? styles.dotGreen : styles.dotAmber
                                }`}
                            />
                            {serverStatus.online ? (
                                <span>
                                    Server Online • {serverStatus.pingMs}ms • {publicWaitingCount} Open{' '}
                                    {publicWaitingCount === 1 ? 'Lobby' : 'Lobbies'}
                                </span>
                            ) : serverStatus.checking ? (
                                <span>Checking server...</span>
                            ) : (
                                <span>Server Offline — Bot Mode Ready</span>
                            )}
                        </div>
                        <button
                            type="button"
                            className={styles.headerIconBtn}
                            onClick={() => handleToggleMute()}
                            title={muted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
                        >
                            {muted ? '🔇' : '🔊'}
                        </button>
                        <button
                            type="button"
                            className={styles.headerSettingsBtn}
                            onClick={() => {
                                soundFX.playClick();
                                setSettingsOpen(true);
                            }}
                        >
                            ⚙️ Settings
                        </button>
                    </div>
                </div>

                {/* Crewmate Identity Bar */}
                <div className={styles.profileStrip}>
                    <div className={styles.profileLeft}>
                        <div className={styles.avatarBounce}>
                            <CrewmateAvatar color={previewColor} size={62} />
                        </div>
                        <div className={styles.nameBlock}>
                            <label className={styles.tinyLabel}>CREWMATE NAME</label>
                            <input
                                type="text"
                                placeholder="Enter your name..."
                                value={playerName}
                                onChange={(e) => {
                                    setPlayerName(e.target.value);
                                    if (error) setError('');
                                }}
                                className={styles.input}
                                maxLength={20}
                            />
                        </div>
                    </div>

                    <div className={styles.colorStrip}>
                        <div className={styles.colorHeaderRow}>
                            <span className={styles.tinyLabel}>
                                SUIT COLOR: {selectedColor ? previewMeta.name : 'Random'}
                            </span>
                            {selectedColor && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedColor(null)}
                                    className={styles.randomBtn}
                                >
                                    🎲 Random
                                </button>
                            )}
                        </div>
                        <div className={styles.colorGrid}>
                            {PLAYER_COLORS.map((color) => (
                                <button
                                    key={color.hex}
                                    type="button"
                                    className={`${styles.colorOption} ${
                                        selectedColor === color.hex ? styles.colorOptionSelected : ''
                                    }`}
                                    style={{ backgroundColor: color.hex }}
                                    onClick={() => {
                                        soundFX.playClick();
                                        setSelectedColor(color.hex);
                                    }}
                                    title={color.name}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {error && <div className={styles.errorBanner}>{error}</div>}

                {/* VIEW 1: MAIN MENU */}
                {view === 'home' && (
                    <div className={styles.modeGrid}>
                        <button
                            type="button"
                            className={`${styles.modeCard} ${styles.modeOnline}`}
                            onClick={() => {
                                soundFX.playClick();
                                setError('');
                                refreshServerAndRooms();
                                setView('online');
                            }}
                        >
                            <div className={styles.modeIcon}>🌐</div>
                            <h2 className={styles.modeTitle}>ONLINE</h2>
                            <p className={styles.modeDesc}>
                                Browse public servers, filter by region or impostors, or host a private ship with friends.
                            </p>
                            <span className={styles.modeTag}>
                                {serverStatus.online ? `${publicWaitingCount} Open Lobbies` : 'Server Browser'}
                            </span>
                        </button>

                        <button
                            type="button"
                            className={`${styles.modeCard} ${styles.modeOffline}`}
                            onClick={() => {
                                soundFX.playClick();
                                setError('');
                                setView('offline');
                            }}
                        >
                            <div className={styles.modeIcon}>🤖</div>
                            <h2 className={styles.modeTitle}>OFFLINE VS BOTS</h2>
                            <p className={styles.modeDesc}>
                                Play solo instantly against AI Crewmates & Impostors with pathfinding, vents, chat, and voting!
                            </p>
                            <span className={styles.modeTag}>Works 100% Offline</span>
                        </button>

                        <button
                            type="button"
                            className={`${styles.modeCard} ${styles.modeHowTo}`}
                            onClick={() => {
                                soundFX.playClick();
                                setError('');
                                setView('howto');
                            }}
                        >
                            <div className={styles.modeIcon}>📋</div>
                            <h2 className={styles.modeTitle}>HOW TO PLAY</h2>
                            <p className={styles.modeDesc}>
                                View keybinds, lobby laptop settings, Crewmate tasks, Impostor sabotages & voting rules.
                            </p>
                            <span className={styles.modeTag}>Field Manual</span>
                        </button>
                    </div>
                )}

                {/* VIEW 2: ONLINE SERVER BROWSER (AMONG US STYLE) */}
                {view === 'online' && (
                    <div className={styles.browserPanel}>
                        <div className={styles.browserTopBar}>
                            <button
                                type="button"
                                className={styles.navBackBtn}
                                onClick={() => {
                                    soundFX.playClick();
                                    setView('home');
                                }}
                            >
                                ← Main Menu
                            </button>

                            <div className={styles.regionTabs}>
                                <button
                                    type="button"
                                    className={`${styles.regionChip} ${
                                        regionFilter === 'ALL' ? styles.regionActive : ''
                                    }`}
                                    onClick={() => setRegionFilter('ALL')}
                                >
                                    🌍 All Regions
                                </button>
                                {REGION_OPTIONS.map((r) => (
                                    <button
                                        key={r.id}
                                        type="button"
                                        className={`${styles.regionChip} ${
                                            regionFilter === r.id ? styles.regionActive : ''
                                        }`}
                                        onClick={() => setRegionFilter(r.id)}
                                    >
                                        {r.flag} {r.id}
                                    </button>
                                ))}
                            </div>

                            <button
                                type="button"
                                className={styles.refreshBtn}
                                onClick={() => {
                                    soundFX.playClick();
                                    refreshServerAndRooms();
                                }}
                                disabled={refreshing}
                            >
                                {refreshing ? 'Refreshing...' : '🔄 Refresh'}
                            </button>
                        </div>

                        <div className={styles.browserColumns}>
                            {/* Left Column: Host Room & Private Code */}
                            <div className={styles.leftColumn}>
                                <form className={styles.subBox} onSubmit={handleCreateOnlineRoom}>
                                    <h3 className={styles.boxTitle}>🚀 Host Game</h3>
                                    <input
                                        type="text"
                                        placeholder="Ship name (optional)"
                                        value={hostRoomName}
                                        onChange={(e) => setHostRoomName(e.target.value)}
                                        maxLength={28}
                                        className={styles.smallInput}
                                    />

                                    <div className={styles.inlineSelectRow}>
                                        <span className={styles.fieldCaption}>Visibility</span>
                                        <div className={styles.pillToggle}>
                                            <button
                                                type="button"
                                                className={hostIsPublic ? styles.pillSelected : ''}
                                                onClick={() => setHostIsPublic(true)}
                                            >
                                                🔓 Public
                                            </button>
                                            <button
                                                type="button"
                                                className={!hostIsPublic ? styles.pillSelected : ''}
                                                onClick={() => setHostIsPublic(false)}
                                            >
                                                🔒 Private
                                            </button>
                                        </div>
                                    </div>

                                    <div className={styles.inlineSelectRow}>
                                        <span className={styles.fieldCaption}>Region</span>
                                        <select
                                            value={hostRegion}
                                            onChange={(e) => setHostRegion(e.target.value)}
                                            className={styles.selectBox}
                                        >
                                            {REGION_OPTIONS.map((r) => (
                                                <option key={r.id} value={r.id}>
                                                    {r.flag} {r.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className={styles.inlineSelectRow}>
                                        <span className={styles.fieldCaption}>Impostors</span>
                                        <div className={styles.impBtns}>
                                            {[1, 2, 3].map((n) => (
                                                <button
                                                    key={n}
                                                    type="button"
                                                    className={`${styles.impBtn} ${
                                                        hostImpostors === n ? styles.impSelected : ''
                                                    }`}
                                                    onClick={() => setHostImpostors(n)}
                                                >
                                                    {n}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <Button type="submit" className={styles.createActionBtn}>
                                        Create Lobby
                                    </Button>
                                </form>

                                <div className={styles.subBox}>
                                    <h3 className={styles.boxTitle}>🔑 Private Code</h3>
                                    <div className={styles.codeJoinRow}>
                                        <input
                                            type="text"
                                            placeholder="CODE..."
                                            value={joinCode}
                                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                            maxLength={6}
                                            className={styles.codeInput}
                                        />
                                        <button
                                            type="button"
                                            className={styles.joinCodeBtn}
                                            onClick={() => handleJoinOnlineRoom(joinCode)}
                                        >
                                            Enter
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Public Servers Browser */}
                            <div className={styles.rightColumn}>
                                <div className={styles.filterBar}>
                                    <input
                                        type="text"
                                        placeholder="🔍 Search ship, host, or code..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className={styles.searchInput}
                                    />

                                    <div className={styles.impFilterGroup}>
                                        <span className={styles.fieldCaption}>Impostors:</span>
                                        {['ANY', '1', '2', '3'].map((val) => (
                                            <button
                                                key={val}
                                                type="button"
                                                className={`${styles.filterPill} ${
                                                    impostorFilter === val ? styles.filterActive : ''
                                                }`}
                                                onClick={() => setImpostorFilter(val)}
                                            >
                                                {val}
                                            </button>
                                        ))}
                                    </div>

                                    <label className={styles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={showInGame}
                                            onChange={(e) => setShowInGame(e.target.checked)}
                                        />
                                        <span>Show In-Game</span>
                                    </label>
                                </div>

                                <div className={styles.serverListScroll}>
                                    {filteredServers.length === 0 ? (
                                        <div className={styles.emptyServers}>
                                            <p>No public games match your filters.</p>
                                            <span>
                                                Host a new Public Ship on the left or try Offline vs Bots!
                                            </span>
                                        </div>
                                    ) : (
                                        filteredServers.map((room) => {
                                            const count =
                                                room.playerCount ?? Object.keys(room.players || {}).length;
                                            const max = room.maxPlayers || 10;
                                            const imp = room.settings?.impostorCount || 1;
                                            const spd = room.settings?.playerSpeed || 1;
                                            const kcd = room.settings?.killCooldownSec || 15;
                                            const isFull = count >= max;
                                            return (
                                                <div key={room.id} className={styles.serverRow}>
                                                    <div className={styles.serverMain}>
                                                        <CrewmateAvatar
                                                            color={room.host?.color || '#c51111'}
                                                            size={36}
                                                        />
                                                        <div>
                                                            <div className={styles.serverTitleRow}>
                                                                <span className={styles.serverName}>
                                                                    {room.name || `${room.host?.name}'s Ship`}
                                                                </span>
                                                                <span className={styles.codeBadge}>
                                                                    #{room.id}
                                                                </span>
                                                                <span className={styles.regionTag}>
                                                                    {room.region || 'SA'}
                                                                </span>
                                                            </div>
                                                            <div className={styles.serverMetaRow}>
                                                                <span>Host: {room.host?.name}</span>
                                                                <span>•</span>
                                                                <span>🗺️ {room.map || 'The Skeld'}</span>
                                                                <span>•</span>
                                                                <span className={styles.impMeta}>
                                                                    🔪 {imp} {imp === 1 ? 'Imp' : 'Imps'}
                                                                </span>
                                                                <span>•</span>
                                                                <span>{spd}x Speed</span>
                                                                <span>•</span>
                                                                <span>{kcd}s Kill</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className={styles.serverRight}>
                                                        <div className={styles.occupancyBox}>
                                                            <span className={styles.occupancyText}>
                                                                {count}/{max}
                                                            </span>
                                                            <div className={styles.occupancyBar}>
                                                                <div
                                                                    className={styles.occupancyFill}
                                                                    style={{ width: `${(count / max) * 100}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            disabled={room.started || isFull}
                                                            className={styles.joinServerBtn}
                                                            onClick={() => handleJoinOnlineRoom(room.id)}
                                                        >
                                                            {room.started ? 'IN GAME' : isFull ? 'FULL' : 'JOIN'}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* VIEW 3: OFFLINE VS BOTS */}
                {view === 'offline' && (
                    <div className={styles.subPanel}>
                        <div className={styles.browserTopBar}>
                            <button
                                type="button"
                                className={styles.navBackBtn}
                                onClick={() => {
                                    soundFX.playClick();
                                    setView('home');
                                }}
                            >
                                ← Main Menu
                            </button>
                            <h2 className={styles.panelHeading}>🤖 Offline Mode — Practice vs AI Bots</h2>
                        </div>

                        <div className={styles.offlineGrid}>
                            <div className={styles.offlineCard}>
                                <span className={styles.fieldCaption}>AI Bot Count ({botCount + 1} Total Players)</span>
                                <div className={styles.chipGroup}>
                                    {SETTING_OPTIONS.botCount.map((n) => (
                                        <button
                                            key={n}
                                            type="button"
                                            className={`${styles.choiceChip} ${
                                                botCount === n ? styles.choiceSelected : ''
                                            }`}
                                            onClick={() => {
                                                soundFX.playClick();
                                                setBotCount(n);
                                            }}
                                        >
                                            {n} Bots
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.offlineCard}>
                                <span className={styles.fieldCaption}>AI Intelligence / Difficulty</span>
                                <div className={styles.chipGroup}>
                                    {SETTING_OPTIONS.botDifficulty.map((d) => (
                                        <button
                                            key={d}
                                            type="button"
                                            className={`${styles.choiceChip} ${
                                                botDifficulty === d ? styles.choiceSelected : ''
                                            }`}
                                            onClick={() => {
                                                soundFX.playClick();
                                                setBotDifficulty(d);
                                            }}
                                        >
                                            {d.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                                <p className={styles.hintSmall}>
                                    {botDifficulty === 'casual'
                                        ? 'Relaxed task pace, less cautious impostors.'
                                        : botDifficulty === 'normal'
                                          ? 'Balanced stealth, body reporting, vents, and deduction.'
                                          : 'Sharp witness memory, strategic vents, fast tasks.'}
                                </p>
                            </div>

                            <div className={styles.offlineCard}>
                                <span className={styles.fieldCaption}>Your Role</span>
                                <div className={styles.chipGroup}>
                                    {SETTING_OPTIONS.preferredRole.map((r) => (
                                        <button
                                            key={r}
                                            type="button"
                                            className={`${styles.choiceChip} ${
                                                preferredRole === r ? styles.choiceSelected : ''
                                            }`}
                                            onClick={() => {
                                                soundFX.playClick();
                                                setPreferredRole(r);
                                            }}
                                        >
                                            {r === 'random' ? '🎲 Random' : r === 'crewmate' ? '🧑‍🚀 Crewmate' : '🔪 Impostor'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.offlineCard}>
                                <span className={styles.fieldCaption}>Impostors</span>
                                <div className={styles.chipGroup}>
                                    {[1, 2, 3].map((n) => (
                                        <button
                                            key={n}
                                            type="button"
                                            className={`${styles.choiceChip} ${
                                                offlineImpostors === n ? styles.choiceSelected : ''
                                            }`}
                                            onClick={() => {
                                                soundFX.playClick();
                                                setOfflineImpostors(n);
                                            }}
                                        >
                                            {n} {n === 1 ? 'Impostor' : 'Impostors'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className={styles.offlineFooter}>
                            <p className={styles.laptopTip}>
                                💻 Walk to the Dropship Laptop <b>[E]</b> inside the lobby to adjust all 15 game rules!
                            </p>
                            <Button onClick={handleStartOffline} className={styles.launchOfflineBtn}>
                                Enter Offline Dropship
                            </Button>
                        </div>
                    </div>
                )}

                {/* VIEW 4: HOW TO PLAY */}
                {view === 'howto' && (
                    <div className={styles.subPanel}>
                        <div className={styles.browserTopBar}>
                            <button
                                type="button"
                                className={styles.navBackBtn}
                                onClick={() => {
                                    soundFX.playClick();
                                    setView('home');
                                }}
                            >
                                ← Main Menu
                            </button>
                            <h2 className={styles.panelHeading}>📋 How To Play — The Skeld</h2>
                        </div>

                        <div className={styles.howToGrid}>
                            <div className={styles.howToBox}>
                                <h3>🎮 Controls</h3>
                                <ul>
                                    <li><b>WASD / Arrow Keys:</b> Move around the ship</li>
                                    <li><b>[E] / USE:</b> Open Laptop (Lobby), do Tasks, or press Emergency Button</li>
                                    <li><b>[C]:</b> Quick-open Color & Name customization near Lobby Laptop</li>
                                    <li><b>[R] / REPORT:</b> Report a dead body</li>
                                    <li><b>[Q] or [K]:</b> Kill nearby Crewmate (Impostor)</li>
                                    <li><b>[V]:</b> Enter / Travel / Exit Vents (Impostor)</li>
                                    <li><b>[M]:</b> Toggle Interactive Skeld Mini-Map</li>
                                </ul>
                            </div>

                            <div className={styles.howToBox}>
                                <h3>🧑‍🚀 Crewmates vs 🔪 Impostors</h3>
                                <ul>
                                    <li><b>Crewmates:</b> Complete all interactive tasks across 8 rooms or vote out every Impostor.</li>
                                    <li><b>Impostors:</b> Eliminate crewmates when nobody is watching, slip into vents, and deceive meetings.</li>
                                    <li><b>Ghosts:</b> Dead players fly through walls, finish remaining tasks, and talk in Ghost Chat.</li>
                                    <li><b>Room Host:</b> Use the Dropship Laptop to customize speed, vision, kill cooldown, eject confirmation & anonymous votes!</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {settingsOpen && (
                <SettingsModal
                    mode="menu"
                    muted={muted}
                    onToggleMute={handleToggleMute}
                    hudPrefs={hudPrefs}
                    onUpdateHudPrefs={handleUpdateHudPrefs}
                    onClose={() => setSettingsOpen(false)}
                />
            )}
        </div>
    );
}

function roomsToMap(data) {
    if (Array.isArray(data)) {
        return Object.fromEntries(data.map((room) => [room.id, room]));
    }
    if (data && typeof data === 'object') return data;
    return {};
}

function generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateUserId() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 16; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function getPlayerId() {
    let playerId = sessionStorage.getItem('playerId');
    if (!playerId) {
        playerId = generateUserId();
        sessionStorage.setItem('playerId', playerId);
    }
    return playerId;
}

export default Menu;
