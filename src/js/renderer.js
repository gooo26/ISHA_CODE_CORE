(() => {
  // ---- inject remaining static icons ----
  document.querySelector('[data-view="explorer"]').innerHTML = Icons.svg('files');
  document.querySelector('[data-view="aichat"]').innerHTML = Icons.svg('chat');
  document.querySelector('[data-view="extensions"]').innerHTML = Icons.svg('puzzle');
  document.getElementById('toggle-terminal').innerHTML = Icons.svg('terminal');
  document.getElementById('toggle-theme').innerHTML = Icons.svg('sparkles');
  document.getElementById('btn-term-new').innerHTML = Icons.svg('refresh');
  document.getElementById('btn-term-close').innerHTML = Icons.svg('close');

  // ---- global theme application, shared by ExtensionsPanel + the quick-toggle button ----
  window.applyTheme = (cssClass) => {
    document.body.classList.remove('theme-aurora', 'theme-midnight', 'theme-sunrise');
    document.body.classList.add(cssClass);
    window.EditorManager?.applyMonacoTheme?.(cssClass);
  };

  // ---- activity bar: explorer / aichat / extensions ----
  const sidebar = document.getElementById('sidebar');
  const aichatPanel = document.getElementById('aichat-panel');
  const viewExplorer = document.getElementById('view-explorer');
  const viewExtensions = document.getElementById('view-extensions');

  function setSidebarView(view) {
    viewExplorer.style.display = view === 'explorer' ? 'flex' : 'none';
    viewExtensions.style.display = view === 'extensions' ? 'flex' : 'none';
  }

  document.querySelectorAll('.ab-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;

      if (view === 'aichat') {
        const opening = aichatPanel.classList.contains('collapsed');
        aichatPanel.classList.toggle('collapsed', !opening);
        btn.classList.toggle('active', opening);
        return;
      }

      // explorer / extensions share the sidebar; clicking the already-active
      // one collapses the sidebar, matching familiar IDE behavior.
      const alreadyActive = btn.classList.contains('active') && !sidebar.classList.contains('collapsed');
      document.querySelectorAll('.ab-btn[data-view]').forEach(b => {
        if (b.dataset.view !== 'aichat') b.classList.remove('active');
      });

      if (alreadyActive) {
        sidebar.classList.add('collapsed');
      } else {
        sidebar.classList.remove('collapsed');
        btn.classList.add('active');
        setSidebarView(view);
      }
      requestAnimationFrame(() => window.EditorManager?.initMonaco?.());
    });
  });

  // ---- terminal toggle ----
  const terminalPanel = document.getElementById('terminal-panel');
  const toggleTerminalBtn = document.getElementById('toggle-terminal');
  document.getElementById('toggle-terminal').addEventListener('click', async () => {
    const opening = terminalPanel.classList.contains('collapsed');
    terminalPanel.classList.toggle('collapsed', !opening);
    toggleTerminalBtn.classList.toggle('active', opening);
    if (opening) {
      await window.TerminalPanel.ensureStarted();
      setTimeout(() => { window.TerminalPanel.refit(); window.TerminalPanel.focus(); }, 60);
    }
  });
  document.getElementById('btn-term-new').addEventListener('click', () => window.TerminalPanel.restart());
  document.getElementById('btn-term-close').addEventListener('click', () => {
    terminalPanel.classList.add('collapsed');
    toggleTerminalBtn.classList.remove('active');
  });

  // ---- quick theme cycle button ----
  document.getElementById('toggle-theme').addEventListener('click', () => window.ExtensionsPanel.cycleTheme());

  // ---- new (untitled) file from the Welcome tab ----
  document.getElementById('welcome-new-file').addEventListener('click', () => window.EditorManager.newUntitled());

  // ---- resizers ----
  function makeHorizontalResizer(handle, panel, { min, max, fromRight = false }) {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      handle.classList.add('active');
      document.body.style.cursor = 'col-resize';
      const startX = e.clientX;
      const startWidth = panel.getBoundingClientRect().width;
      function onMove(ev) {
        let delta = ev.clientX - startX;
        if (fromRight) delta = -delta;
        panel.style.width = Math.min(max, Math.max(min, startWidth + delta)) + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        handle.classList.remove('active');
        window.TerminalPanel?.refit();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function makeVerticalResizer(handle, panel, { min, max }) {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      handle.classList.add('active');
      document.body.style.cursor = 'row-resize';
      const startY = e.clientY;
      const startHeight = panel.getBoundingClientRect().height;
      function onMove(ev) {
        const delta = startY - ev.clientY;
        panel.style.height = Math.min(max, Math.max(min, startHeight + delta)) + 'px';
        window.TerminalPanel?.refit();
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        handle.classList.remove('active');
        window.TerminalPanel?.refit();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  makeHorizontalResizer(document.getElementById('resizer-sidebar'), sidebar, { min: 180, max: 480 });
  makeHorizontalResizer(document.getElementById('resizer-chat'), aichatPanel, { min: 280, max: 560, fromRight: true });
  makeVerticalResizer(document.getElementById('resizer-terminal'), terminalPanel, { min: 90, max: Math.floor(window.innerHeight * 0.7) });

  // ---- boot sequence ----
  window.FileExplorer.init();
  window.EditorManager.initMonaco();
  window.AiChat.init();
  window.ExtensionsPanel.init();

  showToast('Welcome to ISHA Code Core \u2014 fully free, fully local.', 'success', 4200);
})();
