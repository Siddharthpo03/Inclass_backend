// inclass-backend/socket.js
// Socket.io server with strict CORS (no wildcard) and structured logging.
// Origins: prefer array from server.js (app.locals.allowedOrigins), else SOCKET_ORIGINS, else defaults.

const logger = require("./utils/logger");
const Sentry = process.env.SENTRY_DSN ? require("@sentry/node") : null;

const DEFAULT_ALLOWED_ORIGINS = [
  "https://inclass.siddharthp.com",
  "http://localhost:5173",
];

function resolveAllowedOrigins(options = {}) {
  if (Array.isArray(options.origin) && options.origin.length > 0) {
    return options.origin;
  }
  if (process.env.SOCKET_ORIGINS) {
    const fromEnv = process.env.SOCKET_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (fromEnv.length > 0) {
      return fromEnv;
    }
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

let io = null;
let disconnectTimestamps = [];

module.exports = {
  init: (server, options = {}) => {
    const { Server } = require("socket.io");

    const allowedOrigins = resolveAllowedOrigins(options);

    logger.info("Socket.io allowed origins", { origins: allowedOrigins });

    io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          if (!origin) {
            return callback(null, true);
          }
          if (allowedOrigins.includes(origin)) {
            return callback(null, true);
          }
          const error = new Error("Not allowed by CORS: " + origin);
          logger.warn("Socket.io CORS blocked", { origin });
          if (Sentry) {
            Sentry.captureException(error);
          }
          return callback(error, false);
        },
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
    });

    io.on("connection", (socket) => {
      logger.info("Socket connected", { socketId: socket.id });

      // Join a session room (for faculty monitoring attendance)
      socket.on("joinSession", (data) => {
        const { sessionId, userRole } = data || {};
        if (sessionId) {
          const room = `session_${sessionId}`;
          socket.join(room);
          logger.info("Socket joined session room", {
            socketId: socket.id,
            room,
            userRole: userRole || "unknown",
          });

          // Acknowledge join
          socket.emit("sessionJoined", { sessionId, room });
        }
      });

      // Join session room (alternative format: join:session)
      socket.on("join:session", (data) => {
        const { sessionId } = data || {};
        if (sessionId) {
          const room = `session:${sessionId}`;
          socket.join(room);
          logger.info("Socket joined session room (alt)", {
            socketId: socket.id,
            room,
          });
        }
      });

      // Leave session room (alternative format: leave:session)
      socket.on("leave:session", (data) => {
        const { sessionId } = data || {};
        if (sessionId) {
          const room = `session:${sessionId}`;
          socket.leave(room);
          logger.info("Socket left session room (alt)", {
            socketId: socket.id,
            room,
          });
        }
      });

      // Join faculty room
      socket.on("join:faculty", (data) => {
        const { facultyId } = data || {};
        if (facultyId) {
          const room = `faculty:${facultyId}`;
          socket.join(room);
          logger.info("Socket joined faculty room", {
            socketId: socket.id,
            room,
          });
        }
      });

      // Leave faculty room
      socket.on("leave:faculty", (data) => {
        const { facultyId } = data || {};
        if (facultyId) {
          const room = `faculty:${facultyId}`;
          socket.leave(room);
          logger.info("Socket left faculty room", {
            socketId: socket.id,
            room,
          });
        }
      });

      // Join college room
      socket.on("join:college", (data) => {
        const { collegeId } = data || {};
        if (collegeId) {
          const room = `college:${collegeId}`;
          socket.join(room);
          logger.info("Socket joined college room", {
            socketId: socket.id,
            room,
          });
        }
      });

      // Leave college room
      socket.on("leave:college", (data) => {
        const { collegeId } = data || {};
        if (collegeId) {
          const room = `college:${collegeId}`;
          socket.leave(room);
          logger.info("Socket left college room", {
            socketId: socket.id,
            room,
          });
        }
      });

      // Join department room
      socket.on("join:department", (data) => {
        const { departmentId } = data || {};
        if (departmentId) {
          const room = `department:${departmentId}`;
          socket.join(room);
          logger.info("Socket joined department room", {
            socketId: socket.id,
            room,
          });
        }
      });

      // Leave department room
      socket.on("leave:department", (data) => {
        const { departmentId } = data || {};
        if (departmentId) {
          const room = `department:${departmentId}`;
          socket.leave(room);
          logger.info("Socket left department room", {
            socketId: socket.id,
            room,
          });
        }
      });

      // Join student room
      socket.on("join:student", (data) => {
        const { studentId } = data || {};
        if (studentId) {
          const room = `student:${studentId}`;
          socket.join(room);
          logger.info("Socket joined student room", {
            socketId: socket.id,
            room,
          });
        }
      });

      // Leave student room
      socket.on("leave:student", (data) => {
        const { studentId } = data || {};
        if (studentId) {
          const room = `student:${studentId}`;
          socket.leave(room);
          logger.info("Socket left student room", {
            socketId: socket.id,
            room,
          });
        }
      });

      // Join a class room (for faculty to monitor all sessions in a class)
      socket.on("joinClass", (data) => {
        const { classId, userRole } = data || {};
        if (classId) {
          const room = `class_${classId}`;
          socket.join(room);
          logger.info("Socket joined class room", {
            socketId: socket.id,
            room,
            userRole: userRole || "unknown",
          });

          // Acknowledge join
          socket.emit("classJoined", { classId, room });
        }
      });

      // Leave a session room
      socket.on("leaveSession", (sessionId) => {
        if (sessionId) {
          const room = `session_${sessionId}`;
          socket.leave(room);
          logger.info("Socket left session room", {
            socketId: socket.id,
            room,
          });
        }
      });

      // Leave a class room
      socket.on("leaveClass", (classId) => {
        if (classId) {
          const room = `class_${classId}`;
          socket.leave(room);
          logger.info("Socket left class room", {
            socketId: socket.id,
            room,
          });
        }
      });

      // Handle disconnection with spike monitoring
      socket.on("disconnect", (reason) => {
        const now = Date.now();
        disconnectTimestamps.push(now);
        disconnectTimestamps = disconnectTimestamps.filter(
          (ts) => now - ts <= 60 * 1000
        );

        logger.info("Socket disconnected", {
          socketId: socket.id,
          reason,
          recentDisconnects: disconnectTimestamps.length,
        });

        if (disconnectTimestamps.length > 20) {
          logger.warn("High disconnect spike detected", {
            countLastMinute: disconnectTimestamps.length,
          });
        }
      });

      // Error handling
      socket.on("error", (error) => {
        const payload = {
          socketId: socket.id,
          message: error && error.message ? error.message : String(error),
        };
        logger.error("Socket error", payload);
        if (Sentry) {
          Sentry.captureException(error);
        }
      });
    });

    return io;
  },
  getIO: () => {
    if (!io) {
      throw new Error("Socket.io not initialized. Call init() first.");
    }
    return io;
  },
};
