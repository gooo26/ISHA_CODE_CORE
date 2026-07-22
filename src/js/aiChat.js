// AI Chat Agent panel. Talks ONLY to a local model server (Ollama-compatible
// REST API on http://127.0.0.1:11434 by default) — never a cloud endpoint,
// never an API key. If no local server is running, we say so plainly.
window.AiChat = (() => {
  const ENDPOINT = 'http://127.0.0.1:11434';
  let history = [];
  let currentReqId = 0;
  let streamingBubble = null;
  let streamingText = '';

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Very small, safe markdown-ish renderer: fenced code blocks + inline code.
  function renderContent(text) {
    const parts = text.split(/```(\w*)\n?([\s\S]*?)```/g);
    let html = '';
    for (let i = 0; i < parts.length; i++) {
      if (i % 3 === 0) {
        html += escapeHtml(parts[i])
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\n/g, '<br/>');
      } else if (i % 3 === 2) {
        html += `<pre><code>${escapeHtml(parts[i])}</code></pre>`;
      }
    }
    return html;
  }

  function scrollToBottom() {
    const box = document.getElementById('chat-messages');
    box.scrollTop = box.scrollHeight;
  }

  function addMessage(role, text) {
    document.getElementById('chat-empty')?.remove();
    const box = document.getElementById('chat-messages');
    const row = document.createElement('div');
    row.className = `msg ${role}`;
    row.innerHTML = `
      <div class="avatar">${role === 'user' ? 'You' : Icons.svg('bot')}</div>
      <div class="bubble"></div>`;
    row.querySelector('.bubble').innerHTML = renderContent(text);
    box.appendChild(row);
    scrollToBottom();
    return row.querySelector('.bubble');
  }

  function addTypingBubble() {
    document.getElementById('chat-empty')?.remove();
    const box = document.getElementById('chat-messages');
    const row = document.createElement('div');
    row.className = 'msg assistant';
    row.innerHTML = `
      <div class="avatar">${Icons.svg('bot')}</div>
      <div class="bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
    box.appendChild(row);
    scrollToBottom();
    return row.querySelector('.bubble');
  }

  async function refreshModels() {
    const select = document.getElementById('model-select');
    const res = await window.isha.aiListModels(ENDPOINT);
    const statusEl = document.getElementById('sb-ai-status');
    if (!res.ok || !res.models.length) {
      select.innerHTML = `<option value="">No local models found</option>`;
      statusEl.textContent = 'Local AI: offline';
      statusEl.style.color = '';
      return false;
    }
    select.innerHTML = res.models.map(m => `<option value="${m}">${m}</option>`).join('');
    statusEl.textContent = `Local AI: ${res.models[0]} ready`;
    return true;
  }

  async function send() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    const model = document.getElementById('model-select').value;
    if (!model) {
      showToast('No local model available. Install Ollama and pull a model first.', 'error');
      return;
    }
    input.value = '';
    autoGrow(input);
    document.getElementById('chat-send').disabled = true;

    addMessage('user', text);
    history.push({ role: 'user', content: text });

    const bubble = addTypingBubble();
    streamingBubble = bubble;
    streamingText = '';

    const requestId = String(++currentReqId);
    const offChunk = window.isha.onAiChunk(({ requestId: rid, content }) => {
      if (rid !== requestId) return;
      if (streamingBubble.querySelector('.typing-dots')) streamingBubble.innerHTML = '';
      streamingText += content;
      streamingBubble.innerHTML = renderContent(streamingText);
      scrollToBottom();
    });
    const offDone = window.isha.onAiDone(({ requestId: rid }) => {
      if (rid !== requestId) return;
      history.push({ role: 'assistant', content: streamingText });
      document.getElementById('chat-send').disabled = false;
    });
    const offErr = window.isha.onAiError(({ requestId: rid, error }) => {
      if (rid !== requestId) return;
      streamingBubble.innerHTML = `<span style="color:var(--danger)">Couldn't reach the local model server: ${escapeHtml(error)}</span>`;
      document.getElementById('chat-send').disabled = false;
    });

    await window.isha.aiChat(requestId, ENDPOINT, model, history);
  }

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }

  function init() {
    document.getElementById('chat-empty-icon').innerHTML = Icons.svg('chat');
    document.getElementById('chat-send').innerHTML = Icons.svg('send');
    document.getElementById('btn-refresh-models').innerHTML = Icons.svg('refresh');

    const input = document.getElementById('chat-input');
    input.addEventListener('input', () => {
      autoGrow(input);
      document.getElementById('chat-send').disabled = !input.value.trim();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.value.trim()) send(); }
    });
    document.getElementById('chat-send').addEventListener('click', send);
    document.getElementById('btn-refresh-models').addEventListener('click', refreshModels);
    document.getElementById('chat-help-link').addEventListener('click', () => {
      window.isha.openExternal('https://ollama.com/download');
      showToast('Opening Ollama\u2019s site \u2014 install it, run "ollama pull llama3", then refresh models here.', 'default', 6000);
    });

    refreshModels();
    setInterval(refreshModels, 15000);
  }

  return { init, refreshModels };
})();
