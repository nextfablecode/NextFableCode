// ============================================
// CODESYNC — MAIN APP
// Authentication, API, Teams, Projects
// ============================================

const API_BASE = '/api';
let currentUser = null;
let currentTeam = null;
let currentProject = null;
let socket = null;
let autoSaveEnabled = true;

// ============================================
// API HELPERS
// ============================================

const api = {
  async request(method, path, body = null) {
    const token = localStorage.getItem('token');
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${path}`, opts);
    const data = await res.json();
    if (!data.success && res.status === 401) {
      handleUnauthorized();
    }
    return data;
  },
  get: (path) => api.request('GET', path),
  post: (path, body) => api.request('POST', path, body),
  put: (path, body) => api.request('PUT', path, body),
  delete: (path) => api.request('DELETE', path),
};

function handleUnauthorized() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  currentUser = null;
  showAuth();
}

// ============================================
// AUTH
// ============================================

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.querySelector('#login-form .btn-primary');

  errEl.textContent = '';
  setButtonLoading(btn, true);

  const data = await api.post('/auth/login', { email, password });
  setButtonLoading(btn, false);

  if (!data.success) {
    errEl.textContent = data.message || 'Login failed';
    return;
  }

  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  currentUser = data.user;

  showApp();
  await loadDashboard();
  // Handle pending invite after login
  await handlePendingInvite();
}

async function handleRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl = document.getElementById('register-error');
  const btn = document.querySelector('#register-form .btn-primary');

  errEl.textContent = '';
  setButtonLoading(btn, true);

  const data = await api.post('/auth/register', { username, email, password });
  setButtonLoading(btn, false);

  if (!data.success) {
    errEl.textContent = data.message || 'Registration failed';
    return;
  }

  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  currentUser = data.user;

  showApp();
  await loadDashboard();
  // Handle pending invite after register
  await handlePendingInvite();
}

async function handleLogout() {
  await api.post('/auth/logout');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  currentUser = null;
  if (socket) { socket.disconnect(); socket = null; }
  closeAllModals();
  document.getElementById('user-dropdown').classList.add('hidden');
  showAuth();
}

function switchAuth(mode) {
  document.getElementById('login-form').classList.toggle('hidden', mode !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', mode !== 'register');
  document.getElementById('login-error').textContent = '';
  document.getElementById('register-error').textContent = '';
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  input.type = input.type === 'password' ? 'text' : 'password';
}

// ============================================
// APP INITIALIZATION
// ============================================

async function init() {
  const token = localStorage.getItem('token');
  const userData = localStorage.getItem('user');

  if (token && userData) {
    currentUser = JSON.parse(userData);
    // Verify token is still valid
    const data = await api.get('/auth/me');
    if (data.success) {
      currentUser = data.user;
      localStorage.setItem('user', JSON.stringify(data.user));
      showApp();
      await loadDashboard();
      // Check if user came from an invite link
      await checkInviteLink();
      // Handle pending invite from before login
      await handlePendingInvite();
    } else {
      showAuth();
    }
  } else {
    showAuth();
    // Check invite link even before login — saves code for after
    checkInviteLink();
  }

  setupKeyboardShortcuts();
  setupResizableSidebars();
  themeManager.init();
}

function showAuth() {
  document.getElementById('auth-overlay').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  updateTopbarUser();
}

function updateTopbarUser() {
  if (!currentUser) return;
  const initial = currentUser.username[0].toUpperCase();
  const color = currentUser.color || '#6366f1';

  document.getElementById('topbar-username').textContent = currentUser.username;
  const av = document.getElementById('topbar-avatar');
  av.textContent = initial;
  av.style.background = color;

  const dAv = document.getElementById('dropdown-avatar');
  dAv.textContent = initial;
  dAv.style.background = color;

  document.getElementById('dropdown-name').textContent = currentUser.username;
  document.getElementById('dropdown-email').textContent = currentUser.email;

  // Pre-fill settings
  const usernameInput = document.getElementById('setting-username');
  if (usernameInput) usernameInput.value = currentUser.username;
}

// ============================================
// DASHBOARD
// ============================================

async function loadDashboard() {
  showDashboard();
  const data = await api.get('/teams');
  const grid = document.getElementById('teams-grid');

  if (!data.success) {
    grid.innerHTML = '<div class="activity-empty">Failed to load teams</div>';
    return;
  }

  if (data.teams.length === 0) {
    grid.innerHTML = `
      <div class="team-card" onclick="showCreateTeamModal()" style="border-style:dashed; text-align:center; padding:32px 20px;">
        <div style="font-size:32px;margin-bottom:8px">+</div>
        <div class="card-title">Create your first team</div>
        <div class="card-desc">Get started by creating a team</div>
      </div>`;
    return;
  }

  grid.innerHTML = data.teams.map(team => {
    const memberCount = team.members.length;
    const userRole = team.members.find(m => m.user?._id === currentUser?._id || m.user === currentUser?._id)?.role || 'member';
    return `
      <div class="team-card" onclick="openTeam('${team._id}')" style="--card-color: ${team.color}">
        <div class="card-icon" style="background:${team.color}20">${team.name[0].toUpperCase()}</div>
        <div class="card-title">${escapeHtml(team.name)}</div>
        <div class="card-desc">${escapeHtml(team.description || 'No description')}</div>
        <div class="card-meta">
          <div class="card-meta-item">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            ${memberCount} member${memberCount !== 1 ? 's' : ''}
          </div>
          <div class="card-meta-item" style="margin-left:auto; text-transform:capitalize;">${userRole}</div>
        </div>
      </div>`;
  }).join('');
}

function showDashboard() {
  document.getElementById('dashboard-view').classList.remove('hidden');
  document.getElementById('project-view').classList.add('hidden');
  document.getElementById('editor-view').classList.add('hidden');
  document.getElementById('topbar-team').textContent = 'Select Team';
  document.getElementById('topbar-project').textContent = 'Select Project';
  currentTeam = null;
  currentProject = null;
  if (socket && socket.connected) {
    socket.emit('leave:project', { projectId: currentProject?._id });
  }
}

// ============================================
// TEAMS
// ============================================

async function openTeam(teamId) {
  const data = await api.get(`/teams/${teamId}`);
  if (!data.success) { showToast('Failed to load team', 'error'); return; }

  currentTeam = data.team;
  document.getElementById('topbar-team').textContent = currentTeam.name;
  document.getElementById('team-name-header').textContent = currentTeam.name;
  document.getElementById('team-desc-header').textContent = currentTeam.description || '';

  // Load members in right sidebar
  renderTeamMembers(currentTeam.members);

  // Show project view
  document.getElementById('dashboard-view').classList.add('hidden');
  document.getElementById('project-view').classList.remove('hidden');
  document.getElementById('editor-view').classList.add('hidden');

  await loadProjects(teamId);
}

async function loadProjects(teamId) {
  const data = await api.get(`/teams/${teamId}/projects`);
  const grid = document.getElementById('projects-grid');

  if (!data.success) {
    grid.innerHTML = '<div class="activity-empty">Failed to load projects</div>';
    return;
  }

  if (data.projects.length === 0) {
    grid.innerHTML = `
      <div class="project-card" onclick="showCreateProjectModal()" style="border-style:dashed; text-align:center; padding:32px 20px;">
        <div style="font-size:32px;margin-bottom:8px">+</div>
        <div class="card-title">Create first project</div>
        <div class="card-desc">Start a new coding project</div>
      </div>`;
    return;
  }

  const langIcons = {
    javascript: '🟨', typescript: '🔷', python: '🐍', go: '🔵',
    rust: '🦀', java: '☕', cpp: '⚡', html: '🌐', other: '📄'
  };

  grid.innerHTML = data.projects.map(project => {
    const icon = langIcons[project.language] || '📄';
    return `
      <div class="project-card" onclick="openProject('${project._id}')">
        <div class="card-icon">${icon}</div>
        <div class="card-title">${escapeHtml(project.name)}</div>
        <div class="card-desc">${escapeHtml(project.description || 'No description')}</div>
        <div class="card-meta">
          <div class="card-meta-item">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${formatDate(project.updatedAt)}
          </div>
          <div class="card-meta-item" style="margin-left:auto; text-transform:capitalize;">${project.language}</div>
        </div>
      </div>`;
  }).join('');
}

// ============================================
// PROJECT / EDITOR
// ============================================

async function openProject(projectId) {
  const data = await api.get(`/projects/${projectId}`);
  if (!data.success) { showToast('Failed to load project', 'error'); return; }

  currentProject = data.project;
  document.getElementById('topbar-project').textContent = currentProject.name;
  document.getElementById('explorer-project-name').textContent = currentProject.name.toUpperCase();

  // Show editor view
  document.getElementById('dashboard-view').classList.add('hidden');
  document.getElementById('project-view').classList.add('hidden');
  document.getElementById('editor-view').classList.remove('hidden');

  // Connect socket
  connectSocket();

  // Load file tree
  await refreshFileTree();

  // Load editor
  editorManager.init();

  addActivity(`📂 Opened project "${currentProject.name}"`);
}

// ============================================
// TEAMS MODALS
// ============================================

function showJoinTeamModal() {
  document.getElementById('join-team-input').value = '';
  document.getElementById('join-team-error').textContent = '';
  openModal('modal-join-team');
}

async function confirmJoinTeam() {
  const input = document.getElementById('join-team-input').value.trim();
  const errEl = document.getElementById('join-team-error');
  errEl.textContent = '';

  if (!input) { errEl.textContent = 'Please enter an invite link or code'; return; }

  // Extract code from full URL or use as-is
  let inviteCode = input;
  const urlMatch = input.match(/\/join\/([a-f0-9-]+)/i);
  if (urlMatch) inviteCode = urlMatch[1];

  const data = await api.post(`/teams/join/${inviteCode}`);
  if (!data.success) {
    errEl.textContent = data.message || 'Invalid or expired invite link';
    return;
  }

  showToast(`✅ Joined team "${data.team.name}"!`, 'success');
  closeAllModals();
  await loadDashboard();
}

function showCreateTeamModal() {
  document.getElementById('new-team-name').value = '';
  document.getElementById('new-team-desc').value = '';
  document.getElementById('create-team-error').textContent = '';
  openModal('modal-create-team');
}

async function createTeam() {
  const name = document.getElementById('new-team-name').value.trim();
  const description = document.getElementById('new-team-desc').value.trim();
  const errEl = document.getElementById('create-team-error');

  if (!name) { errEl.textContent = 'Team name is required'; return; }
  errEl.textContent = '';

  const data = await api.post('/teams', { name, description });
  if (!data.success) { errEl.textContent = data.message; return; }

  showToast(`Team "${name}" created!`, 'success');
  closeAllModals();
  await loadDashboard();
}

function showCreateProjectModal() {
  document.getElementById('new-project-name').value = '';
  document.getElementById('new-project-desc').value = '';
  document.getElementById('create-project-error').textContent = '';
  openModal('modal-create-project');
}

async function createProject() {
  const name = document.getElementById('new-project-name').value.trim();
  const description = document.getElementById('new-project-desc').value.trim();
  const language = document.getElementById('new-project-lang').value;
  const errEl = document.getElementById('create-project-error');

  if (!name) { errEl.textContent = 'Project name is required'; return; }
  errEl.textContent = '';

  const data = await api.post(`/teams/${currentTeam._id}/projects`, { name, description, language });
  if (!data.success) { errEl.textContent = data.message; return; }

  showToast(`Project "${name}" created!`, 'success');
  closeAllModals();
  await loadProjects(currentTeam._id);
}

async function showInviteModal() {
  if (!currentTeam) return;

  const data = await api.get(`/teams/${currentTeam._id}`);
  if (!data.success) return;

  const inviteUrl = `${window.location.origin}/join/${data.team.inviteCode}`;
  document.getElementById('invite-link-input').value = inviteUrl;
  openModal('modal-invite');
}

function copyInviteLink() {
  const input = document.getElementById('invite-link-input');
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Invite link copied!', 'success');
  });
}

async function regenerateInvite() {
  if (!currentTeam) return;
  const data = await api.post(`/teams/${currentTeam._id}/invite/regenerate`);
  if (data.success) {
    const inviteUrl = `${window.location.origin}/join/${data.inviteCode}`;
    document.getElementById('invite-link-input').value = inviteUrl;
    showToast('New invite link generated', 'success');
  }
}

// ============================================
// SETTINGS
// ============================================

function openSettings() {
  document.getElementById('user-dropdown').classList.add('hidden');
  openModal('modal-settings');
}

function switchSettingsTab(tab, btn) {
  document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`settings-${tab}`).classList.add('active');
  btn.classList.add('active');
}

function updateEditorSetting(setting, value) {
  editorManager.updateOption(setting, value);
}

function toggleAutoSave(enabled) {
  autoSaveEnabled = enabled;
  showToast(`Auto-save ${enabled ? 'enabled' : 'disabled'}`, 'info');
}

async function saveAccountSettings() {
  const username = document.getElementById('setting-username').value.trim();
  const errEl = document.getElementById('settings-account-error');
  errEl.textContent = '';

  const data = await api.put('/auth/profile', { username });
  if (!data.success) { errEl.textContent = data.message; return; }

  currentUser = data.user;
  localStorage.setItem('user', JSON.stringify(data.user));
  updateTopbarUser();
  showToast('Profile updated!', 'success');
}

// ============================================
// SOCKET.IO — REAL-TIME COLLABORATION
// ============================================

function connectSocket() {
  const token = localStorage.getItem('token');
  if (!token) return;

  if (socket) { socket.disconnect(); }

  socket = io({ auth: { token } });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    updateConnectionStatus(true);
    if (currentProject) {
      socket.emit('join:project', { projectId: currentProject._id });
    }
  });

  socket.on('disconnect', () => {
    updateConnectionStatus(false);
    addActivity('❌ Disconnected from collaboration server');
  });

  socket.on('connect_error', (err) => {
    console.error('Socket error:', err.message);
    updateConnectionStatus(false);
  });

  // Presence events
  socket.on('presence:list', (users) => {
    updateOnlineUsers(users);
  });

  socket.on('presence:update', (users) => {
    updateOnlineUsers(users);
    updateActiveUsersBar(users);
  });

  socket.on('presence:joined', (data) => {
    addActivity(`👋 ${data.username} joined`);
    showToast(`${data.username} joined the project`, 'info');
  });

  socket.on('presence:left', (data) => {
    addActivity(`🚪 ${data.username} left`);
  });

  // File events
  socket.on('file:changed', (data) => {
    editorManager.applyExternalChange(data);
  });

  socket.on('file:saved', (data) => {
    addActivity(`💾 ${data.savedBy} saved a file`);
    updateSaveStatus('Saved', false);
  });

  socket.on('filetree:changed', async (data) => {
    addActivity(`📁 ${data.username} ${data.action}d a file`);
    await refreshFileTree();
  });

  // Cursor events
  socket.on('cursor:moved', (data) => {
    editorManager.updateRemoteCursor(data);
  });

  // Chat
  socket.on('chat:message', (msg) => {
    appendChatMessage(msg);
  });

  // Generic error
  socket.on('error', (err) => {
    showToast(err.message, 'error');
  });
}

function updateConnectionStatus(connected) {
  const el = document.getElementById('status-connection');
  const text = document.getElementById('status-connection-text');
  el.classList.toggle('connected', connected);
  el.classList.toggle('disconnected', !connected);
  text.textContent = connected ? 'Connected' : 'Disconnected';
}

function updateOnlineUsers(users) {
  const onlineEl = document.getElementById('online-members');
  const allEl = document.getElementById('all-members');

  // Online members
  onlineEl.innerHTML = users.map(u => `
    <div class="member-item">
      <div class="member-avatar" style="background:${u.color}">
        ${u.username[0].toUpperCase()}
        <div class="member-online-dot"></div>
      </div>
      <div class="member-info">
        <div class="member-name">${escapeHtml(u.username)}</div>
        <div class="member-status">${u.activeFile ? `Editing: ${escapeHtml(u.activeFile.fileName || 'file')}` : 'Browsing'}</div>
      </div>
    </div>`).join('') || '<div class="activity-empty">No one online</div>';

  // Status bar collaborators
  const collabEl = document.getElementById('status-collaborators');
  if (users.length > 1) {
    collabEl.textContent = `${users.length} collaborators`;
  } else {
    collabEl.textContent = '';
  }
}

function updateActiveUsersBar(users) {
  const bar = document.getElementById('active-users-bar');
  bar.innerHTML = users.slice(0, 5).map(u => `
    <div class="active-user-avatar" style="background:${u.color}" title="${escapeHtml(u.username)}">
      ${u.username[0].toUpperCase()}
    </div>`).join('');
}

function renderTeamMembers(members) {
  const allEl = document.getElementById('all-members');
  allEl.innerHTML = members.map(m => {
    const user = m.user || m;
    const name = user.username || 'Unknown';
    const color = user.color || '#6366f1';
    return `
      <div class="member-item">
        <div class="member-avatar" style="background:${color}">${name[0].toUpperCase()}</div>
        <div class="member-info">
          <div class="member-name">${escapeHtml(name)}</div>
          <div class="member-status">${m.role}</div>
        </div>
        <div class="member-role">${m.role}</div>
      </div>`;
  }).join('');
}

// ============================================
// CHAT
// ============================================

function handleChatKey(e) {
  if (e.key === 'Enter') sendChatMessage();
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg || !socket || !currentProject) return;

  socket.emit('chat:message', { projectId: currentProject._id, message: msg });
  input.value = '';
}

function appendChatMessage(msg) {
  const container = document.getElementById('chat-messages');
  const isMe = msg.userId === currentUser?._id;
  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const el = document.createElement('div');
  el.className = 'chat-msg';
  el.innerHTML = `
    <div class="chat-msg-header">
      <span class="chat-msg-user" style="color:${msg.color}">${escapeHtml(msg.username)}</span>
      <span class="chat-msg-time">${time}</span>
    </div>
    <div class="chat-msg-text">${escapeHtml(msg.message)}</div>`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

// ============================================
// ACTIVITY LOG
// ============================================

function addActivity(text) {
  const log = document.getElementById('activity-log');
  const empty = log.querySelector('.activity-empty');
  if (empty) empty.remove();

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const el = document.createElement('div');
  el.className = 'activity-item';
  el.innerHTML = `
    <span class="activity-time">${time}</span>
    <span>${text}</span>`;

  log.insertBefore(el, log.firstChild);

  // Limit to 50 entries
  const items = log.querySelectorAll('.activity-item');
  if (items.length > 50) items[items.length - 1].remove();
}

// ============================================
// RIGHT SIDEBAR TABS
// ============================================

function switchRightTab(tab, btn) {
  document.querySelectorAll('.right-panel').forEach(p => {
    p.classList.remove('active');
    p.classList.add('hidden');
  });
  document.querySelectorAll('.sidebar-tab').forEach(b => b.classList.remove('active'));

  const panel = document.getElementById(`panel-${tab}`);
  panel.classList.remove('hidden');
  panel.classList.add('active');
  btn.classList.add('active');
}

// ============================================
// STATUS BAR
// ============================================

function updateSaveStatus(text, isModified) {
  const el = document.getElementById('status-save');
  el.textContent = isModified ? '● Unsaved' : text;
  el.style.color = isModified ? 'var(--warning)' : '';
}

function updateCursorStatus(line, col) {
  document.getElementById('status-cursor').textContent = `Ln ${line}, Col ${col}`;
}

function updateLanguageStatus(lang) {
  document.getElementById('status-language').textContent = lang || 'Plain Text';
}

// ============================================
// MODAL HELPERS
// ============================================

function openModal(id) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById(id).classList.remove('hidden');
  setTimeout(() => {
    const input = document.querySelector(`#${id} input:not([type="checkbox"]):not([type="radio"]):not([readonly])`);
    if (input) input.focus();
  }, 50);
}

function closeAllModals() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function closeModal(e) {
  if (e.target === document.getElementById('modal-overlay')) closeAllModals();
}

// ============================================
// COMMAND PALETTE
// ============================================

const commands = [
  { name: 'New File', icon: '📄', action: () => promptCreateFile(), shortcut: 'Ctrl+N' },
  { name: 'New Folder', icon: '📁', action: () => promptCreateFolder(), shortcut: '' },
  { name: 'Save File', icon: '💾', action: () => editorManager.saveCurrentFile(), shortcut: 'Ctrl+S' },
  { name: 'Close Tab', icon: '✕', action: () => editorManager.closeCurrentTab(), shortcut: 'Ctrl+W' },
  { name: 'Settings', icon: '⚙️', action: () => openSettings(), shortcut: '' },
  { name: 'Toggle Sidebar', icon: '◧', action: () => toggleSidebar(), shortcut: 'Ctrl+B' },
  { name: 'Switch to Dark Theme', icon: '🌙', action: () => setUITheme('dark'), shortcut: '' },
  { name: 'Switch to Light Theme', icon: '☀️', action: () => setUITheme('light'), shortcut: '' },
  { name: 'Switch to Midnight Theme', icon: '🌌', action: () => setUITheme('midnight'), shortcut: '' },
  { name: 'Go to Dashboard', icon: '🏠', action: () => showDashboard(), shortcut: '' },
  { name: 'Refresh File Tree', icon: '🔄', action: () => refreshFileTree(), shortcut: '' },
];

let commandHighlight = 0;

function openCommandPalette() {
  document.getElementById('command-palette-overlay').classList.remove('hidden');
  document.getElementById('command-input').value = '';
  commandHighlight = 0;
  filterCommands('');
  document.getElementById('command-input').focus();
}

function closeCommandPalette(e) {
  if (e && e.target !== document.getElementById('command-palette-overlay')) return;
  document.getElementById('command-palette-overlay').classList.add('hidden');
}

function filterCommands(query) {
  const list = document.getElementById('command-list');
  const filtered = commands.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
  commandHighlight = 0;

  list.innerHTML = filtered.map((c, i) => `
    <div class="command-item ${i === 0 ? 'highlighted' : ''}" onclick="runCommand(${commands.indexOf(c)})">
      <span>${c.icon}</span>
      <span class="command-item-name">${c.name}</span>
      <span class="command-item-shortcut">${c.shortcut}</span>
    </div>`).join('');
}

function handleCommandKey(e) {
  const items = document.querySelectorAll('.command-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    commandHighlight = Math.min(commandHighlight + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('highlighted', i === commandHighlight));
    items[commandHighlight]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    commandHighlight = Math.max(commandHighlight - 1, 0);
    items.forEach((el, i) => el.classList.toggle('highlighted', i === commandHighlight));
    items[commandHighlight]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    const query = document.getElementById('command-input').value;
    const filtered = commands.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
    if (filtered[commandHighlight]) {
      filtered[commandHighlight].action();
      document.getElementById('command-palette-overlay').classList.add('hidden');
    }
  } else if (e.key === 'Escape') {
    document.getElementById('command-palette-overlay').classList.add('hidden');
  }
}

function runCommand(index) {
  commands[index]?.action();
  document.getElementById('command-palette-overlay').classList.add('hidden');
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'p':
          if (!e.shiftKey) { e.preventDefault(); openCommandPalette(); }
          break;
        case 's':
          e.preventDefault();
          editorManager.saveCurrentFile();
          break;
        case 'b':
          e.preventDefault();
          toggleSidebar();
          break;
        case 'w':
          e.preventDefault();
          editorManager.closeCurrentTab();
          break;
      }
    }
    if (e.key === 'Escape') {
      closeAllModals();
      document.getElementById('command-palette-overlay').classList.add('hidden');
      document.getElementById('user-dropdown').classList.add('hidden');
      document.getElementById('context-menu').classList.add('hidden');
    }
  });
}

// ============================================
// SIDEBAR TOGGLE & RESIZE
// ============================================

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar-left');
  sidebar.style.display = sidebar.style.display === 'none' ? '' : 'none';
}

function setupResizableSidebars() {
  // Could implement drag-resize here
}

// ============================================
// USER MENU
// ============================================

function toggleUserMenu() {
  const dropdown = document.getElementById('user-dropdown');
  dropdown.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.user-menu') && !e.target.closest('.user-dropdown')) {
    document.getElementById('user-dropdown').classList.add('hidden');
  }
  if (!e.target.closest('.context-menu') && !e.target.closest('.tree-item-row')) {
    document.getElementById('context-menu').classList.add('hidden');
  }
});

// ============================================
// TOAST NOTIFICATIONS
// ============================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `
    <span>${icons[type] || 'ℹ️'}</span>
    <span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

// ============================================
// JOIN TEAM BY INVITE LINK
// ============================================

async function checkInviteLink() {
  // Works for both /join/CODE and ?invite=CODE formats
  const pathMatch = window.location.pathname.match(/^\/join\/([a-f0-9-]+)$/i);
  const paramMatch = new URLSearchParams(window.location.search).get('invite');
  const inviteCode = pathMatch ? pathMatch[1] : paramMatch;

  if (!inviteCode) return;

  if (!currentUser) {
    // Save invite code and show login/register
    localStorage.setItem('pendingInvite', inviteCode);
    showToast('Please login or register to join the team', 'info');
    return;
  }

  // User is logged in — join immediately
  await joinTeamByCode(inviteCode);
}

async function handlePendingInvite() {
  const inviteCode = localStorage.getItem('pendingInvite');
  if (!inviteCode || !currentUser) return;
  localStorage.removeItem('pendingInvite');
  await joinTeamByCode(inviteCode);
}

async function joinTeamByCode(inviteCode) {
  const data = await api.post(`/teams/join/${inviteCode}`);
  if (data.success) {
    showToast(`✅ Joined team "${data.team.name}" successfully!`, 'success');
    history.pushState({}, '', '/');
    await loadDashboard();
  } else {
    showToast(data.message || 'Invalid or expired invite link', 'error');
    history.pushState({}, '', '/');
  }
}

// ============================================
// UTILITIES
// ============================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

function setButtonLoading(btn, loading) {
  const span = btn.querySelector('span');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled = loading;
  if (loading) {
    if (span) span.classList.add('hidden');
    if (loader) loader.classList.remove('hidden');
  } else {
    if (span) span.classList.remove('hidden');
    if (loader) loader.classList.add('hidden');
  }
}

// Start the app
window.addEventListener('DOMContentLoaded', init);