const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Team = require('./models/Team');

let io = null;

/**
 * Parses raw Cookie header string into an object.
 */
const parseCookies = (cookieHeader) => {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const items = cookieHeader.split(';');
  for (const item of items) {
    const parts = item.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
};

/**
 * Initialize Socket.io with HTTP server.
 */
const initSocket = (server) => {
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());

  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
          callback(null, true);
        } else {
          callback(new Error(`CORS: Origin ${origin} not allowed.`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  // JWT Authentication Middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth?.token;

      // If token not directly passed in handshake auth, parse from cookies
      if (!token) {
        const cookies = parseCookies(socket.handshake.headers?.cookie);
        token = cookies.token_manager || cookies.token_employee || cookies.token_admin;
      }

      if (!token) {
        // Allow unauthenticated guest sockets (e.g. login screen awaiting device request approval)
        socket.isGuest = true;
        return next();
      }

      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (err) {
        socket.isGuest = true;
        return next();
      }

      const user = await User.findById(decoded.id).populate('teamId', 'name leadUserId');
      if (!user || !user.isActive) {
        socket.isGuest = true;
        return next();
      }

      socket.user = user;
      next();
    } catch (err) {
      console.error('[Socket Auth Error]:', err.message);
      socket.isGuest = true;
      next();
    }
  });

  io.on('connection', async (socket) => {
    // 0. Handle Unauthenticated / Guest Sockets
    if (socket.isGuest || !socket.user) {
      socket.on('join:device_request', (requestId) => {
        if (requestId) {
          const reqIdStr = requestId.toString();
          socket.join(`device_req:${reqIdStr}`);
          console.log(`[Socket] Guest joined device request room: device_req:${reqIdStr}`);
        }
      });
      return;
    }

    const user = socket.user;
    const userIdStr = user._id.toString();

    // 1. Personal Room
    socket.join(`user:${userIdStr}`);

    // 2. User's primary team room
    if (user.teamId) {
      const teamIdStr = (user.teamId._id || user.teamId).toString();
      socket.join(`team:${teamIdStr}`);
    }

    // 3. Role Room
    if (user.role === 'manager') {
      socket.join('managers');
      // Also join rooms of all teams this manager leads
      try {
        const managedTeams = await Team.find({
          leadUserId: user._id,
          isActive: true
        });
        for (const t of managedTeams) {
          socket.join(`team:${t._id.toString()}`);
        }
      } catch (err) {
        console.error('[Socket] Error joining manager team rooms:', err.message);
      }
    } else if (user.role === 'admin') {
      socket.join('admins');
    } else {
      socket.join('employees');
    }

    socket.emit('socket:ready', { userId: userIdStr, role: user.role });
    console.log(`[Socket] Connected: ${user.name} (${user.email}) [${user.role}] - Socket ID: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${user.name} (${socket.id})`);
    });
  });

  console.log('⚡ Socket.io initialized successfully');
  return io;
};

const getIO = () => {
  return io;
};

/**
 * Emit event to a specific user's personal room.
 */
const emitToUser = (userId, event, data) => {
  if (!io) return;
  const idStr = userId?._id ? userId._id.toString() : userId.toString();
  io.to(`user:${idStr}`).emit(event, data);
};

/**
 * Emit event to a team room.
 */
const emitToTeam = (teamId, event, data) => {
  if (!io || !teamId) return;
  const idStr = teamId?._id ? teamId._id.toString() : teamId.toString();
  io.to(`team:${idStr}`).emit(event, data);
};

/**
 * Emit event to all managers.
 */
const emitToManagers = (event, data) => {
  if (!io) return;
  io.to('managers').emit(event, data);
};

/**
 * Emit event to all admins.
 */
const emitToAdmins = (event, data) => {
  if (!io) return;
  io.to('admins').emit(event, data);
};

/**
 * Emit event to a specific device request room (guest/login listener).
 */
const emitToDeviceRequest = (requestId, event, data) => {
  if (!io || !requestId) return;
  const reqIdStr = requestId?._id ? requestId._id.toString() : requestId.toString();
  io.to(`device_req:${reqIdStr}`).emit(event, data);
};

/**
 * Emit event to all connected sockets.
 */
const emitToAll = (event, data) => {
  if (!io) return;
  io.emit(event, data);
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToTeam,
  emitToManagers,
  emitToAdmins,
  emitToDeviceRequest,
  emitToAll,
};
