// ============================================
// CODESYNC — FILE EXPLORER
// VS Code-style drag-and-drop file tree
// ============================================

let fileTree = [];        // flat list from API
let expandedFolders = new Set();
let contextMenuTarget = null;   // { file, type }
let dragSource = null;

// ============================================
// LOAD & RENDER FILE TREE
// ============================================

async function refreshFileTree() {
  if (!currentProject) return;

  const data = await api.get(`/projects/${currentProject._id}/files`);
  if (!data.success) {
    showToast('Failed to load files', 'error');
    return;
  }

  fileTree = data.files;
  renderFileTree(data.tree);
}

function renderFileTree(tree) {
  const container = document.getElementById('file-tree');
  if (!tree || tree.length === 0) {
    container.innerHTML = `
      <div style="padding:16px 12px; color: var(--text-muted); font-size:12px; text-align:center;">
        <div style="margin-bottom:8px">📂 No files yet</div>
        <div>Right-click or use toolbar to create files</div>
      </div>`;
    return;
  }

  container.innerHTML = renderTreeNodes(tree, 0);
  setupDragDrop();
}

function renderTreeNodes(nodes, depth) {
  return nodes
    .sort((a, b) => {
      // Folders first, then alphabetical
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map(node => renderTreeNode(node, depth))
    .join('');
}

function renderTreeNode(node, depth) {
  const indent = depth * 16;
  const isFolder = node.type === 'folder';
  const isExpanded = expandedFolders.has(node._id);
  const isActive = editorManager.tabs.find(t => t.fileId === node._id && t.id === editorManager.activeTabId);
  const isOpen = editorManager.tabs.find(t => t.fileId === node._id);
  const ext = node.name.split('.').pop()?.toLowerCase();
  const extClass = ext ? `ext-${ext}` : '';
  const icon = isFolder
    ? (isExpanded ? getFolderOpenIcon() : getFolderIcon())
    : getFileIconSvg(node.name);

  return `
    <div class="tree-item" data-id="${node._id}" data-type="${node.type}" draggable="true">
      <div class="tree-item-row ${isActive ? 'active' : ''} ${isOpen && !isActive ? 'selected' : ''}"
           style="padding-left: ${indent + 6}px"
           onclick="onTreeItemClick(event, '${node._id}', '${node.type}')"
           oncontextmenu="onTreeContextMenu(event, '${node._id}')"
           ondragstart="onDragStart(event, '${node._id}')"
           ondragover="onDragOver(event)"
           ondrop="onDrop(event, '${node._id}')">

        <!-- Toggle arrow for folders -->
        <div class="tree-toggle ${isFolder ? '' : 'invisible'} ${isExpanded ? 'open' : ''}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>

        <!-- File/Folder icon -->
        <div class="tree-icon ${extClass}">${icon}</div>

        <!-- Name -->
        <span class="tree-name" title="${escapeHtml(node.name)}">${escapeHtml(node.name)}</span>
      </div>

      <!-- Children (if folder and expanded) -->
      ${isFolder && isExpanded && node.children?.length > 0
        ? `<div class="tree-children">${renderTreeNodes(node.children, depth + 1)}</div>`
        : ''}
    </div>`;
}

// ============================================
// TREE INTERACTIONS
// ============================================

async function onTreeItemClick(event, fileId, type) {
  event.stopPropagation();

  if (type === 'folder') {
    // Toggle expand/collapse
    if (expandedFolders.has(fileId)) {
      expandedFolders.delete(fileId);
    } else {
      expandedFolders.add(fileId);
    }
    const data = await api.get(`/projects/${currentProject._id}/files`);
    if (data.success) renderFileTree(data.tree);
    return;
  }

  // Open file
  const file = fileTree.find(f => f._id === fileId);
  if (!file) return;

  // Fetch full file with content
  const fileData = await api.get(`/files/${fileId}`);
  if (!fileData.success) {
    showToast('Failed to open file', 'error');
    return;
  }

  editorManager.openFile(
    fileData.file._id,
    fileData.file.name,
    fileData.file.content,
    fileData.file.language
  );
}

// ============================================
// CONTEXT MENU
// ============================================

function onTreeContextMenu(event, fileId) {
  event.preventDefault();
  event.stopPropagation();

  contextMenuTarget = fileTree.find(f => f._id === fileId);
  if (!contextMenuTarget) return;

  const menu = document.getElementById('context-menu');
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 200)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - 180)}px`;
  menu.classList.remove('hidden');
}

function contextMenuAction(action) {
  document.getElementById('context-menu').classList.add('hidden');

  if (!contextMenuTarget) return;

  switch (action) {
    case 'new-file':
      promptCreateFile(contextMenuTarget.type === 'folder' ? contextMenuTarget._id : contextMenuTarget.parent);
      break;
    case 'new-folder':
      promptCreateFolder(contextMenuTarget.type === 'folder' ? contextMenuTarget._id : contextMenuTarget.parent);
      break;
    case 'rename':
      promptRename(contextMenuTarget._id, contextMenuTarget.name);
      break;
    case 'delete':
      confirmDelete(contextMenuTarget._id, contextMenuTarget.name, contextMenuTarget.type);
      break;
  }
}

// ============================================
// CREATE FILE / FOLDER
// ============================================

let pendingCreate = null; // { type, parentId }

function promptCreateFile(parentId = null) {
  pendingCreate = { type: 'file', parentId };
  document.getElementById('create-file-title').textContent = 'New File';
  document.getElementById('create-file-label').textContent = 'File name';
  document.getElementById('new-file-name').value = '';
  document.getElementById('create-file-error').textContent = '';
  openModal('modal-create-file');
}

function promptCreateFolder(parentId = null) {
  pendingCreate = { type: 'folder', parentId };
  document.getElementById('create-file-title').textContent = 'New Folder';
  document.getElementById('create-file-label').textContent = 'Folder name';
  document.getElementById('new-file-name').value = '';
  document.getElementById('create-file-error').textContent = '';
  openModal('modal-create-file');
}

async function confirmCreateFile() {
  if (!pendingCreate) return;

  const name = document.getElementById('new-file-name').value.trim();
  const errEl = document.getElementById('create-file-error');

  if (!name) { errEl.textContent = 'Name is required'; return; }
  if (/[/\\:*?"<>|]/.test(name)) { errEl.textContent = 'Name contains invalid characters'; return; }

  errEl.textContent = '';

  const data = await api.post(`/projects/${currentProject._id}/files`, {
    name,
    type: pendingCreate.type,
    parentId: pendingCreate.parentId || null,
    content: ''
  });

  if (!data.success) { errEl.textContent = data.message; return; }

  closeAllModals();
  pendingCreate = null;

  // Auto-expand parent folder
  if (data.file.parent) expandedFolders.add(data.file.parent.toString());

  await refreshFileTree();

  // Broadcast to collaborators
  if (socket && currentProject) {
    socket.emit('filetree:change', {
      projectId: currentProject._id,
      action: 'create',
      data: { id: data.file._id, name, type: pendingCreate?.type || 'file' }
    });
  }

  addActivity(`✨ Created ${pendingCreate?.type || 'file'}: ${name}`);
  showToast(`${name} created`, 'success');

  // Open file immediately if it's a file
  if (data.file.type === 'file') {
    editorManager.openFile(data.file._id, data.file.name, data.file.content, data.file.language);
  }
}

// ============================================
// RENAME
// ============================================

let renamingFileId = null;

function promptRename(fileId, currentName) {
  renamingFileId = fileId;
  document.getElementById('rename-input').value = currentName;
  document.getElementById('rename-error').textContent = '';
  openModal('modal-rename');

  // Select filename without extension
  const input = document.getElementById('rename-input');
  setTimeout(() => {
    const dotIdx = currentName.lastIndexOf('.');
    input.setSelectionRange(0, dotIdx > 0 ? dotIdx : currentName.length);
    input.focus();
  }, 60);
}

async function confirmRename() {
  if (!renamingFileId) return;

  const name = document.getElementById('rename-input').value.trim();
  const errEl = document.getElementById('rename-error');

  if (!name) { errEl.textContent = 'Name is required'; return; }
  if (/[/\\:*?"<>|]/.test(name)) { errEl.textContent = 'Name contains invalid characters'; return; }

  errEl.textContent = '';

  const data = await api.put(`/files/${renamingFileId}`, { name });
  if (!data.success) { errEl.textContent = data.message; return; }

  closeAllModals();

  // Update tab name if open
  const tab = editorManager.tabs.find(t => t.fileId === renamingFileId);
  if (tab) {
    tab.fileName = name;
    tab.language = data.file.language;
    editorManager._renderTabs();
    editorManager.updateLanguage(data.file.language);
  }

  await refreshFileTree();

  // Broadcast
  if (socket && currentProject) {
    socket.emit('filetree:change', {
      projectId: currentProject._id,
      action: 'rename',
      data: { id: renamingFileId, name }
    });
  }

  addActivity(`✏️ Renamed to ${name}`);
  renamingFileId = null;
}

// ============================================
// DELETE
// ============================================

async function confirmDelete(fileId, name, type) {
  const confirmed = window.confirm(
    `Delete "${name}"?${type === 'folder' ? '\n\nThis will also delete all files inside.' : ''}`
  );
  if (!confirmed) return;

  const data = await api.delete(`/files/${fileId}`);
  if (!data.success) { showToast(data.message, 'error'); return; }

  // Close tab if open
  const tab = editorManager.tabs.find(t => t.fileId === fileId);
  if (tab) editorManager.closeTab(tab.id);

  await refreshFileTree();

  // Broadcast
  if (socket && currentProject) {
    socket.emit('filetree:change', {
      projectId: currentProject._id,
      action: 'delete',
      data: { id: fileId, name }
    });
  }

  showToast(`${name} deleted`, 'success');
  addActivity(`🗑️ Deleted ${name}`);
}

// ============================================
// DRAG AND DROP
// ============================================

function setupDragDrop() {
  const items = document.querySelectorAll('.tree-item');
  items.forEach(item => {
    item.addEventListener('dragend', onDragEnd);
  });
}

function onDragStart(event, fileId) {
  dragSource = fileId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', fileId);
  event.currentTarget.closest('.tree-item')?.classList.add('dragging');
}

function onDragEnd(event) {
  dragSource = null;
  document.querySelectorAll('.tree-item-row.drag-over').forEach(el => {
    el.classList.remove('drag-over');
  });
  document.querySelectorAll('.tree-item.dragging').forEach(el => {
    el.classList.remove('dragging');
  });
}

function onDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';

  const row = event.currentTarget.querySelector?.('.tree-item-row') || event.currentTarget;
  document.querySelectorAll('.tree-item-row.drag-over').forEach(el => el.classList.remove('drag-over'));
  row.classList.add('drag-over');
}

async function onDrop(event, targetId) {
  event.preventDefault();
  document.querySelectorAll('.tree-item-row.drag-over').forEach(el => el.classList.remove('drag-over'));

  if (!dragSource || dragSource === targetId) return;

  const target = fileTree.find(f => f._id === targetId);
  if (!target) return;

  // Can only drop into folders
  const destFolderId = target.type === 'folder' ? targetId : target.parent;

  const sourceFile = fileTree.find(f => f._id === dragSource);
  if (!sourceFile) return;

  // Prevent dropping into own child
  if (isDescendant(dragSource, targetId)) {
    showToast('Cannot move a folder into its own subfolder', 'error');
    return;
  }

  const data = await api.put(`/files/${dragSource}/move`, { newParentId: destFolderId || null });
  if (!data.success) {
    showToast(data.message, 'error');
    return;
  }

  if (destFolderId) expandedFolders.add(destFolderId);
  await refreshFileTree();

  // Broadcast
  if (socket && currentProject) {
    socket.emit('filetree:change', {
      projectId: currentProject._id,
      action: 'move',
      data: { id: dragSource, destFolderId }
    });
  }

  addActivity(`📦 Moved ${sourceFile.name}`);
  dragSource = null;
}

async function onDropRoot(event) {
  event.preventDefault();
  document.querySelectorAll('.tree-item-row.drag-over').forEach(el => el.classList.remove('drag-over'));

  if (!dragSource) return;

  const data = await api.put(`/files/${dragSource}/move`, { newParentId: null });
  if (!data.success) { showToast(data.message, 'error'); return; }

  await refreshFileTree();
  dragSource = null;
}

function isDescendant(potentialAncestorId, nodeId) {
  let current = fileTree.find(f => f._id === nodeId);
  while (current) {
    if (current.parent === potentialAncestorId) return true;
    current = fileTree.find(f => f._id === current.parent);
  }
  return false;
}

// ============================================
// COLLAPSE ALL
// ============================================

function collapseAll() {
  expandedFolders.clear();
  api.get(`/projects/${currentProject._id}/files`).then(data => {
    if (data.success) renderFileTree(data.tree);
  });
}

// ============================================
// FILE ICONS (SVG)
// ============================================

function getFileIconSvg(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const colorMap = {
    js: '#f7df1e', jsx: '#61dafb', ts: '#3178c6', tsx: '#61dafb',
    py: '#3776ab', rb: '#cc342d', java: '#ed8b00', go: '#00add8',
    rs: '#d47a39', cpp: '#5c8dbc', c: '#a8b9cc', cs: '#9b4f96',
    html: '#e34c26', css: '#1572b6', scss: '#c69', sass: '#c69',
    json: '#ffa500', xml: '#f60', yaml: '#cb171e', yml: '#cb171e',
    md: '#1a7fcf', sql: '#e38d00', sh: '#4eaa25',
    png: '#a074c4', jpg: '#a074c4', svg: '#ff9a00',
  };
  const color = colorMap[ext] || 'var(--text-muted)';
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="${color}" stroke="none">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8L14 2z"/>
    <polyline points="14 2 14 8 20 8" fill="rgba(0,0,0,0.2)"/>
  </svg>`;
}

function getFolderIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="#e8b84b" stroke="none">
    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
  </svg>`;
}

function getFolderOpenIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="#e8b84b" stroke="none">
    <path d="M3 9a2 2 0 012-2h4l2-2h8a2 2 0 012 2v1H3zm0 2h18v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8z"/>
  </svg>`;
}

// ============================================
// INLINE RENAME (double-click)
// ============================================

document.addEventListener('dblclick', (e) => {
  const row = e.target.closest('.tree-item-row');
  if (!row) return;
  const item = row.closest('.tree-item');
  if (!item) return;
  const fileId = item.dataset.id;
  const file = fileTree.find(f => f._id === fileId);
  if (file) promptRename(fileId, file.name);
});
