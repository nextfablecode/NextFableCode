// ============================================
// CODESYNC — EDITOR MANAGER
// Monaco Editor + Real-Time Collaboration
// ============================================

const editorManager = {
  monaco: null,
  editor: null,
  tabs: [],           // { id, fileId, fileName, language, content, modified, model }
  activeTabId: null,
  remoteCursors: {},  // userId -> decorations
  autoSaveTimer: null,
  isApplyingRemoteChange: false,
  changeTimeout: null,

  // ----------------------------------------
  // INITIALIZATION
  // ----------------------------------------

  init() {
    if (this.editor) return; // already initialized

    require.config({
      paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' }
    });

    require(['vs/editor/editor.main'], (monaco) => {
      this.monaco = monaco;
      this._createEditor();
      this._setupActions();
      console.log('Monaco Editor initialized');
    });
  },

  _createEditor() {
    const container = document.getElementById('monaco-editor');
    const theme = localStorage.getItem('editorTheme') || 'vs-dark';
    const fontSize = parseInt(localStorage.getItem('fontSize') || '14');
    const tabSize = parseInt(localStorage.getItem('tabSize') || '2');

    this.editor = this.monaco.editor.create(container, {
      value: '',
      language: 'plaintext',
      theme,
      fontSize,
      tabSize,
      insertSpaces: true,
      wordWrap: localStorage.getItem('wordWrap') === 'true' ? 'on' : 'off',
      minimap: { enabled: localStorage.getItem('minimap') !== 'false' },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      lineNumbers: 'on',
      glyphMargin: true,
      folding: true,
      lineDecorationsWidth: 10,
      lineNumbersMinChars: 4,
      renderLineHighlight: 'all',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontLigatures: true,
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      suggest: { showKeywords: true, showSnippets: true },
      quickSuggestions: true,
      parameterHints: { enabled: true },
      formatOnType: false,
      formatOnPaste: true,
    });

    // Content change event
    this.editor.onDidChangeModelContent((e) => {
      if (this.isApplyingRemoteChange) return;
      this._onContentChange(e);
    });

    // Cursor position change
    this.editor.onDidChangeCursorPosition((e) => {
      updateCursorStatus(e.position.lineNumber, e.position.column);
      this._broadcastCursor(e.position);
    });

    // Cursor selection change
    this.editor.onDidChangeCursorSelection((e) => {
      this._broadcastCursor(e.selection);
    });

    // Context menu key for save
    this.editor.addCommand(this.monaco.KeyMod.CtrlCmd | this.monaco.KeyCode.KeyS, () => {
      this.saveCurrentFile();
    });
  },

  _setupActions() {
    // Add custom editor actions
    this.editor.addAction({
      id: 'codesync.save',
      label: 'Save File',
      keybindings: [this.monaco.KeyMod.CtrlCmd | this.monaco.KeyCode.KeyS],
      run: () => this.saveCurrentFile()
    });
  },

  // ----------------------------------------
  // TAB MANAGEMENT
  // ----------------------------------------

  openFile(fileId, fileName, content, language) {
    // Check if already open
    const existing = this.tabs.find(t => t.fileId === fileId);
    if (existing) {
      this.activateTab(existing.id);
      return;
    }

    const tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const model = this.monaco.editor.createModel(
      content || '',
      language || 'plaintext',
      this.monaco.Uri.parse(`file:///${fileId}/${fileName}`)
    );

    const tab = {
      id: tabId,
      fileId,
      fileName,
      language: language || 'plaintext',
      content: content || '',
      modified: false,
      model
    };

    this.tabs.push(tab);
    this._renderTabs();
    this.activateTab(tabId);

    // Announce active file to collaborators
    if (socket && currentProject) {
      socket.emit('file:active', {
        projectId: currentProject._id,
        fileId,
        fileName
      });
    }

    addActivity(`📄 Opened ${fileName}`);
  },

  activateTab(tabId) {
    this.activeTabId = tabId;
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Show editor, hide welcome
    document.getElementById('monaco-editor').style.display = 'block';
    document.getElementById('editor-welcome').style.display = 'none';

    // Set model
    this.editor.setModel(tab.model);

    // Update status bar
    updateLanguageStatus(tab.language);
    const pos = this.editor.getPosition();
    if (pos) updateCursorStatus(pos.lineNumber, pos.column);

    // Update active file in status
    document.getElementById('status-cursor').textContent = `${tab.fileName}`;

    // Render tabs
    this._renderTabs();

    // Focus editor
    this.editor.focus();

    // Clear remote cursors for new file
    this._clearAllRemoteCursors();
  },

  closeTab(tabId, e) {
    if (e) e.stopPropagation();

    const idx = this.tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;

    const tab = this.tabs[idx];

    if (tab.modified) {
      // Could show confirmation dialog here
      // For now, just save then close
    }

    tab.model.dispose();
    this.tabs.splice(idx, 1);

    if (this.activeTabId === tabId) {
      // Activate adjacent tab
      if (this.tabs.length > 0) {
        const newIdx = Math.min(idx, this.tabs.length - 1);
        this.activateTab(this.tabs[newIdx].id);
      } else {
        this.activeTabId = null;
        document.getElementById('monaco-editor').style.display = 'none';
        document.getElementById('editor-welcome').style.display = '';
        updateLanguageStatus('');
      }
    }

    this._renderTabs();
  },

  closeCurrentTab() {
    if (this.activeTabId) this.closeTab(this.activeTabId);
  },

  _renderTabs() {
    const container = document.getElementById('tabs-container');
    container.innerHTML = this.tabs.map(tab => {
      const ext = tab.fileName.split('.').pop();
      const icon = getFileIcon(tab.fileName);
      return `
        <div class="tab ${tab.id === this.activeTabId ? 'active' : ''} ${tab.modified ? 'modified' : ''}"
             onclick="editorManager.activateTab('${tab.id}')"
             title="${escapeHtml(tab.fileName)}">
          <span>${icon}</span>
          <span>${escapeHtml(tab.fileName)}</span>
          <span class="tab-close" onclick="editorManager.closeTab('${tab.id}', event)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </span>
        </div>`;
    }).join('');
  },

  // ----------------------------------------
  // CONTENT CHANGES
  // ----------------------------------------

  _onContentChange(e) {
    const tab = this.tabs.find(t => t.id === this.activeTabId);
    if (!tab) return;

    const content = this.editor.getValue();
    tab.content = content;

    if (!tab.modified) {
      tab.modified = true;
      this._renderTabs();
      updateSaveStatus('Unsaved changes', true);
    }

    // Broadcast change to collaborators
    if (socket && currentProject) {
      clearTimeout(this.changeTimeout);
      this.changeTimeout = setTimeout(() => {
        socket.emit('file:change', {
          projectId: currentProject._id,
          fileId: tab.fileId,
          content
        });
      }, 50); // 50ms debounce for typing
    }

    // Auto-save
    if (autoSaveEnabled) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = setTimeout(() => {
        this.saveCurrentFile(true);
      }, 2000); // 2 second auto-save
    }
  },

  applyExternalChange(data) {
    const tab = this.tabs.find(t => t.fileId === data.fileId);
    if (!tab) return;

    // Only apply if we're not the one who changed
    if (data.userId === currentUser?._id) return;

    this.isApplyingRemoteChange = true;

    // If this is the active tab, apply to editor
    if (tab.id === this.activeTabId) {
      const position = this.editor.getPosition();
      const scrollTop = this.editor.getScrollTop();

      // Replace entire content (simple approach)
      // In production: use operational transforms or CRDT
      tab.model.setValue(data.content);
      tab.content = data.content;

      // Restore cursor position
      if (position) {
        try { this.editor.setPosition(position); } catch(e) {}
      }
      this.editor.setScrollTop(scrollTop);
    } else {
      // Update model silently
      tab.model.setValue(data.content);
      tab.content = data.content;
    }

    this.isApplyingRemoteChange = false;
  },

  // ----------------------------------------
  // SAVE
  // ----------------------------------------

  async saveCurrentFile(isAutoSave = false) {
    const tab = this.tabs.find(t => t.id === this.activeTabId);
    if (!tab) return;

    const content = this.editor.getValue();

    // Socket save (real-time)
    if (socket && currentProject) {
      socket.emit('file:save', {
        projectId: currentProject._id,
        fileId: tab.fileId,
        content
      });
    } else {
      // Fallback: REST API save
      const data = await api.put(`/files/${tab.fileId}`, { content });
      if (!data.success) {
        showToast('Failed to save file', 'error');
        return;
      }
    }

    tab.content = content;
    tab.modified = false;
    this._renderTabs();
    updateSaveStatus('Saved', false);

    if (!isAutoSave) {
      showToast(`${tab.fileName} saved`, 'success');
      addActivity(`💾 Saved ${tab.fileName}`);
    }
  },

  // ----------------------------------------
  // REMOTE CURSORS
  // ----------------------------------------

  _broadcastCursor(positionOrSelection) {
    if (!socket || !currentProject) return;
    const tab = this.tabs.find(t => t.id === this.activeTabId);
    if (!tab) return;

    let position, selection;
    if (positionOrSelection.startLineNumber !== undefined) {
      // It's a selection
      selection = {
        startLineNumber: positionOrSelection.startLineNumber,
        startColumn: positionOrSelection.startColumn,
        endLineNumber: positionOrSelection.endLineNumber,
        endColumn: positionOrSelection.endColumn
      };
      position = {
        lineNumber: positionOrSelection.positionLineNumber || positionOrSelection.endLineNumber,
        column: positionOrSelection.positionColumn || positionOrSelection.endColumn
      };
    } else {
      position = { lineNumber: positionOrSelection.lineNumber, column: positionOrSelection.column };
    }

    socket.emit('cursor:update', {
      projectId: currentProject._id,
      fileId: tab.fileId,
      position,
      selection
    });
  },

  updateRemoteCursor(data) {
    if (!this.editor || !this.monaco) return;

    const tab = this.tabs.find(t => t.id === this.activeTabId);
    if (!tab || tab.fileId !== data.fileId) return;

    const userId = data.userId.toString();

    // Remove old decorations
    if (this.remoteCursors[userId]) {
      this.remoteCursors[userId].decorations = this.editor.deltaDecorations(
        this.remoteCursors[userId].decorations || [], []
      );
    }

    const decorations = [];

    // Cursor line decoration
    if (data.position) {
      decorations.push({
        range: new this.monaco.Range(
          data.position.lineNumber,
          data.position.column,
          data.position.lineNumber,
          data.position.column
        ),
        options: {
          className: `remote-cursor-${userId}`,
          beforeContentClassName: `remote-cursor-caret`,
          stickiness: this.monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          zIndex: 100
        }
      });
    }

    // Selection highlight
    if (data.selection &&
        (data.selection.startLineNumber !== data.selection.endLineNumber ||
         data.selection.startColumn !== data.selection.endColumn)) {
      decorations.push({
        range: new this.monaco.Range(
          data.selection.startLineNumber,
          data.selection.startColumn,
          data.selection.endLineNumber,
          data.selection.endColumn
        ),
        options: {
          className: `remote-selection-${userId}`,
          stickiness: this.monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      });
    }

    // Apply decorations
    const newDecorations = this.editor.deltaDecorations([], decorations);
    this.remoteCursors[userId] = { decorations: newDecorations, color: data.color };

    // Inject CSS for this user's cursor color
    this._injectCursorCSS(userId, data.color, data.username);
  },

  _injectCursorCSS(userId, color, username) {
    const styleId = `cursor-style-${userId}`;
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `
      .remote-cursor-${userId} { border-left: 2px solid ${color}; }
      .remote-selection-${userId} { background: ${color}30; }
      .remote-cursor-${userId}::before {
        content: '';
        display: inline-block;
        width: 2px;
        height: 1.2em;
        background: ${color};
        position: absolute;
        margin-left: -1px;
      }
      .remote-cursor-${userId}::after {
        content: '${username.replace(/'/g, "\\'")}';
        display: inline-block;
        background: ${color};
        color: white;
        font-size: 10px;
        font-weight: 600;
        padding: 1px 5px;
        border-radius: 3px;
        position: absolute;
        top: -18px;
        left: -1px;
        white-space: nowrap;
        z-index: 100;
        pointer-events: none;
      }`;
  },

  _clearAllRemoteCursors() {
    if (!this.editor) return;
    Object.keys(this.remoteCursors).forEach(userId => {
      if (this.remoteCursors[userId]?.decorations) {
        this.editor.deltaDecorations(this.remoteCursors[userId].decorations, []);
      }
    });
    this.remoteCursors = {};
  },

  // ----------------------------------------
  // EDITOR OPTIONS
  // ----------------------------------------

  updateOption(setting, value) {
    if (!this.editor) return;

    switch (setting) {
      case 'fontSize':
        const size = parseInt(value);
        this.editor.updateOptions({ fontSize: size });
        localStorage.setItem('fontSize', size);
        break;
      case 'tabSize':
        const ts = parseInt(value);
        this.editor.updateOptions({ tabSize: ts });
        localStorage.setItem('tabSize', ts);
        break;
      case 'wordWrap':
        this.editor.updateOptions({ wordWrap: value ? 'on' : 'off' });
        localStorage.setItem('wordWrap', value);
        break;
      case 'minimap':
        this.editor.updateOptions({ minimap: { enabled: value } });
        localStorage.setItem('minimap', value);
        break;
    }
  },

  setTheme(themeName) {
    if (!this.monaco) return;
    this.monaco.editor.setTheme(themeName);
    localStorage.setItem('editorTheme', themeName);
  },

  // ----------------------------------------
  // LANGUAGE DETECTION
  // ----------------------------------------

  updateLanguage(language) {
    if (!this.editor || !this.monaco) return;
    const model = this.editor.getModel();
    if (model) {
      this.monaco.editor.setModelLanguage(model, language);
    }

    const tab = this.tabs.find(t => t.id === this.activeTabId);
    if (tab) {
      tab.language = language;
      updateLanguageStatus(language);
    }
  }
};

// File icon helper
function getFileIcon(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const icons = {
    js: '🟨', jsx: '⚛️', ts: '🔷', tsx: '⚛️',
    py: '🐍', rb: '💎', java: '☕', go: '🔵',
    rs: '🦀', cpp: '⚡', c: '⚡', cs: '💜',
    php: '🐘', swift: '🍎', kt: '🟣',
    html: '🌐', css: '🎨', scss: '🎨', sass: '🎨',
    json: '📋', xml: '📋', yaml: '📋', yml: '📋',
    md: '📝', txt: '📄', sh: '⚙️', bash: '⚙️',
    sql: '🗃️', graphql: '📊', dockerfile: '🐳',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️',
    pdf: '📕', zip: '📦', gz: '📦',
  };
  return icons[ext] || '📄';
}

function setEditorTheme(theme) {
  editorManager.setTheme(theme);
}
