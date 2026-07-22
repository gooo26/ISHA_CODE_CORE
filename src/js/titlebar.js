(() => {
  document.getElementById('win-min').innerHTML = Icons.svg('minimize');
  document.getElementById('win-max').innerHTML = Icons.svg('maximize');
  document.getElementById('win-close').innerHTML = Icons.svg('winClose');

  document.getElementById('win-min').addEventListener('click', () => window.isha.winMinimize());
  document.getElementById('win-max').addEventListener('click', () => window.isha.winMaximizeToggle());
  document.getElementById('win-close').addEventListener('click', () => window.isha.winClose());

  document.getElementById('titlebar').addEventListener('dblclick', (e) => {
    if (e.target.closest('.win-controls')) return;
    window.isha.winMaximizeToggle();
  });

  window.isha.onWinState((state) => {
    const btn = document.getElementById('win-max');
    btn.innerHTML = state === 'maximized' ? Icons.svg('files') : Icons.svg('maximize');
    btn.innerHTML = Icons.svg('maximize'); // keep a single consistent glyph; state kept for future use
  });

  window.setProjectTitle = (name) => {
    document.getElementById('title-project').textContent = name || 'No folder opened';
  };
})();
