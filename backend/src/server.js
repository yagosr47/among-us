import { Server } from "socket.io";
import express from "express";
import apiRouter from "./routes/api.js";
import cors from "cors";
import { registerRoomEvents } from "./events/roomEvents.js";
import { registerGameEvents } from "./events/gameEvents.js";
import "dotenv/config";
import http from "http";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

function parseAllowedOrigins() {
    const raw = process.env.ALLOWED_ORIGIN || process.env.FRONTEND_URL || "";
    return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

const configuredOrigins = parseAllowedOrigins();

function isOriginAllowed(origin) {
    if (!origin) return true;
    if (configuredOrigins.includes("*")) return true;
    if (configuredOrigins.includes(origin)) return true;

    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return true;
    }
    // Allow Arena / E2B live preview origins
    if (/^https:\/\/[a-zA-Z0-9-]+\.e2b\.app$/.test(origin)) {
        return true;
    }

    return false;
}

const corsOptions = {
    origin(origin, callback) {
        if (isOriginAllowed(origin)) {
            callback(null, origin || true);
        } else {
            console.warn("CORS blocked origin:", origin);
            callback(new Error(`CORS blocked for origin: ${origin}`));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());
app.use("/", apiRouter);

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin(origin, callback) {
            if (isOriginAllowed(origin)) {
                callback(null, origin || true);
            } else {
                console.warn("Socket.IO CORS blocked origin:", origin);
                callback(new Error(`CORS blocked for origin: ${origin}`));
            }
        },
        methods: ["GET", "POST"],
        credentials: true,
    },
});

io.on("connection", (socket) => {
    registerRoomEvents(io, socket);
    registerGameEvents(io, socket);
});

server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
});
