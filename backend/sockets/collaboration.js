const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Team = require('../models/Team');
const Project = require('../models/Project');
const File = require('../models/File');

// In-memory presence: { projectId: { userId: { socketId, user, cursor, activeFile } } }
const projectPresence = new Map();

const getOrCreateRoom = (projectId) => {
  if (!projectPresence.has(projectId)) {
    projectPresence.set(projectId, new Map());
  }
  return projectPresence.get(projectId);
};

const getRoomUsers = (projectId) => {
  const room = projectPresence.get(projectId);
  if (!room) return [];
  return Array.from(room.values()).map(p => ({
    userId: p.user._id,
    username: p.user.username,
    color: p.user.color,
    avatar: p.user.avatar,
    activeFile: p.activeFile,
    cursor: p.cursor
  }));
};

module.exports = (io) => {
  // Middleware: authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.user.username} (${socket.id})`);

    // Join a project room
    socket.on('join:project', async ({ projectId }) => {
      try {
        const project = await Project.findById(projectId);
        if (!project) return socket.emit('error', { message: 'Project not found' });

        const team = await Team.findById(project.team);
        if (!team || !team.isMember(socket.user._id)) {
          return socket.emit('error', { message: 'Access denied' });
        }

        // Leave previous project rooms
        for (const room of socket.rooms) {
          if (room.startsWith('project:')) {
            const oldProjectId = room.replace('project:', '');
            socket.leave(room);
            const presence = getOrCreateRoom(oldProjectId);
            presence.delete(socket.user._id.toString());
            io.to(room).emit('presence:update', getRoomUsers(oldProjectId));
          }
        }

        const roomName = `project:${projectId}`;
        socket.join(roomName);
        socket.currentProject = projectId;

        // Register presence
        const presence = getOrCreateRoom(projectId);
        presence.set(socket.user._id.toString(), {
          socketId: socket.id,
          user: socket.user,
          activeFile: null,
          cursor: null
        });

        // Send current presence to the new user
        socket.emit('presence:list', getRoomUsers(projectId));

        // Notify others
        socket.to(roomName).emit('presence:joined', {
          userId: socket.user._id,
          username: socket.user.username,
          color: socket.user.color
        });

        // Broadcast updated presence
        io.to(roomName).emit('presence:update', getRoomUsers(projectId));

      } catch (err) {
        socket.emit('error', { message: 'Failed to join project' });
      }
    });

    // Leave project room
    socket.on('leave:project', ({ projectId }) => {
      const roomName = `project:${projectId}`;
      socket.leave(roomName);
      const presence = getOrCreateRoom(projectId);
      presence.delete(socket.user._id.toString());
      io.to(roomName).emit('presence:update', getRoomUsers(projectId));
      socket.to(roomName).emit('presence:left', { userId: socket.user._id });
    });

    // File content change (collaborative editing)
    socket.on('file:change', async ({ projectId, fileId, content, delta }) => {
      try {
        const roomName = `project:${projectId}`;
        
        // Verify user is in the room
        if (!socket.rooms.has(roomName)) return;

        // Broadcast to other users in the room (not self)
        socket.to(roomName).emit('file:changed', {
          fileId,
          content,
          delta,
          userId: socket.user._id,
          username: socket.user.username,
          timestamp: Date.now()
        });

        // Debounced save is handled by client explicitly
      } catch (err) {
        socket.emit('error', { message: 'Failed to broadcast change' });
      }
    });

    // File saved
    socket.on('file:save', async ({ projectId, fileId, content }) => {
      try {
        const project = await Project.findById(projectId);
        if (!project) return socket.emit('error', { message: 'Project not found' });

        const team = await Team.findById(project.team);
        if (!team.canEdit(socket.user._id)) {
          return socket.emit('error', { message: 'Insufficient permissions' });
        }

        const file = await File.findById(fileId);
        if (!file || file.project.toString() !== projectId) {
          return socket.emit('error', { message: 'File not found' });
        }

        file.content = content;
        file.lastModifiedBy = socket.user._id;
        await file.save();

        const roomName = `project:${projectId}`;
        io.to(roomName).emit('file:saved', {
          fileId,
          savedBy: socket.user.username,
          timestamp: Date.now()
        });
      } catch (err) {
        socket.emit('error', { message: 'Failed to save file' });
      }
    });

    // Cursor position update
    socket.on('cursor:update', ({ projectId, fileId, position, selection }) => {
      const roomName = `project:${projectId}`;
      if (!socket.rooms.has(roomName)) return;

      const presence = getOrCreateRoom(projectId);
      const userPresence = presence.get(socket.user._id.toString());
      if (userPresence) {
        userPresence.cursor = { fileId, position, selection };
      }

      socket.to(roomName).emit('cursor:moved', {
        userId: socket.user._id,
        username: socket.user.username,
        color: socket.user.color,
        fileId,
        position,
        selection
      });
    });

    // Active file change
    socket.on('file:active', ({ projectId, fileId, fileName }) => {
      const roomName = `project:${projectId}`;
      if (!socket.rooms.has(roomName)) return;

      const presence = getOrCreateRoom(projectId);
      const userPresence = presence.get(socket.user._id.toString());
      if (userPresence) {
        userPresence.activeFile = { fileId, fileName };
      }

      socket.to(roomName).emit('presence:update', getRoomUsers(projectId));
    });

    // File tree events (create/delete/rename)
    socket.on('filetree:change', ({ projectId, action, data }) => {
      const roomName = `project:${projectId}`;
      if (!socket.rooms.has(roomName)) return;

      socket.to(roomName).emit('filetree:changed', {
        action, // 'create', 'delete', 'rename', 'move'
        data,
        userId: socket.user._id,
        username: socket.user.username
      });
    });

    // Chat/activity messages
    socket.on('chat:message', ({ projectId, message }) => {
      const roomName = `project:${projectId}`;
      if (!socket.rooms.has(roomName)) return;

      if (!message || message.trim().length === 0 || message.length > 500) return;

      io.to(roomName).emit('chat:message', {
        userId: socket.user._id,
        username: socket.user.username,
        color: socket.user.color,
        message: message.trim(),
        timestamp: Date.now()
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.user.username}`);
      
      // Clean up all project rooms
      for (const [projectId, presence] of projectPresence.entries()) {
        if (presence.has(socket.user._id.toString())) {
          presence.delete(socket.user._id.toString());
          const roomName = `project:${projectId}`;
          io.to(roomName).emit('presence:update', getRoomUsers(projectId));
          io.to(roomName).emit('presence:left', {
            userId: socket.user._id,
            username: socket.user.username
          });
        }
      }
    });
  });
};
