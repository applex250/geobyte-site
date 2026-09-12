/* GEO RSI harness — local chat shell.
   Demo conversation only: no remote model, no network. Runtime clock and
   composer UX stay offline so the page remains zero-dependency. */
(function () {
  'use strict';

  var log = document.getElementById('chatLog');
  var form = document.getElementById('composer');
  var input = document.getElementById('composerInput');
  var sendBtn = document.getElementById('sendBtn');
  var statUptime = document.getElementById('statUptime');
  var statCycles = document.getElementById('statCycles');
  var agentList = document.getElementById('agentList');
  var historyList = document.getElementById('historyList');
  var sessionTitle = document.getElementById('sessionTitle');
  var sessionEyebrow = document.getElementById('sessionEyebrow');
  var newSessionBtn = document.getElementById('newSessionBtn');
  var scrubTrack = document.getElementById('scrubTrack');
  var scrubUp = document.getElementById('scrubUp');
  var scrubDown = document.getElementById('scrubDown');
  var scrubPop = document.getElementById('scrubPop');
  var scrubRoot = document.getElementById('chatScrub');

  if (!log || !form || !input) return;

  var started = Date.now();
  var baseCycles = 12847;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var SESSIONS = {
    current: {
      title: 'RSI threshold review',
      eyebrow: 'session · geology / rsi',
      messages: [
        ['system', 'boot', '<p>GEO RSI harness online. 我持续监控光谱比值、蚀变异常与野外回传，按 7×24 自进化策略更新阈值与先验。</p><p class="harness-muted">下方输入任务或问题；右侧仪表栏为预留扩展位。</p>'],
        ['assistant', '00:00:12', '<p>本轮周期摘要：</p><ul><li>SWIR 双窗（2.2 µm Al-OH / 2.35 µm Fe-OH）阈值保持 <code>τ = 0.18</code></li><li>TIR 石英对比度样本 +14，暂不改写 argillic 判别</li><li>异常图层 3 个兴趣点待野外核实（queue 面板）</li></ul><p>需要我重算 RSI 曲线、锁定某个波段，还是起草一版巡检提示？</p>'],
        ['user', '00:01:04', '<p>解释一下 RSI 和裸比值的区别，面向新入组的野外地质员。</p>'],
        ['assistant', '00:01:09', '<p>裸比值把亮度当信号；RSI（relative spectral index）先用连续统（continuum）把背景抬平，再量吸收谷与肩部的相对深度。</p><pre class="harness-code">RSI = (shoulder − core) / shoulder</pre><p>因此对光照、坡度与传感器增益更稳。仍须在地表反射率产品上使用——大气水汽不会被比值抵消。</p>']
      ]
    },
    swir: {
      title: 'SWIR clay anomaly batch',
      eyebrow: 'session · swir / clay',
      messages: [
        ['system', 'boot', '<p>Loaded archive session · SWIR clay batch (demo).</p>'],
        ['user', 'yesterday', '<p>这批 SWIR2 影像里，把 clay 异常点按可信度排一下。</p>'],
        ['assistant', 'yesterday', '<p>Top 3 高置信：</p><ul><li>块 A-12 · Al-OH 深 0.22 · 与 Fe-OH 共现</li><li>块 B-03 · Al-OH 0.19 · 边缘破碎，建议加密</li><li>块 C-07 · 仅 SWIR 信号，碳酸盐可能混入</li></ul><p class="harness-muted">完整 GeoJSON 需接入数据仓后写入。</p>']
      ]
    },
    field: {
      title: 'Field photo ingest plan',
      eyebrow: 'session · field / ingest',
      messages: [
        ['system', 'boot', '<p>Loaded archive session · Field ingest (demo).</p>'],
        ['user', '2d', '<p>给野外组定一个 7×24 回传节奏。</p>'],
        ['assistant', '2d', '<p>建议：每日 08:00 / 20:00 两批上传；点位字段含 lat/lon、露头描述、便携光谱号。我自动对齐 RSI 网格并标出偏差 &gt; 15% 的像素。</p>']
      ]
    },
    tir: {
      title: 'TIR quartz calibration',
      eyebrow: 'session · tir / quartz',
      messages: [
        ['system', 'boot', '<p>Loaded archive session · TIR calibration (demo).</p>'],
        ['user', '5d', '<p>石英 reststrahlen 带对 RSI 影响多大？</p>'],
        ['assistant', '5d', '<p>在 8–12 µm TIR 窗，石英抬高连续统，会稀释 SWIR 吸收深度。当前策略是分窗计算再加权融合，而不是把 TIR 直接塞进 SWIR 公式。</p>']
      ]
    },
    priors: {
      title: 'Hydrothermal prior sync',
      eyebrow: 'session · priors / sync',
      messages: [
        ['system', 'boot', '<p>Loaded archive session · Prior sync (demo).</p>'],
        ['user', '1w', '<p>同步蚀变分带先验到 harness。</p>'],
        ['assistant', '1w', '<p>已写入 propylitic → argillic → phyllic 邻接关系；下轮 planner 会用它约束异常聚类半径。</p>']
      ]
    },
    glossary: {
      title: '新人 RSI 术语对齐',
      eyebrow: 'session · onboarding',
      messages: [
        ['system', 'boot', '<p>Loaded archive session · Onboarding (demo).</p>'],
        ['user', '1w', '<p>给新人一页术语表。</p>'],
        ['assistant', '1w', '<p>核心：continuum（连续统）、shoulder（肩部）、core（吸收核）、τ（阈值）、argillic / phyllic（泥化 / 绢云母化）。面试题：为何湿季卫星影像慎用 RSI？</p>']
      ]
    }
  };

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function clockNow() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function formatUptime(ms) {
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + sec + 's';
    return sec + 's';
  }

  function tickStats() {
    if (statUptime) statUptime.textContent = formatUptime(Date.now() - started);
    if (statCycles) {
      var secs = Math.floor((Date.now() - started) / 1000);
      statCycles.textContent = String(baseCycles + Math.floor(secs / 12));
    }
  }
  tickStats();
  window.setInterval(tickStats, 1000);

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Pin the transcript to the bottom after every mutation so the latest
  // turn stays fully visible without manual scrolling.
  function scrollChatToEnd() {
    if (!log) return;
    log.scrollTop = log.scrollHeight;
    // One more pass after layout/animations settle.
    requestAnimationFrame(function () {
      log.scrollTop = log.scrollHeight;
      requestAnimationFrame(function () {
        log.scrollTop = log.scrollHeight;
        rebuildScrub();
      });
    });
  }

  function messageTextLength(el) {
    return (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim().length;
  }

  function scrollMessageIntoView(el) {
    if (!log || !el) return;
    // offsetTop is relative to offsetParent, not the scroll box — use rects.
    var top = el.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop;
    log.scrollTo({
      top: Math.max(0, top - 10),
      behavior: reduceMotion ? 'auto' : 'smooth'
    });
  }

  function rebuildScrub() {
    if (!scrubTrack || !log) return;
    var msgs = log.querySelectorAll('.harness-msg');
    var entries = [];
    var i;
    for (i = 0; i < msgs.length; i++) {
      if (!msgs[i].classList.contains('user')) continue;
      var body = msgs[i].querySelector('.harness-msg-body');
      var full = (body && body.textContent ? body.textContent : '').replace(/\s+/g, ' ').trim();
      var preview = full.length > 28 ? full.slice(0, 28) + '…' : full;
      var weight = Math.min(1, 0.18 + full.length / 140);
      entries.push({ el: msgs[i], preview: preview, weight: weight, text: full });
    }

    scrubTrack.innerHTML = '';
    if (scrubPop) scrubPop.innerHTML = '';

    if (!entries.length) {
      if (scrubPop) {
        var empty = document.createElement('p');
        empty.className = 'harness-scrub-pop-empty';
        empty.textContent = '暂无用户消息';
        scrubPop.appendChild(empty);
      }
      updateScrubActive();
      return;
    }

    for (i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var barW = Math.round(8 + entry.weight * 28);

      var tick = document.createElement('button');
      tick.type = 'button';
      tick.className = 'harness-scrub-tick';
      tick.style.width = barW + 'px';
      tick.style.height = '3px';
      tick.setAttribute('aria-label', entry.preview || 'user message');
      tick.dataset.index = String(i);
      (function (el, index) {
        tick.addEventListener('click', function () {
          scrollMessageIntoView(el);
          setActiveHot(index);
        });
      })(entry.el, i);
      scrubTrack.appendChild(tick);

      if (scrubPop) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'harness-scrub-pop-row';
        row.dataset.index = String(i);
        row.innerHTML =
          '<span class="harness-scrub-pop-label"></span>' +
          '<span class="harness-scrub-pop-bar" style="width:' + barW + 'px"></span>';
        row.querySelector('.harness-scrub-pop-label').textContent = entry.preview || entry.text;
        (function (el, index) {
          row.addEventListener('click', function () {
            scrollMessageIntoView(el);
            setActiveHot(index);
          });
        })(entry.el, i);
        scrubPop.appendChild(row);
      }
    }

    wireScrubHover();
    updateScrubActive();
  }

  function setActiveHot(index) {
    if (scrubTrack) {
      var ticks = scrubTrack.querySelectorAll('.harness-scrub-tick');
      for (var i = 0; i < ticks.length; i++) {
        ticks[i].classList.toggle('is-hot', i === index);
      }
    }
    if (scrubPop) {
      var rows = scrubPop.querySelectorAll('.harness-scrub-pop-row');
      for (var j = 0; j < rows.length; j++) {
        rows[j].classList.toggle('is-hot', j === index);
      }
    }
  }

  function clearActiveHot() {
    setActiveHot(-1);
  }

  function wireScrubHover() {
    if (!scrubTrack || !scrubPop || !scrubRoot) return;

    function indexFromEvent(event) {
      var t = event.target.closest && (event.target.closest('.harness-scrub-tick') || event.target.closest('.harness-scrub-pop-row'));
      return t ? Number(t.getAttribute('data-index')) : Number.NaN;
    }

    function onMove(event) {
      var idx = indexFromEvent(event);
      if (!Number.isNaN(idx)) setActiveHot(idx);
      else if (!scrubRoot.contains(event.relatedTarget)) {
        // keep last hot while inside scrub; clear when leaving entirely
      }
    }

    scrubTrack.addEventListener('pointerover', onMove);
    if (scrubPop) scrubPop.addEventListener('pointerover', onMove);
    scrubRoot.addEventListener('pointerleave', clearActiveHot);
  }

  function updateScrubActive() {
    if (!scrubTrack || !log) return;
    var ticks = scrubTrack.querySelectorAll('.harness-scrub-tick');
    if (!ticks.length) return;
    var users = log.querySelectorAll('.harness-msg.user');
    // Match jump target: user message closest to the top of the chat viewport.
    var anchor = log.scrollTop + 10;
    var logTop = log.getBoundingClientRect().top;
    var best = 0;
    var bestDist = Infinity;
    for (var i = 0; i < ticks.length; i++) {
      var msg = users[i];
      if (!msg) continue;
      var top = msg.getBoundingClientRect().top - logTop + log.scrollTop;
      var dist = Math.abs(top - anchor);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    for (var j = 0; j < ticks.length; j++) {
      ticks[j].classList.toggle('is-active', j === best);
      if (j === best) ticks[j].setAttribute('aria-selected', 'true');
      else ticks[j].removeAttribute('aria-selected');
    }
  }

  function stepScrub(dir) {
    if (!scrubTrack || !log) return;
    var ticks = scrubTrack.querySelectorAll('.harness-scrub-tick');
    var current = 0;
    for (var i = 0; i < ticks.length; i++) {
      if (ticks[i].classList.contains('is-active')) { current = i; break; }
    }
    var next = Math.max(0, Math.min(ticks.length - 1, current + dir));
    ticks[next].click();
  }

  if (log) {
    log.addEventListener('scroll', function () {
      updateScrubActive();
    }, { passive: true });
  }
  if (scrubUp) scrubUp.addEventListener('click', function () { stepScrub(-1); });
  if (scrubDown) scrubDown.addEventListener('click', function () { stepScrub(1); });

  function appendMessage(role, html) {
    var article = document.createElement('article');
    article.className = 'harness-msg ' + role;
    var roleLabel = role === 'user' ? 'you' : (role === 'system' ? 'system' : 'harness');
    article.innerHTML =
      '<div class="harness-msg-meta"><span class="harness-msg-role">' + roleLabel + '</span><time>' + clockNow() + '</time></div>' +
      '<div class="harness-msg-body">' + html + '</div>';
    log.appendChild(article);
    scrollChatToEnd();
    return article;
  }

  function renderMessageList(list) {
    log.innerHTML = '';
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var role = item[0];
      var roleLabel = role === 'user' ? 'you' : (role === 'system' ? 'system' : 'harness');
      var article = document.createElement('article');
      article.className = 'harness-msg ' + role;
      article.innerHTML =
        '<div class="harness-msg-meta"><span class="harness-msg-role">' + roleLabel + '</span><time>' + item[1] + '</time></div>' +
        '<div class="harness-msg-body">' + item[2] + '</div>';
      log.appendChild(article);
    }
    scrollChatToEnd();
    rebuildScrub();
  }

  function loadSession(id) {
    var data = SESSIONS[id] || SESSIONS.current;
    if (sessionTitle) sessionTitle.textContent = data.title;
    if (sessionEyebrow) sessionEyebrow.textContent = data.eyebrow;
    renderMessageList(data.messages);
    if (historyList) {
      var links = historyList.querySelectorAll('.harness-history-item');
      for (var i = 0; i < links.length; i++) {
        var active = links[i].getAttribute('data-session') === id;
        links[i].classList.toggle('is-active', active);
        if (active) links[i].setAttribute('aria-current', 'page');
        else links[i].removeAttribute('aria-current');
      }
    }
  }

  if (historyList) {
    historyList.addEventListener('click', function (event) {
      var item = event.target.closest && event.target.closest('.harness-history-item');
      if (!item) return;
      event.preventDefault();
      loadSession(item.getAttribute('data-session') || 'current');
    });
  }

  if (newSessionBtn) {
    newSessionBtn.addEventListener('click', function () {
      var id = 'new-' + Date.now();
      SESSIONS[id] = {
        title: 'Untitled session',
        eyebrow: 'session · new',
        messages: [
          ['system', clockNow(), '<p>New session started. Describe a task for the harness.</p>']
        ]
      };
      if (historyList) {
        var link = document.createElement('a');
        link.className = 'harness-history-item is-active';
        link.href = '#' + id;
        link.setAttribute('data-session', id);
        link.innerHTML = '<span class="harness-history-title">Untitled session</span><span class="harness-history-meta">just now · 0 turns</span>';
        var first = historyList.firstChild;
        historyList.insertBefore(link, first);
        var others = historyList.querySelectorAll('.harness-history-item:not([data-session="' + id + '"])');
        for (var i = 0; i < others.length; i++) {
          others[i].classList.remove('is-active');
          others[i].removeAttribute('aria-current');
        }
      }
      loadSession(id);
      input.focus({ preventScroll: true });
    });
  }

  function setCtaActive(on) {
    var agents = agentList && agentList.querySelectorAll('li');
    if (!agents || !agents.length) return;
    agents.forEach(function (li, index) {
      var dot = li.querySelector('.harness-dot');
      var em = li.querySelector('em');
      if (on && index === 1) {
        if (dot) dot.classList.add('active');
        if (em) em.textContent = 'working';
      } else if (!on && index === 1) {
        if (dot) dot.classList.remove('active');
        if (em) em.textContent = 'standby';
      }
    });
  }

  function harnessReply(userText) {
    var lower = userText.toLowerCase();
    var html;
    if (/rsi|index|比值|指数|光谱/.test(lower)) {
      html = '<p>已把 RSI 解释排入本周期。当前默认读：</p>' +
        '<pre class="harness-code">RSI = (shoulder − core) / shoulder\n' +
        'window: 1.9 – 2.5 µm · τ = 0.18</pre>' +
        '<p>若你有场景（地表反射率 / 相对辐射），我可以在下一轮收紧阈值。</p>';
    } else if (/蚀变|alunite|kaolinite|clay|泥|高岭/.test(lower)) {
      html = '<p>Al-OH 2.2 µm 深度仍在 argillic 阈值内。建议优先核验 SWIR2 上的 2.35 µm Fe-OH 协同，避免把碳酸盐混进 clay 标签。</p>' +
        '<p class="harness-muted">任务已写入右侧 queue（演示）。</p>';
    } else if (/野外|field|采样|巡检/.test(lower)) {
      html = '<p>野外回传通道保持 7×24 挂起。照片与点位接入后，我会做一次自动 RSI 复算并标出阈值边缘像素。</p>';
    } else if (/状态|status|runtime|周期/.test(lower)) {
      html = '<p>Runtime 在线 · 自进化循环正常。Agents：Core planner idle；RSI analyst 待命。</p>';
    } else {
      html = '<p>已记录：' + escapeHtml(userText.slice(0, 180)) + (userText.length > 180 ? '…' : '') + '</p>' +
        '<p>演示 harness 无后端模型；我会用本地规则回复。正式接入后，这条消息会进入 planner 队列。</p>';
    }

    setCtaActive(true);
    if (statCycles) {
      var secs = Math.floor((Date.now() - started) / 1000);
      statCycles.textContent = String(baseCycles + 1 + Math.floor(secs / 12));
    }

    if (reduceMotion) {
      appendMessage('assistant', html);
      setCtaActive(false);
      return;
    }

    var pending = appendMessage('assistant', '<p class="harness-muted">thinking…</p>');
    window.setTimeout(function () {
      pending.querySelector('.harness-msg-body').innerHTML = html;
      rebuildScrub();
      scrollChatToEnd();
      setCtaActive(false);
    }, 480 + Math.random() * 420);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var text = (input.value || '').trim();
    if (!text) return;
    appendMessage('user', '<p>' + escapeHtml(text).replace(/\n/g, '<br>') + '</p>');
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    harnessReply(text);
    window.setTimeout(function () { sendBtn.disabled = false; input.focus(); }, 700);
  });

  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  input.addEventListener('input', function () {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 144) + 'px';
  });

  scrollChatToEnd();
  rebuildScrub();
  input.focus({ preventScroll: true });
})();
