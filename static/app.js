(() => {
  const startStopBtn = document.getElementById('startStopBtn');
  const continuousBtn = document.getElementById('continuousBtn');
  const resetBtn = document.getElementById('resetBtn');
  const copyBtn = document.getElementById('copyBtn');
  const resultsBody = document.getElementById('resultsBody');
  const countEl = document.getElementById('count');
  const statusEl = document.getElementById('status');
  const cityEl = document.getElementById('city');
  const serviceEl = document.getElementById('service');

  let sessionId = null;
  let es = null;
  let running = false;

  function setStatus(text) { statusEl.textContent = text; }
  function setCount(n) { countEl.textContent = String(n); }

  function addRow(idx, email, source) {
    const tr = document.createElement('tr');
    const tdIdx = document.createElement('td');
    const tdEmail = document.createElement('td');
    const tdSource = document.createElement('td');

    tdIdx.textContent = String(idx);
    tdEmail.textContent = email;
    const a = document.createElement('a');
    a.href = source; a.textContent = source; a.target = '_blank';
    tdSource.appendChild(a);

    tr.appendChild(tdIdx);
    tr.appendChild(tdEmail);
    tr.appendChild(tdSource);
    resultsBody.appendChild(tr);
  }

  function clearResults() {
    resultsBody.innerHTML = '';
    setCount(0);
  }

  async function doStart(continuous = false) {
    const city = cityEl.value.trim();
    const service = serviceEl.value.trim();
    if (!city || !service) {
      alert('يرجى إدخال المدينة والخدمة');
      return;
    }
    setStatus('جارِ البحث...');
    startStopBtn.textContent = 'إيقاف البحث';
    startStopBtn.classList.add('secondary');
    running = true;

    const resp = await fetch('/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city, service, continuous })
    });
    const data = await resp.json();
    if (!resp.ok) {
      alert(data.error || 'خطأ في البدء');
      resetUI();
      return;
    }
    sessionId = data.session_id;

    es = new EventSource(`/stream?session_id=${encodeURIComponent(sessionId)}`);
    es.onmessage = (ev) => {
      if (!ev.data) return;
      try {
        const obj = JSON.parse(ev.data);
        if (obj.hello) return;
        if (obj.done) {
          setStatus('انتهى البحث');
          running = false;
          startStopBtn.textContent = 'ابدأ البحث';
          startStopBtn.classList.remove('secondary');
          es && es.close();
          return;
        }
        const current = Number(countEl.textContent || '0') + 1;
        addRow(current, obj.email, obj.source);
        setCount(current);
      } catch {}
    };
    es.onerror = () => {
      setStatus('انقطاع في البث');
    };
  }

  function resetUI() {
    running = false;
    startStopBtn.textContent = 'ابدأ البحث';
    startStopBtn.classList.remove('secondary');
    setStatus('جاهز');
  }

  async function doStop() {
    if (!sessionId) return;
    try {
      await fetch('/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId }) });
    } catch {}
    es && es.close();
    resetUI();
  }

  async function doReset() {
    clearResults();
    if (!sessionId) return;
    try {
      await fetch('/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId }) });
    } catch {}
  }

  async function doCopy() {
    const rows = Array.from(resultsBody.querySelectorAll('tr'));
    const list = rows.map((tr) => {
      const tds = tr.querySelectorAll('td');
      return `${tds[1].textContent} \t ${tds[2].textContent}`;
    });
    const text = list.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      alert('تم النسخ');
    } catch (e) {
      alert('تعذر النسخ تلقائياً. انسخ يدوياً: \n' + text);
    }
  }

  startStopBtn.addEventListener('click', async () => {
    if (running) {
      await doStop();
    } else {
      await doStart(false);
    }
  });

  continuousBtn.addEventListener('click', async () => {
    if (running) {
      await doStop();
      // Short wait then start continuous
      setTimeout(() => doStart(true), 200);
    } else {
      await doStart(true);
    }
  });

  resetBtn.addEventListener('click', async () => {
    await doReset();
  });

  copyBtn.addEventListener('click', async () => {
    await doCopy();
  });
})();
