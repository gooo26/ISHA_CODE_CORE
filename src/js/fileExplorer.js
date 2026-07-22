// Sidebar file explorer: lazy-loaded tree over the real filesystem via the
// fs:* IPC bridge exposed in preload.js.
window.FileExplorer = (() => {
  let rootPath = null;
  const expanded = new Set();
  let selectedPath = null;

  const treeEl = () => document.getElementById('file-tree');

  function extIcon(name) {
    return Icons.svg('file');
  }

  async function openFolder(explicitPath) {
    const folder = explicitPath || await window.isha.openFolderDialog();
    if (!folder) return;
    rootPath = folder;
    expanded.clear();
    expanded.add(rootPath);
    window.setProjectTitle(rootPath.split(/[\\/]/).pop());
    document.getElementById('explorer-title').textContent = rootPath.split(/[\\/]/).pop();
    await render();
    window.TerminalPanel?.setCwd(rootPath);
  }

  let gitMap = {};

  async function refreshGit() {
    gitMap = {};
    document.getElementById('sb-branch').textContent = '';
    if (!rootPath || !window.IshaFeatures?.gitLens) return;
    const res = await window.isha.gitStatus(rootPath);
    if (res.ok) {
      gitMap = res.files || {};
      document.getElementById('sb-branch').innerHTML = `${Icons.svg('gitBranch')} ${res.branch}`;
      document.getElementById('sb-branch').style.display = 'flex';
      document.getElementById('sb-branch').style.gap = '5px';
    }
  }

  async function render() {
    const el = treeEl();
    if (!rootPath) {
      el.innerHTML = `<div class="tree-empty">No folder opened yet.<br/>Use the folder icon above, or the button on the Welcome tab, to open a project.</div>`;
      return;
    }
    await refreshGit();
    el.innerHTML = '';
    const rootNode = await buildNode(rootPath, rootPath.split(/[\\/]/).pop(), true, 0);
    el.appendChild(rootNode);
  }

  async function buildNode(fullPath, name, isDir, depth) {
    const row = document.createElement('div');
    row.className = 'tree-row';
    row.style.paddingLeft = (10 + depth * 14) + 'px';
    row.dataset.path = fullPath;

    if (isDir) {
      const isExpanded = expanded.has(fullPath);
      if (isExpanded) row.classList.add('expanded');
      row.innerHTML = `
        <span class="chevron">${Icons.svg('chevronRight')}</span>
        <span class="row-icon">${Icons.svg(isExpanded ? 'folderOpen' : 'folder')}</span>
        <span class="row-label"></span>`;
      row.querySelector('.row-label').textContent = name;
    } else {
      row.innerHTML = `
        <span class="chevron" style="visibility:hidden">${Icons.svg('chevronRight')}</span>
        <span class="row-icon">${extIcon(name)}</span>
        <span class="row-label"></span>`;
      row.querySelector('.row-label').textContent = name;
    }

    if (selectedPath === fullPath) row.classList.add('selected');

    if (!isDir && window.IshaFeatures?.gitLens && gitMap[fullPath]) {
      const badge = document.createElement('span');
      badge.className = 'git-badge ' + gitMap[fullPath];
      badge.textContent = gitMap[fullPath] === 'modified' ? 'M' : 'U';
      row.appendChild(badge);
    }

    const container = document.createElement('div');
    container.appendChild(row);

    if (isDir && expanded.has(fullPath)) {
      const childrenWrap = document.createElement('div');
      childrenWrap.className = 'tree-children';
      const entries = await window.isha.listDir(fullPath);
      for (const entry of entries) {
        const childNode = await buildNode(entry.path, entry.name, entry.isDir, depth + 1);
        childrenWrap.appendChild(childNode);
      }
      container.appendChild(childrenWrap);
    }

    row.addEventListener('click', async (e) => {
      e.stopPropagation();
      selectedPath = fullPath;
      if (isDir) {
        if (expanded.has(fullPath)) expanded.delete(fullPath);
        else expanded.add(fullPath);
        await render();
      } else {
        window.EditorManager.openFile(fullPath);
        await render();
      }
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectedPath = fullPath;
      showContextMenu(e.clientX, e.clientY, fullPath, isDir);
    });

    return container;
  }

  function showContextMenu(x, y, targetPath, isDir) {
    const root = document.getElementById('ctx-menu-root');
    root.innerHTML = '';
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    const items = [];
    if (isDir) {
      items.push(['New File', () => promptCreate(targetPath, false)]);
      items.push(['New Folder', () => promptCreate(targetPath, true)]);
      items.push('sep');
    }
    items.push(['Rename', () => promptRename(targetPath)]);
    items.push(['Reveal in File Manager', () => window.isha.revealInOS(targetPath)]);
    items.push('sep');
    items.push(['Delete', () => promptDelete(targetPath), true]);

    for (const it of items) {
      if (it === 'sep') { menu.appendChild(Object.assign(document.createElement('div'), { className: 'ctx-sep' })); continue; }
      const [label, fn, danger] = it;
      const div = document.createElement('div');
      div.className = 'ctx-item' + (danger ? ' danger' : '');
      div.textContent = label;
      div.onclick = () => { closeMenu(); fn(); };
      menu.appendChild(div);
    }
    root.appendChild(menu);

    const closeMenu = () => { root.innerHTML = ''; document.removeEventListener('click', closeMenu); };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  function showModal({ title, placeholder = '', value = '', okLabel = 'OK', onOk }) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <h3>${title}</h3>
          <input class="input" id="modal-input" placeholder="${placeholder}" value="${value}" />
          <div class="modal-actions">
            <button class="btn" id="modal-cancel">Cancel</button>
            <button class="btn btn-primary" id="modal-ok">${okLabel}</button>
          </div>
        </div>
      </div>`;
    const close = () => { root.innerHTML = ''; };
    const input = document.getElementById('modal-input');
    input.focus();
    input.select();
    document.getElementById('modal-cancel').onclick = close;
    document.getElementById('modal-ok').onclick = () => { const v = input.value.trim(); close(); if (v) onOk(v); };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('modal-ok').click();
      if (e.key === 'Escape') close();
    });
  }

  function joinPath(dir, name) {
    const sep = window.isha.pathSep();
    return dir.endsWith(sep) ? dir + name : dir + sep + name;
  }

  function promptCreate(dirPath, isDir) {
    showModal({
      title: isDir ? 'New Folder' : 'New File',
      placeholder: isDir ? 'folder-name' : 'file-name.js',
      okLabel: 'Create',
      onOk: async (name) => {
        const target = joinPath(dirPath, name);
        const res = isDir ? await window.isha.createFolder(target) : await window.isha.createFile(target);
        if (!res.ok) return showToast(res.error, 'error');
        expanded.add(dirPath);
        await render();
        if (!isDir) window.EditorManager.openFile(target);
        showToast(`Created ${name}`, 'success');
      }
    });
  }

  function promptRename(targetPath) {
    const parts = targetPath.split(/[\\/]/);
    const oldName = parts.pop();
    const dir = parts.join(window.isha.pathSep());
    showModal({
      title: 'Rename',
      value: oldName,
      okLabel: 'Rename',
      onOk: async (name) => {
        const newPath = joinPath(dir, name);
        const res = await window.isha.rename(targetPath, newPath);
        if (!res.ok) return showToast(res.error, 'error');
        await render();
        showToast('Renamed', 'success');
      }
    });
  }

  function promptDelete(targetPath) {
    const name = targetPath.split(/[\\/]/).pop();
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <h3>Delete "${name}"?</h3>
          <p style="font-size:12.5px; color:var(--text-secondary); margin:0 0 4px;">This cannot be undone from within ISHA Code Core.</p>
          <div class="modal-actions">
            <button class="btn" id="modal-cancel">Cancel</button>
            <button class="btn" style="background:var(--danger); color:white; border:none;" id="modal-del">Delete</button>
          </div>
        </div>
      </div>`;
    const close = () => root.innerHTML = '';
    document.getElementById('modal-cancel').onclick = close;
    document.getElementById('modal-del').onclick = async () => {
      close();
      const res = await window.isha.deletePath(targetPath);
      if (!res.ok) return showToast(res.error, 'error');
      window.EditorManager.closeByPath(targetPath);
      await render();
      showToast('Deleted', 'success');
    };
  }

  function init() {
    document.getElementById('btn-open-folder').innerHTML = Icons.svg('folderOpen');
    document.getElementById('btn-new-file').innerHTML = Icons.svg('addFile');
    document.getElementById('btn-new-folder').innerHTML = Icons.svg('addFolder');
    document.getElementById('btn-refresh-tree').innerHTML = Icons.svg('refresh');

    document.getElementById('btn-open-folder').onclick = () => openFolder();
    document.getElementById('welcome-open-folder').onclick = () => openFolder();
    document.getElementById('btn-new-file').onclick = () => rootPath ? promptCreate(rootPath, false) : showToast('Open a folder first', 'error');
    document.getElementById('btn-new-folder').onclick = () => rootPath ? promptCreate(rootPath, true) : showToast('Open a folder first', 'error');
    document.getElementById('btn-refresh-tree').onclick = () => render();
  }

  return { init, openFolder, getRootPath: () => rootPath, render };
})();
