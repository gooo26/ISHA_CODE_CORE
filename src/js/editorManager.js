// Wraps Monaco Editor (the same editor engine VS Code uses — open source,
// free, MIT licensed) with a simple multi-tab file model backed by the
// real filesystem via window.isha.*
window.EditorManager = (() => {
  let monaco = null;
  let editor = null;
  const files = new Map(); // path -> { path, name, model, viewState, dirty, isUntitled }
  let activePath = null;
  let untitledCounter = 1;
  let monacoReady;

  const LANG_MAP = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    json: 'json', html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
    md: 'markdown', py: 'python', java: 'java', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp',
    cs: 'csharp', go: 'go', rs: 'rust', php: 'php', rb: 'ruby', sh: 'shell', bash: 'shell',
    yml: 'yaml', yaml: 'yaml', xml: 'xml', sql: 'sql', kt: 'kotlin', swift: 'swift',
    lua: 'lua', r: 'r', dart: 'dart', vue: 'html', txt: 'plaintext'
  };

  function langFor(name) {
    const ext = name.split('.').pop().toLowerCase();
    return LANG_MAP[ext] || 'plaintext';
  }

  function initMonaco() {
    if (monacoReady) return monacoReady;
    monacoReady = new Promise((resolve) => {
      require.config({ paths: { vs: window.MONACO_BASE } });
      require(['vs/editor/editor.main'], () => {
        monaco = window.monaco;
        monaco.editor.defineTheme('isha-aurora', {
          base: 'vs-dark', inherit: true,
          rules: [
            { token: 'comment', foreground: '676b88', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'e255a1' },
            { token: 'string', foreground: 'f0a85c' },
            { token: 'number', foreground: '57d0e0' },
            { token: 'type', foreground: '7c6cf0' }
          ],
          colors: {
            'editor.background': '#0b0d14',
            'editor.lineHighlightBackground': '#161927',
            'editorLineNumber.foreground': '#3a3d55',
            'editorLineNumber.activeForeground': '#a7abc4',
            'editorCursor.foreground': '#7c6cf0',
            'editor.selectionBackground': '#7c6cf055',
            'editorIndentGuide.background': '#1a1d2e',
            'editorIndentGuide.activeBackground': '#2a2e46',
            'editorGutter.background': '#0b0d14'
          }
        });
        monaco.editor.defineTheme('isha-sunrise', {
          base: 'vs', inherit: true, rules: [],
          colors: { 'editor.background': '#faf7f1' }
        });

        editor = monaco.editor.create(document.getElementById('monaco-host'), {
          theme: 'isha-aurora',
          automaticLayout: true,
          fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, Consolas, monospace",
          fontSize: 13.5,
          lineHeight: 22,
          minimap: { enabled: true },
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          bracketPairColorization: { enabled: true },
          padding: { top: 14 }
        });

        let bracketDecorations = [];
        editor.onDidChangeCursorPosition((e) => {
          document.getElementById('sb-cursor').textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
          if (window.IshaFeatures?.bracketPulse) {
            const model = editor.getModel();
            const match = model?.matchBracket?.(e.position);
            if (match) {
              bracketDecorations = editor.deltaDecorations(bracketDecorations, [
                { range: match[0], options: { inlineClassName: 'bracket-pulse-deco' } },
                { range: match[1], options: { inlineClassName: 'bracket-pulse-deco' } }
              ]);
            } else if (bracketDecorations.length) {
              bracketDecorations = editor.deltaDecorations(bracketDecorations, []);
            }
          }
        });

        window.addEventListener('keydown', (e) => {
          const ctrl = e.ctrlKey || e.metaKey;
          if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); saveActive(); }
          if (ctrl && e.key.toLowerCase() === 'w' && activePath) { e.preventDefault(); closeTab(activePath); }
        });

        resolve();
      });
    });
    return monacoReady;
  }

  function applyMonacoTheme(themeName) {
    if (!monaco) return;
    monaco.editor.setTheme(themeName === 'theme-sunrise' ? 'isha-sunrise' : 'isha-aurora');
  }

  async function openFile(filePath) {
    await initMonaco();
    if (files.has(filePath)) return activate(filePath);

    const res = await window.isha.readFile(filePath);
    if (!res.ok) { showToast(res.error, 'error'); return; }

    const name = filePath.split(/[\\/]/).pop();
    const model = monaco.editor.createModel(res.content, langFor(name));
    model.onDidChangeContent(() => markDirty(filePath, true));

    files.set(filePath, { path: filePath, name, model, viewState: null, dirty: false, isUntitled: false });
    activate(filePath);
    renderTabs();
  }

  function newUntitled() {
    initMonaco().then(() => {
      const id = `Untitled-${untitledCounter++}`;
      const model = monaco.editor.createModel('', 'plaintext');
      model.onDidChangeContent(() => markDirty(id, true));
      files.set(id, { path: id, name: id, model, viewState: null, dirty: false, isUntitled: true });
      activate(id);
      renderTabs();
    });
  }

  function activate(path) {
    if (activePath && files.has(activePath)) {
      files.get(activePath).viewState = editor.saveViewState();
    }
    activePath = path;
    const f = files.get(path);
    editor.setModel(f.model);
    if (f.viewState) editor.restoreViewState(f.viewState);
    editor.focus();

    document.getElementById('welcome').style.display = 'none';
    document.getElementById('monaco-host').style.display = 'block';
    document.getElementById('sb-lang').textContent = f.model.getLanguageId
      ? f.model.getLanguageId() : (monaco.editor.getModel(f.model.uri)?.getLanguageId() || 'Plain Text');
    document.getElementById('sb-path').textContent = f.path;
    renderTabs();
  }

  function markDirty(path, val) {
    const f = files.get(path);
    if (!f) return;
    f.dirty = val;
    renderTabs();
  }

  async function saveActive() {
    if (!activePath) return;
    const f = files.get(activePath);
    if (!f) return;
    if (f.isUntitled) {
      // Ask where to save via the folder dialog isn't ideal for a single file;
      // keep it simple: prompt for a filename inside the open project root.
      const root = window.FileExplorer.getRootPath();
      if (!root) { showToast('Open a folder first so ISHA knows where to save this file.', 'error'); return; }
      const name = prompt('Save as (filename inside the open folder):', 'untitled.txt');
      if (!name) return;
      const sep = window.isha.pathSep();
      const target = root.endsWith(sep) ? root + name : root + sep + name;
      const content = f.model.getValue();
      const res = await window.isha.writeFile(target, content);
      if (!res.ok) return showToast(res.error, 'error');
      files.delete(activePath);
      files.set(target, { path: target, name, model: f.model, viewState: f.viewState, dirty: false, isUntitled: false });
      activePath = target;
      window.FileExplorer.render();
      renderTabs();
      showToast('Saved ' + name, 'success');
      return;
    }
    const content = f.model.getValue();
    const res = await window.isha.writeFile(f.path, content);
    if (!res.ok) return showToast(res.error, 'error');
    markDirty(f.path, false);
    showToast('Saved', 'success');
  }

  function closeTab(path) {
    const f = files.get(path);
    if (!f) return;
    if (f.dirty && !confirm(`"${f.name}" has unsaved changes. Close anyway?`)) return;
    f.model.dispose();
    files.delete(path);
    if (activePath === path) {
      activePath = null;
      const remaining = [...files.keys()];
      if (remaining.length) activate(remaining[remaining.length - 1]);
      else {
        document.getElementById('welcome').style.display = 'flex';
        document.getElementById('monaco-host').style.display = 'none';
        document.getElementById('sb-path').textContent = 'ISHA Code Core';
        document.getElementById('sb-lang').textContent = 'Plain Text';
      }
    }
    renderTabs();
  }

  function closeByPath(path) {
    if (files.has(path)) closeTab(path);
  }

  function renderTabs() {
    const bar = document.getElementById('tabbar');
    bar.innerHTML = '';
    for (const [path, f] of files) {
      const tab = document.createElement('div');
      tab.className = 'tab' + (path === activePath ? ' active' : '');
      tab.innerHTML = `
        ${f.dirty ? '<span class="dot-unsaved"></span>' : `<span class="row-icon" style="width:14px;height:14px;display:flex;">${Icons.svg('file')}</span>`}
        <span class="tab-name"></span>
        <button class="tab-close">${Icons.svg('close')}</button>`;
      tab.querySelector('.tab-name').textContent = f.name;
      tab.addEventListener('click', (e) => { if (!e.target.closest('.tab-close')) activate(path); });
      tab.querySelector('.tab-close').addEventListener('click', (e) => { e.stopPropagation(); closeTab(path); });
      bar.appendChild(tab);
    }
  }

  let snippetDisposable = null;
  function registerSnippets(enabled) {
    if (!monaco) return;
    if (snippetDisposable) { snippetDisposable.dispose(); snippetDisposable = null; }
    if (!enabled) return;
    const SNIPPETS = [
      { label: 'html5', insertText: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${1:Document}</title>\n</head>\n<body>\n  ${2}\n</body>\n</html>', detail: 'HTML5 boilerplate' },
      { label: 'flexcenter', insertText: 'display: flex;\nalign-items: center;\njustify-content: center;', detail: 'Flexbox centering' },
      { label: 'clog', insertText: 'console.log(${1});', detail: 'console.log(...)' },
      { label: 'arrowfn', insertText: 'const ${1:name} = (${2}) => {\n  ${3}\n};', detail: 'Arrow function' }
    ];
    snippetDisposable = monaco.languages.registerCompletionItemProvider(['html', 'css', 'javascript', 'typescript'], {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
        return {
          suggestions: SNIPPETS.map(s => ({
            label: s.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: s.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: s.detail,
            range
          }))
        };
      }
    });
  }

  return { openFile, newUntitled, saveActive, closeTab, closeByPath, applyMonacoTheme, initMonaco, registerSnippets };
})();
