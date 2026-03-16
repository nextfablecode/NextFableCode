# 🚀 CodeSync — Collaborative Cloud Code Editor

A full-featured, real-time collaborative code editor built with Node.js, Express, Socket.IO, MongoDB, and Monaco Editor. Teams can securely collaborate on projects with live cursors, file synchronization, and role-based permissions.

---

## ✨ Features

### 🔐 Authentication
- Register / Login / Logout
- Password hashing with bcrypt (12 rounds)
- JWT authentication with 7-day expiry
- Secure session handling
- Rate limiting (20 auth attempts / 15 min)

### 👥 Team Collaboration
- Create and manage teams
- Invite members via shareable invite links
- Role system: **Owner** / **Editor** / **Viewer**
- Regenerate invite links
- Remove members

### 📁 Project System
- Teams can own multiple projects
- Project-level access control
- File/folder hierarchy
- Only team members can access projects

### 🗂️ File Explorer (VS Code Style)
- Create files and folders
- Rename (double-click or right-click)
- Delete with confirmation
- **Drag-and-drop** file/folder organization
- Nested folder support
- Context menu (right-click)
- File type icons with syntax colors
- Collapse all / expand all

### ✏️ Code Editor (Monaco)
- Syntax highlighting for 30+ languages
- Multi-tab editing
- Auto-indentation
- Bracket pair colorization
- IntelliSense / auto-complete
- Format on paste
- Adjustable font size, tab size
- Word wrap toggle
- Minimap toggle
- Ctrl+S to save

### ⚡ Real-Time Collaboration (Socket.IO)
- Live typing synchronization
- **Colored remote cursors** with usernames
- **Remote selection highlights**
- User presence (who's online, what file they're editing)
- Real-time file tree sync (create/delete/rename/move)
- Project rooms (only team members can join)
- Auto-save with 2-second debounce
- Team chat

### 🎨 Theme System
- **UI Themes**: Dark, Light, Midnight (GitHub), Ocean
- **Editor Themes**: VS Dark, VS Light, High Contrast
- Persistent preferences (localStorage)
- Smooth theme transitions

### 🔒 Security
- JWT verification middleware
- WebSocket JWT authentication
- Role-based permission checks
- MongoDB query sanitization
- API rate limiting
- Helmet.js security headers
- Input validation

---

## 📁 Project Structure

```
collaborative-editor/
├── backend/
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── teamController.js
│   │   ├── projectController.js
│   │   └── fileController.js
│   ├── middleware/
│   │   ├── auth.js          # JWT middleware
│   │   └── validation.js    # Input validation
│   ├── models/
│   │   ├── User.js
│   │   ├── Team.js
│   │   ├── Project.js
│   │   └── File.js
│   ├── routes/
│   │   └── index.js
│   ├── sockets/
│   │   └── collaboration.js  # Socket.IO events
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── app.js           # Auth, API, Teams, Socket
│   ├── editor.js        # Monaco Editor manager
│   ├── fileExplorer.js  # File tree, drag-drop
│   └── themeManager.js  # Theme system
├── Dockerfile
├── docker-compose.yml
├── mongo-init.js
└── README.md
```

---

## 🛠️ Setup Instructions

### Prerequisites
- Node.js 18+
- MongoDB 6.0+
- npm or yarn

### Option 1: Local Development

```bash
# 1. Clone and navigate
git clone <your-repo>
cd collaborative-editor

# 2. Install backend dependencies
cd backend
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your values:
#   MONGODB_URI=mongodb://localhost:27017/collaborative_editor
#   JWT_SECRET=your_super_secret_minimum_32_chars
#   PORT=3001

# 4. Start MongoDB locally (or use Atlas)
mongod

# 5. Start the server
npm start
# Or for development with auto-reload:
npm run dev

# 6. Open browser
open http://localhost:3001
```

### Option 2: Docker Compose (Recommended)

```bash
# 1. Set JWT secret
export JWT_SECRET=your_super_secret_minimum_32_chars

# 2. Start all services
docker-compose up -d

# 3. Open browser
open http://localhost:3001

# 4. Optional: MongoDB admin UI
docker-compose --profile debug up -d
open http://localhost:8081  # admin/admin123
```

### Option 3: Docker only (bring your own MongoDB)

```bash
docker build -t codesync .
docker run -d \
  -p 3001:3001 \
  -e MONGODB_URI=mongodb://your-mongo:27017/collaborative_editor \
  -e JWT_SECRET=your_secret \
  codesync
```

---

## 🌐 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `MONGODB_URI` | `mongodb://localhost:27017/collaborative_editor` | MongoDB connection string |
| `JWT_SECRET` | *(required)* | Secret for JWT signing (min 32 chars) |
| `JWT_EXPIRES_IN` | `7d` | JWT token expiry |
| `NODE_ENV` | `development` | Environment mode |
| `FRONTEND_URL` | `http://localhost:3000` | Allowed CORS origin |

---

## 📡 API Endpoints

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET  | `/api/auth/me` | Get current user |
| PUT  | `/api/auth/profile` | Update profile |

### Teams
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/teams` | Create team |
| GET  | `/api/teams` | Get my teams |
| GET  | `/api/teams/:id` | Get team details |
| POST | `/api/teams/join/:inviteCode` | Join via invite |
| POST | `/api/teams/:id/invite/regenerate` | New invite code |
| PUT  | `/api/teams/:id/members/:userId/role` | Change role |
| DELETE | `/api/teams/:id/members/:userId` | Remove member |

### Projects
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/teams/:teamId/projects` | Create project |
| GET  | `/api/teams/:teamId/projects` | List projects |
| GET  | `/api/projects/:id` | Get project |
| DELETE | `/api/projects/:id` | Delete project |

### Files
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/projects/:id/files` | Get file tree |
| GET  | `/api/files/:id` | Get file with content |
| POST | `/api/projects/:id/files` | Create file/folder |
| PUT  | `/api/files/:id` | Update content/rename |
| DELETE | `/api/files/:id` | Delete file/folder |
| PUT  | `/api/files/:id/move` | Move file/folder |

---

## 🔌 Socket.IO Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join:project` | `{ projectId }` | Join project room |
| `leave:project` | `{ projectId }` | Leave project room |
| `file:change` | `{ projectId, fileId, content }` | Broadcast typing |
| `file:save` | `{ projectId, fileId, content }` | Save to DB |
| `cursor:update` | `{ projectId, fileId, position, selection }` | Cursor move |
| `file:active` | `{ projectId, fileId, fileName }` | File opened |
| `filetree:change` | `{ projectId, action, data }` | Tree modified |
| `chat:message` | `{ projectId, message }` | Send chat |

### Server → Client
| Event | Description |
|-------|-------------|
| `presence:list` | Initial user list |
| `presence:update` | Updated presence |
| `presence:joined` | User joined |
| `presence:left` | User left |
| `file:changed` | External content change |
| `file:saved` | File was saved |
| `filetree:changed` | File tree updated |
| `cursor:moved` | Remote cursor moved |
| `chat:message` | Incoming chat message |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save current file |
| `Ctrl+P` | Open command palette |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+W` | Close current tab |
| `Escape` | Close modals / menus |
| Double-click file | Rename file |

---

## 🚀 Production Deployment

### MongoDB Atlas (Cloud)
1. Create a free cluster at [mongodb.com/atlas](https://mongodb.com/atlas)
2. Get connection string
3. Set `MONGODB_URI` in environment

### Deploy to Railway
```bash
railway login
railway init
railway add --plugin mongodb
railway up
```

### Deploy to Render
1. Connect GitHub repo
2. Set environment variables
3. Build command: `cd backend && npm install`
4. Start command: `cd backend && node server.js`

### Deploy to Fly.io
```bash
fly launch
fly secrets set JWT_SECRET=your_secret
fly secrets set MONGODB_URI=your_mongo_uri
fly deploy
```

---

## 📝 Notes

- File content is stored in MongoDB (suitable for code files)
- Real-time collaboration uses last-write-wins (for production, consider CRDT/OT)
- WebSocket connections are authenticated via JWT
- All API routes require authentication except register/login
- Rate limiting: 200 req/15min (API), 20 req/15min (auth)

---

## 📄 License

MIT License — Free to use and modify.
