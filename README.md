# ISHA Code Core

A free, offline-first code editor for your computer — built with Electron.

**Included, as requested:**
- 📁 **File System Access** — open a real folder on your computer, create/rename/delete files & folders
- 💻 **Terminal** — a real shell (bash/zsh/PowerShell) running inside the editor, via `node-pty`
- 📝 **Code Editor Window** — powered by Monaco Editor (the same engine behind VS Code), with tabs, syntax highlighting for 25+ languages, and Ctrl/Cmd+S to save
- 🌲 **Sidebar / File Explorer** — lazy-loaded file tree, right-click menu (new/rename/delete/reveal)
- 🤖 **AI Chat Agent** — chats with a **local** model server on your machine (Ollama by default). No API key, no cloud calls, no cost.
- 🧩 **Extension Marketplace** — a small offline registry bundled with the app: theme packs, a bracket-pulse effect, ambient particles, a git-status "Commit Lens", and a snippet pack
- ✨ A custom "Aurora" GUI theme with animated particles, glow accents, and smooth transitions throughout

Everything runs locally. There is no telemetry, no account, and no paid dependency anywhere in this project.

---

## 1. Prerequisites

- **Node.js 18+** — download from https://nodejs.org
- (Optional, for the AI Chat Agent) **Ollama** — a free, local LLM runner: https://ollama.com/download

## 2. Install & run

```bash
cd isha-code-core
npm install
npm start
```

That's it — the app window should open.

> `node-pty` (used for the Terminal panel) contains native code. `npm install` compiles it automatically for your platform. If that step fails, install your OS's build tools first:
> - **Windows:** `npm install -g windows-build-tools` (or install "Desktop development with C++" via Visual Studio Build Tools), and Python 3
> - **macOS:** `xcode-select --install`
> - **Linux:** `sudo apt install build-essential python3`

## 3. Turning on the AI Chat Agent (fully local, fully free)

The AI panel talks to `http://127.0.0.1:11434`, the default address of **Ollama** — a free program that runs open-source AI models entirely on your own computer.

1. Install Ollama: https://ollama.com/download
2. Pull a coding-friendly model, e.g.:
   ```bash
   ollama pull qwen2.5-coder
   # or: ollama pull codellama   /   ollama pull llama3
   ```
3. Ollama runs a local server automatically. Open ISHA Code Core → click the chat icon in the activity bar → pick your model from the dropdown → start chatting.

If you use a different local runner (LM Studio, llama.cpp server, text-generation-webui, etc.), point it at the same Ollama-style `/api/chat` streaming format, or edit `ENDPOINT` at the top of `src/js/aiChat.js` to match your server's URL. No code anywhere in this project calls a paid/cloud API.

## 4. Packaging a real installer (.exe / .dmg / .AppImage)

```bash
npm run build:win     # Windows installer (NSIS)
npm run build:mac     # macOS .dmg
npm run build:linux   # Linux AppImage
```

Output lands in `build/`. You need to run each command on (or cross-compile for) the target OS — this uses `electron-builder` under the hood.

## 5. Project structure

```
isha-code-core/
  main.js              Electron main process: windows, filesystem, terminal, AI proxy, extensions
  preload.js            Secure bridge exposing a whitelisted API to the UI
  extensions/registry.json   The offline extension marketplace catalog
  src/
    index.html           App shell
    css/                  theme.css (design tokens) · layout.css · components.css
    js/
      renderer.js         Boots the app, activity bar, resizers, theme switching
      fileExplorer.js     File tree + create/rename/delete/reveal
      editorManager.js    Monaco tabs, save, bracket-pulse, snippets
      terminalPanel.js    xterm.js + node-pty terminal
      aiChat.js           Local AI chat panel (Ollama)
      extensionsPanel.js  Extension marketplace UI + effects
      particles.js         Ambient aurora particle background
```

## 6. Honest limitations (so there are no surprises)

- The **Extension Marketplace** is a small **offline** catalog bundled with the app (see `extensions/registry.json`) — there's no live server to browse, since that would need paid hosting. It's structured so you can point it at a real remote registry later if you build one.
- The **AI Chat Agent** needs a local model server (Ollama or compatible) installed separately — Electron apps can't ship a multi-gigabyte language model inside the installer.
- **node-pty** needs to compile native code for your OS during `npm install`; see the build-tools note above if it fails.

## License

MIT — do anything you like with it.



## https://gooo26.github.io/ISHA_CODE_CORE/
