import { io } from 'socket.io-client';
import { apiUrl, getSocketUrl } from '../utils/urls.js';
import { OfflineEngine } from '../offline/OfflineEngine.js';

const SOCKET_URL = getSocketUrl();

const realSocket = io(SOCKET_URL, {
    autoConnect: false,
    withCredentials: true,
    transports: ['websocket', 'polling'],
});

let currentMode = 'online'; // 'online' | 'offline'

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

function dispatchLocal(event, ...args) {
    const set = listeners.get(event);
    if (!set || set.size === 0) return;
    [...set].forEach((fn) => {
        try {
            fn(...args);
        } catch (err) {
            console.error(`Socket listener error for "${event}":`, err);
        }
    });
}

const offlineEngine = new OfflineEngine((event, ...args) => {
    if (currentMode === 'offline') {
        dispatchLocal(event, ...args);
    }
});

realSocket.on('connect', () => {
    console.log('Connected to server:', realSocket.id);
    if (currentMode === 'online') dispatchLocal('connect');
});

realSocket.on('disconnect', (reason) => {
    if (currentMode === 'online') dispatchLocal('disconnect', reason);
});

realSocket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message || error);
    if (currentMode === 'online') dispatchLocal('connect_error', error);
});

realSocket.onAny((event, ...args) => {
    if (currentMode === 'online') {
        dispatchLocal(event, ...args);
    }
});

const socketFacade = {
    get id() {
        return currentMode === 'offline' ? 'offline-local' : realSocket.id;
    },
    get connected() {
        return currentMode === 'offline' ? true : realSocket.connected;
    },
    on(event, fn) {
        if (!event || typeof fn !== 'function') return this;
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(fn);
        return this;
    },
    once(event, fn) {
        if (!event || typeof fn !== 'function') return this;
        const wrapper = (...args) => {
            this.off(event, wrapper);
            fn(...args);
        };
        return this.on(event, wrapper);
    },
    off(event, fn) {
        if (!event) return this;
        if (!fn) {
            listeners.delete(event);
            return this;
        }
        listeners.get(event)?.delete(fn);
        return this;
    },
    emit(event, ...args) {
        if (currentMode === 'offline') {
            offlineEngine.handleClientEmit(event, args[0]);
        } else {
            realSocket.emit(event, ...args);
        }
        return this;
    },
    connect() {
        if (currentMode === 'online' && !realSocket.connected) {
            realSocket.connect();
        }
        return this;
    },
    disconnect() {
        if (currentMode === 'offline') {
            offlineEngine.stop();
        } else {
            realSocket.disconnect();
        }
        return this;
    },
};

export const socketService = {
    isOffline: () => currentMode === 'offline',

    getMode: () => currentMode,

    switchToOnline: () => {
        offlineEngine.stop();
        currentMode = 'online';
        if (!realSocket.connected) {
            realSocket.connect();
        }
    },

    startOfflineGame: ({ player, settings }) => {
        currentMode = 'offline';
        offlineEngine.startSession({ player, settings });
    },

    stopOfflineGame: () => {
        offlineEngine.stop();
        currentMode = 'online';
    },

    async fetchPlayerRoom(playerId) {
        if (currentMode === 'offline') {
            return offlineEngine.getPlayerRoomSnapshot(playerId);
        }
        const response = await fetch(apiUrl(`/player/room/${playerId}`));
        if (!response.ok) return null;
        return response.json();
    },

    connect: () => {
        if (currentMode === 'online' && !realSocket.connected) {
            realSocket.connect();
        }
    },

    disconnect: (playerId) => {
        if (currentMode === 'offline') {
            offlineEngine.stop();
            return;
        }
        if (realSocket.connected) {
            const id = playerId || sessionStorage.getItem('playerId');
            if (id) {
                realSocket.emit('player:disconnect', { playerId: id });
            }
            setTimeout(() => {
                realSocket.disconnect();
            }, 80);
        } else {
            realSocket.disconnect();
        }
    },

    getSocket: () => socketFacade,
};

export default socketService;
