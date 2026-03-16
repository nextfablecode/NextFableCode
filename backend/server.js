require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const routes = require('./routes');
const collaborationSocket = require('./sockets/collaboration');
const { sanitize } = require('./middleware/validation');

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false
  },
  pingTimeout: 60000
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow any railway.app domain, localhost, and FRONTEND_URL
    const allowed = [
      process.env.FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
    ].filter(Boolean);
    if (
      allowed.includes(origin) ||
      origin.endsWith('.railway.app') ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.netlify.app')
    ) {
      callback(null, true);
    } else {
      callback(null, true); // allow all for now — tighten after confirmed working
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many authentication attempts.' }
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitize);

// Static frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// API routes
app.use('/api', routes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Serve frontend for all non-API routes (SPA)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  } else {
    res.status(404).json({ success: false, message: 'API endpoint not found' });
  }
});

// Setup Socket.IO
collaborationSocket(io);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/collaborative_editor')
  .then(() => {
    console.log('✅ MongoDB connected');
    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📁 Frontend: http://localhost:${PORT}`);
      console.log(`🔌 API: http://localhost:${PORT}/api`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1);
  });

module.exports = { app, server };
