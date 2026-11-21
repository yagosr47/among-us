import { io } from "socket.io-client";
import { getSocketUrl } from "../utils/urls.js";

const SOCKET_URL = getSocketUrl();

const socket = io(SOCKET_URL, {
    autoConnect: false,
    withCredentials: true,
    transports: ["websocket", "polling"],
});

socket.on("connect", () => {
    console.log("Connected to server:", socket.id);
});

socket.on("connect_error", (error) => {
    console.error("Socket connection error:", error.message || error);
});

export const socketService = {
    connect: () => {
        if (!socket.connected) {
            socket.connect();
        }
    },

    disconnect: (playerId) => {
        if (socket.connected) {
            const id = playerId || sessionStorage.getItem("playerId");
            if (id) {
                socket.emit("player:disconnect", { playerId: id });
            }
            setTimeout(() => {
                socket.disconnect();
            }, 80);
        } else {
            socket.disconnect();
        }
    },

    getSocket: () => socket,
};

export default socketService;
