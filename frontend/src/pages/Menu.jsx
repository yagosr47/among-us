import { useState, useEffect, useRef } from 'react';
import socketService from '../services/socket.js';
import styles from './room.module.css';
import { apiUrl } from '../utils/urls.js';
import { Button } from '../components/Button.jsx';
import CrewmateAvatar from '../components/CrewmateAvatar.jsx';
import { PLAYER_COLORS, getRandomColor, getColorMeta } from '../utils/colors.js';
import { soundFX } from '../utils/sound.js';

const FLOATING_CREW = [
    { color: '#c51111', top: '14%', left: '8%', delay: '0s', size: 54 },
    { color: '#38fedc', top: '72%', left: '12%', delay: '1.5s', size: 46 },
    { color: '#f5f557', top: '20%', right: '9%', delay: '0.8s', size: 50 },
    { color: '#ed54ba', top: '74%', right: '11%', delay: '2.2s', size: 44 },
];

export function Menu({ onJoinGame }) {
    const [playerName, setPlayerName] = useState('');
    const [selectedColor, setSelectedColor] = useState(null);
    const [isRegistered, setIsRegistered] = useState(false);
    const isRegisteredRef = useRef(false);
    const [error, setError] = useState('');
    const [rooms, setRooms] = useState({});
    const [joinCode, setJoinCode] = useState('');

    const socket = socketService.getSocket();

    useEffect(() => {
        const savedName = localStorage.getItem('playerName');
        if (savedName) setPlayerName(savedName);
    }, []);

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
            });
        };

        const onPlayerRegistered = () => {
            isRegisteredRef.current = true;
            setIsRegistered(true);
            setError('');
        };

        const onPlayerUnregistered = () => {
            isRegisteredRef.current = false;
            setIsRegistered(false);
        };

        const handleCantJoin = (data) => {
            setError(data?.message || 'Cannot join room');
        };

        socket.on('room:created', onRoomCreated);
        socket.on('room:updated', onRoomUpdated);
        socket.on('room:deleted', onRoomDeleted);
        socket.on('room:joined', onRoomJoined);
        socket.on('player:registered', onPlayerRegistered);
        socket.on('player:unregistered', onPlayerUnregistered);
        socket.on('room:join:error', handleCantJoin);

        fetchRooms()
            .then(setRooms)
            .catch((err) => console.error('Error fetching rooms:', err));

        return () => {
            socket.off('room:created', onRoomCreated);
            socket.off('room:updated', onRoomUpdated);
            socket.off('room:deleted', onRoomDeleted);
            socket.off('room:joined', onRoomJoined);
            socket.off('player:registered', onPlayerRegistered);
            socket.off('player:unregistered', onPlayerUnregistered);
            socket.off('room:join:error', handleCantJoin);
        };
    }, [socket, onJoinGame]);

    const handleRegister = (e) => {
        if (e) e.preventDefault();
        const trimmed = playerName.trim();
        if (!trimmed) {
            setError('Please enter a name');
            return;
        }
        if (!socket.connected) {
            setError('Connecting to server... please wait a moment.');
            return;
        }

        soundFX.playClick();
        const playerId = getPlayerId();
        localStorage.setItem('playerName', trimmed);
        const playerColor = selectedColor || getRandomColor();

        socket.emit('player:register', {
            id: playerId,
            name: trimmed,
            color: playerColor,
        });
        setError('');
    };

    const handleBackToRegister = () => {
        soundFX.playClick();
        socket.emit('player:unregister', { playerId: getPlayerId() });
    };

    const handleCreateRoom = () => {
        if (!isRegisteredRef.current) {
            setError('Please register first');
            return;
        }
        soundFX.playClick();
        const newRoomId = generateRoomId();
        socket.emit('room:create', {
            hostId: getPlayerId(),
            roomId: newRoomId,
        });
    };

    const handleJoinRoom = async (roomId) => {
        const cleanId = String(roomId || '').trim().toUpperCase();
        if (!cleanId) return;
        if (!isRegisteredRef.current) {
            setError('Please register first');
            return;
        }
        setError('');

        try {
            const response = await fetch(apiUrl(`/rooms/${cleanId}`));
            if (!response.ok) {
                setError('Room not found');
                return;
            }
            const data = await response.json();
            if (data.started) {
                setError('Game already in progress in that room');
                return;
            }

            if (data?.players) {
                const trimmedName = playerName.trim().toLowerCase();
                const takenNames = Object.values(data.players).map((p) => p.name.toLowerCase());
                const takenColors = Object.values(data.players).map((p) => p.color.toLowerCase());
                if (takenNames.includes(trimmedName)) {
                    setError('Name already taken in this room');
                    return;
                }
                if (selectedColor && takenColors.includes(selectedColor.toLowerCase())) {
                    setError('Color already taken in this room — clear or choose another');
                    return;
                }
            }

            socket.emit('room:join', {
                playerId: getPlayerId(),
                roomId: cleanId,
            });
        } catch (err) {
            console.error('Error fetching room data:', err);
            setError('Could not join room — is the server running?');
        }
    };

    const previewColor = selectedColor || '#c51111';
    const previewMeta = getColorMeta(previewColor);
    const roomList = Object.values(rooms).filter((r) => !r.started);

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

            {isRegistered && (
                <Button onClick={handleBackToRegister} className={styles.backBtn}>
                    Back
                </Button>
            )}

            <div className={styles.card}>
                <img src="/assets/logo.png" alt="Among Us" className={styles.logoImg} />

                {!isRegistered ? (
                    <form className={styles.section} onSubmit={handleRegister}>
                        <div className={styles.previewRow}>
                            <div className={styles.avatarBounce}>
                                <CrewmateAvatar color={previewColor} size={76} />
                            </div>
                            <div className={styles.previewInfo}>
                                <h2 className={styles.subtitle}>Customize Crewmate</h2>
                                <span className={styles.colorNameBadge}>
                                    {selectedColor ? previewMeta.name : 'Random Color'}
                                </span>
                            </div>
                        </div>

                        <input
                            type="text"
                            placeholder="Enter your name..."
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value)}
                            className={styles.input}
                            maxLength={20}
                            autoFocus
                        />

                        <div className={styles.colorPickerSection}>
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
                            {selectedColor && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedColor(null)}
                                    className={styles.clearColorButton}
                                >
                                    Clear Selection (Random)
                                </button>
                            )}
                        </div>

                        <Button type="submit" className={styles.continueBtn}>
                            Continue
                        </Button>
                    </form>
                ) : (
                    <div className={styles.section}>
                        <p className={styles.welcome}>Welcome aboard, {playerName.trim()}!</p>

                        <div className={styles.joinByCodeRow}>
                            <input
                                type="text"
                                placeholder="Room code..."
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                maxLength={6}
                                className={styles.codeInput}
                            />
                            <button
                                type="button"
                                className={styles.joinCodeBtn}
                                onClick={() => handleJoinRoom(joinCode)}
                            >
                                Join
                            </button>
                        </div>

                        <div className={styles.roomListWrap}>
                            {roomList.length > 0 ? (
                                <>
                                    <h3 className={styles.subtitle}>Open Lobbies</h3>
                                    <ul className={styles.roomList}>
                                        {roomList.map((room) => (
                                            <li
                                                className={styles.lobbyCard}
                                                key={room.id}
                                                onClick={() => handleJoinRoom(room.id)}
                                            >
                                                <div>
                                                    <span className={styles.roomId}>{room.id}</span>
                                                    <span className={styles.hostLabel}>
                                                        {' '}
                                                        • Host: {room.host?.name}
                                                    </span>
                                                </div>
                                                <span className={styles.playerCount}>
                                                    {Object.keys(room.players || {}).length}/10
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            ) : (
                                <p className={styles.noRooms}>No open rooms right now. Create one!</p>
                            )}
                        </div>

                        <Button onClick={handleCreateRoom} className={styles.continueBtn}>
                            Create Room
                        </Button>
                    </div>
                )}

                {error && <p className={styles.error}>{error}</p>}
            </div>
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

async function fetchRooms() {
    const response = await fetch(apiUrl('/rooms'));
    if (!response.ok) throw new Error(`Failed to fetch rooms: ${response.status}`);
    return roomsToMap(await response.json());
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
