// Extension Marketplace. This is a small, honest, OFFLINE registry that
// ships inside the app (extensions/registry.json) — there is no live store
// or network call involved, which keeps ISHA fully free and dependency-free.
// It's built so a real remote registry URL could be swapped in later.
window.ExtensionsPanel = (() => {
  let list = [];

  window.IshaFeatures = { bracketPulse: false, zenParticles: false, gitLens: false, webSnippets: false };

  async function load() {
    list = await window.isha.extList();
    for (const ext of list) applyEffect(ext, ext.enabled, false);
    render();
  }

  function render() {
    const root = document.getElementById('ext-list');
    const query = (document.getElementById('ext-search-input').value || '').toLowerCase();
    root.innerHTML = '';
    const filtered = list.filter(e =>
      e.name.toLowerCase().includes(query) || e.description.toLowerCase().includes(query) || e.category.toLowerCase().includes(query));

    if (!filtered.length) {
      root.innerHTML = `<div class="tree-empty">No extensions match "${query}".</div>`;
      return;
    }

    for (const ext of filtered) {
      const card = document.createElement('div');
      card.className = 'ext-card';
      card.innerHTML = `
        <div class="ext-icon">${Icons.svg(ext.icon === 'brackets' ? 'brackets' : ext.icon === 'wind' ? 'wind' : ext.icon === 'git-branch' ? 'gitBranch' : ext.icon === 'code' ? 'code' : ext.icon === 'moon' ? 'moon' : ext.icon === 'sun' ? 'sun' : 'sparkles')}</div>
        <div class="ext-body">
          <div class="ext-name">${ext.name}</div>
          <div class="ext-pub">by ${ext.publisher}</div>
          <div class="ext-desc">${ext.description}</div>
          <div class="ext-footer">
            <span class="ext-cat">${ext.category}</span>
            <label class="switch">
              <input type="checkbox" ${ext.enabled ? 'checked' : ''} />
              <span class="track"></span>
            </label>
          </div>
        </div>`;
      const checkbox = card.querySelector('input');
      checkbox.addEventListener('change', () => toggle(ext, checkbox.checked));
      root.appendChild(card);
    }
  }

  async function toggle(ext, enabled) {
    // Themes are single-select: turning one on turns the others off.
    if (ext.kind === 'theme' && enabled) {
      for (const other of list) {
        if (other.kind === 'theme' && other.id !== ext.id && other.enabled) {
          other.enabled = false;
          await window.isha.extSetEnabled(other.id, false);
        }
      }
    }
    ext.enabled = enabled;
    await window.isha.extSetEnabled(ext.id, enabled);
    applyEffect(ext, enabled, true);
    render();
  }

  function applyEffect(ext, enabled, announce) {
    if (ext.kind === 'theme') {
      if (enabled) window.applyTheme(ext.cssClass);
      return;
    }
    if (ext.kind === 'editor-feature' || ext.kind === 'snippets') {
      window.IshaFeatures[ext.feature] = enabled;
      document.body.classList.toggle('feat-' + ext.feature, enabled);
      if (announce) showToast(`${ext.name} ${enabled ? 'enabled' : 'disabled'}`, 'success');
      if (ext.feature === 'gitLens') window.FileExplorer?.render?.();
      if (ext.feature === 'webSnippets') window.EditorManager?.registerSnippets?.(enabled);
    }
  }

  async function cycleTheme() {
    const themes = list.filter(e => e.kind === 'theme');
    if (!themes.length) return;
    let idx = themes.findIndex(t => t.enabled);
    const next = themes[(idx + 1) % themes.length];
    await toggle(next, true);
  }

  function init() {
    document.getElementById('ext-search-icon').innerHTML = Icons.svg('search');
    document.getElementById('ext-search-input').addEventListener('input', render);
    load();
  }

  return { init, load, cycleTheme };
})();
