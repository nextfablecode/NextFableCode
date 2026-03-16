// ============================================
// CODESYNC — THEME MANAGER
// UI Themes + Editor Themes + Persistence
// ============================================

const themeManager = {
  currentUITheme: 'dark',
  currentEditorTheme: 'vs-dark',

  themes: {
    dark:     { ui: 'dark',     editor: 'vs-dark',  label: 'Dark' },
    light:    { ui: 'light',    editor: 'vs',       label: 'Light' },
    midnight: { ui: 'midnight', editor: 'vs-dark',  label: 'Midnight' },
    ocean:    { ui: 'ocean',    editor: 'vs-dark',  label: 'Ocean' },
  },

  init() {
    // Load saved preferences
    const savedUI = localStorage.getItem('uiTheme') || 'dark';
    const savedEditor = localStorage.getItem('editorTheme') || 'vs-dark';

    this.currentUITheme = savedUI;
    this.currentEditorTheme = savedEditor;

    // Apply UI theme
    document.body.setAttribute('data-theme', savedUI);

    // Mark active theme in settings
    this._updateThemeCards(savedUI);

    // Restore editor settings UI
    this._restoreSettingsUI();
  },

  _updateThemeCards(themeName) {
    document.querySelectorAll('.theme-card').forEach(card => {
      const isActive = card.dataset.theme === themeName;
      card.classList.toggle('selected', isActive);
      const check = card.querySelector('.theme-check');
      if (check) check.classList.toggle('hidden', !isActive);
    });
  },

  _restoreSettingsUI() {
    // Font size
    const fontSize = localStorage.getItem('fontSize') || '14';
    const fontSizeInput = document.getElementById('setting-font-size');
    if (fontSizeInput) fontSizeInput.value = fontSize;

    // Tab size
    const tabSize = localStorage.getItem('tabSize') || '2';
    const tabSizeSelect = document.getElementById('setting-tab-size');
    if (tabSizeSelect) tabSizeSelect.value = tabSize;

    // Word wrap
    const wordWrap = localStorage.getItem('wordWrap') === 'true';
    const wordWrapInput = document.getElementById('setting-word-wrap');
    if (wordWrapInput) wordWrapInput.checked = wordWrap;

    // Minimap
    const minimap = localStorage.getItem('minimap') !== 'false';
    const minimapInput = document.getElementById('setting-minimap');
    if (minimapInput) minimapInput.checked = minimap;

    // Auto-save
    const autoSave = localStorage.getItem('autoSave') !== 'false';
    const autoSaveInput = document.getElementById('setting-auto-save');
    if (autoSaveInput) autoSaveInput.checked = autoSave;
    autoSaveEnabled = autoSave;

    // Editor theme radio
    const editorThemeInput = document.querySelector(`input[name="editor-theme"][value="${this.currentEditorTheme}"]`);
    if (editorThemeInput) editorThemeInput.checked = true;
  }
};

// ============================================
// UI THEME SWITCHING
// ============================================

function setUITheme(themeName, cardEl) {
  const theme = themeManager.themes[themeName];
  if (!theme) return;

  themeManager.currentUITheme = themeName;
  document.body.setAttribute('data-theme', themeName);
  localStorage.setItem('uiTheme', themeName);

  // Update cards
  themeManager._updateThemeCards(themeName);

  // Also update editor theme to match
  const editorTheme = theme.editor;
  if (editorManager.monaco) {
    editorManager.setTheme(editorTheme);
    // Update radio button
    const radio = document.querySelector(`input[name="editor-theme"][value="${editorTheme}"]`);
    if (radio) radio.checked = true;
  }

  showToast(`Theme: ${theme.label}`, 'success');
  addActivity(`🎨 Switched to ${theme.label} theme`);
}

// ============================================
// SMOOTH TRANSITION HELPER
// ============================================

function applyThemeWithTransition(callback) {
  document.body.style.transition = 'background 0.3s ease, color 0.3s ease';
  callback();
  setTimeout(() => {
    document.body.style.transition = '';
  }, 300);
}
