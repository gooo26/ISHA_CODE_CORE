// Real, local terminal: xterm.js in the renderer talks over IPC to a
// node-pty process spawned by the main process (your actual shell).
window.TerminalPanel = (() => {
  const TERM_ID = 'main';
  let term = null;
  let fitAddon = null;
  let cwd = null;
  let started = false;
  let dataListenerBound = false;

  function ensureListeners() {
    if (dataListenerBound) return;
    dataListenerBound = true;
    window.isha.onTermData(({ id, data }) => {
      if (id === TERM_ID && term) term.write(data);
    });
    window.isha.onTermExit(({ id }) => {
      if (id === TERM_ID && term) term.write('\r\n\x1b[2m[process exited]\x1b[0m\r\n');
    });
  }

  function setCwd(path) { cwd = path; }

  async function ensureStarted() {
    ensureListeners();
    if (started) return;
    started = true;

    term = new Terminal({
      convertEol: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, Consolas, monospace",
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: '#10121c',
        foreground: '#e9eaf3',
        cursor: '#7c6cf0',
        selectionBackground: '#7c6cf055',
        black: '#0b0d14', brightBlack: '#676b88',
        red: '#f0616b', brightRed: '#f0616b',
        green: '#5fd68a', brightGreen: '#5fd68a',
        yellow: '#f0c05c', brightYellow: '#f0a85c',
        blue: '#7c6cf0', brightBlue: '#7c6cf0',
        magenta: '#e255a1', brightMagenta: '#e255a1',
        cyan: '#57d0e0', brightCyan: '#57d0e0',
        white: '#e9eaf3', brightWhite: '#ffffff'
      }
    });
    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon.WebLinksAddon());
    term.open(document.getElementById('terminal-host'));
    fitAddon.fit();

    await window.isha.termCreate(TERM_ID, cwd);
    await window.isha.termResize(TERM_ID, term.cols, term.rows);

    term.onData((data) => window.isha.termWrite(TERM_ID, data));
    term.onResize(({ cols, rows }) => window.isha.termResize(TERM_ID, cols, rows));

    new ResizeObserver(() => { try { fitAddon.fit(); } catch (_) {} }).observe(document.getElementById('terminal-host'));
  }

  async function restart() {
    await window.isha.termKill(TERM_ID);
    if (term) { term.dispose(); term = null; }
    started = false;
    await ensureStarted();
  }

  function focus() { term?.focus(); }
  function refit() { try { fitAddon?.fit(); } catch (_) {} }

  return { ensureStarted, restart, setCwd, focus, refit };
})();
