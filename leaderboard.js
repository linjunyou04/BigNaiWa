/*!
 * 合成大奶娃 · 排行榜（Supabase 版）
 * ------------------------------------------------------------------
 * 与原版 leaderboard.min.js 的区别：
 *   - 后端从 TinyWebDB 换成 Supabase（表 public.bignaiwa）
 *   - 展示「全量」记录，不再只取最近 20 次
 *   - 列表可滑动（样式在 style.css 的 .board-list）
 *   - 提交改成手动：游戏结束时不再自动上传，点「提交分数」才提交
 *
 * 安全说明：这里用的 anon key 是「可公开」的密钥，受 RLS 约束 ——
 * 只能 SELECT 和 INSERT，不能 UPDATE / DELETE。请勿把 service_role key 放进来。
 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://znzncniwelbmkkdyuapz.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpuem5jbml3ZWxibWtrZHl1YXB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NDU1MjAsImV4cCI6MjEwNjUyMTUyMH0.RR0A1TIUfxIz5Q1_OBKptazaltFI90hp56PSfmVGLl4';
  var TABLE = 'bignaiwa';

  var NAME_KEY = 'danaiwa.name';
  var DEFAULT_NAME = '默认用户';
  var MAX_NAME_LEN = 12;
  var MAX_SCORE = 99999999;

  /* 一次最多拉多少条。Supabase 单次上限 1000，够用了；
     真要更多得翻页，但排行榜没必要无限长。 */
  var PAGE_SIZE = 1000;

  /* 提交冷却：防止手抖连点 */
  var MUTE_MIN_GAP = 3000;

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- 网络层 ---------------- */

  function rest(path, init) {
    var opts = init || {};
    opts.headers = Object.assign({
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY
    }, opts.headers || {});
    return fetch(SUPABASE_URL + '/rest/v1/' + path, opts).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        if (text) {
          try { data = JSON.parse(text); } catch (e) { data = text; }
        }
        if (!res.ok) {
          var msg = (data && data.message) ? data.message : ('HTTP ' + res.status);
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  /* 拉全量排行榜：按分数降序，同分先提交的在前 */
  function fetchTop() {
    var q = TABLE + '?select=id,name,score,created_at' +
      '&order=score.desc,created_at.asc' +
      '&limit=' + PAGE_SIZE;
    return rest(q, { method: 'GET' }).then(function (rows) {
      if (!Array.isArray(rows)) return [];
      return rows.map(function (r) {
        return {
          id: r.id,
          name: String(r.name || '匿名玩家').slice(0, MAX_NAME_LEN),
          score: Number(r.score) || 0,
          t: Date.parse(r.created_at) || 0
        };
      }).filter(function (r) {
        return r.score >= 0 && r.score <= MAX_SCORE;
      });
    });
  }

  function addScore(name, score) {
    var n = cleanName(name) || DEFAULT_NAME;
    var s = Math.max(0, Math.min(MAX_SCORE, Math.round(Number(score) || 0)));
    return rest(TABLE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ name: n, score: s })
    });
  }

  /* ---------------- 昵称 ---------------- */

  function cleanName(raw) {
    var n = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (n.length > MAX_NAME_LEN) n = n.slice(0, MAX_NAME_LEN);
    return n;
  }

  function loadName() {
    try { return cleanName(localStorage.getItem(NAME_KEY) || ''); } catch (e) { return ''; }
  }

  function saveName(n) {
    try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* 无痕模式忽略 */ }
  }

  function myName() {
    return loadName() || DEFAULT_NAME;
  }

  /* ---------------- DOM ---------------- */

  var listEl = $('boardList');
  var modal = $('boardModal');
  var msgEl = $('submitMsg');
  var nickInput = $('nickInput');
  var nameLabel = $('myNameLabel');
  var submitBtn = $('submitBtn');
  var submitBox = $('submitBox');
  var boardCountEl = $('boardCount');

  var lastSubmitAt = 0;
  var submitting = false;
  var submitted = false;   // 本局是否已提交过，避免重复提交
  var pendingScore = 0;

  function setMsg(text, kind) {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.className = 'submit-msg' + (kind ? ' is-' + kind : '');
  }

  function paintName() {
    var n = myName();
    if (nameLabel) nameLabel.textContent = n;
    if (nickInput && document.activeElement !== nickInput) nickInput.value = loadName();
  }

  function boardMessage(text) {
    if (!listEl) return;
    listEl.textContent = '';
    var p = document.createElement('p');
    p.className = 'board-empty';
    p.textContent = text;
    listEl.appendChild(p);
  }

  function rankClass(i) {
    return i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : '';
  }

  function renderBoard(rows, myScore) {
    if (!listEl) return;
    listEl.textContent = '';
    if (!rows.length) {
      boardMessage('还没有人提交，快去玩一局抢第一！');
      if (boardCountEl) boardCountEl.textContent = '共 0 条记录';
      return;
    }
    if (boardCountEl) boardCountEl.textContent = '共 ' + rows.length + ' 条记录（全部展示）';

    var frag = document.createDocumentFragment();
    var marked = false;
    rows.forEach(function (row, i) {
      var line = document.createElement('div');
      line.className = 'board-row ' + rankClass(i);

      var rank = document.createElement('span');
      rank.className = 'board-rank';
      rank.textContent = i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1);

      var name = document.createElement('span');
      name.className = 'board-name';
      name.textContent = row.name;

      var score = document.createElement('span');
      score.className = 'board-score';
      score.textContent = row.score;

      line.appendChild(rank);
      line.appendChild(name);
      line.appendChild(score);

      /* 只标记一条「我自己」：优先标记分数匹配、且靠前的那条 */
      if (!marked && myScore != null && row.score === myScore) {
        line.classList.add('is-mine');
        marked = true;
      }
      frag.appendChild(line);
    });
    listEl.appendChild(frag);
  }

  function refreshBoard(myScore) {
    boardMessage('正在读取排行榜…');
    return fetchTop().then(function (rows) {
      renderBoard(rows, myScore);
      return rows;
    }).catch(function (err) {
      boardMessage('读取失败：' + err.message + '（检查一下网络？）');
      throw err;
    });
  }

  function openBoard() {
    if (!modal) return;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    refreshBoard(null).catch(function () {});
  }

  function closeBoard() {
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }

  /* ---------------- 提交 ---------------- */

  function setSubmitState(state) {
    /* state: 'hidden' | 'ready' | 'busy' | 'done' */
    if (!submitBtn) return;
    if (state === 'hidden') {
      submitBtn.hidden = true;
      return;
    }
    submitBtn.hidden = false;
    submitBtn.disabled = state === 'busy' || state === 'done';
    if (state === 'busy') submitBtn.textContent = '正在提交…';
    else if (state === 'done') submitBtn.textContent = '已提交 ✓';
    else submitBtn.textContent = '提交分数';
  }

  function pushScore(name, score, skipGap) {
    if (submitting) return Promise.resolve(false);
    if (submitted) {
      setMsg('这一局已经提交过啦', 'bad');
      return Promise.resolve(false);
    }
    if (!skipGap) {
      var now = Date.now();
      if (now - lastSubmitAt < MUTE_MIN_GAP) {
        setMsg('刚提交过啦，稍等一下', 'bad');
        return Promise.resolve(false);
      }
    }
    submitting = true;
    setSubmitState('busy');
    setMsg('正在提交…', '');
    return addScore(name, score).then(function () {
      lastSubmitAt = Date.now();
      submitted = true;
      setSubmitState('done');
      setMsg('已上榜 ✓　' + (cleanName(name) || DEFAULT_NAME) + ' · ' + score + ' 分', 'good');
      return refreshBoard(score).then(function () { return true; }, function () { return true; });
    }).catch(function (err) {
      setMsg('提交失败：' + err.message, 'bad');
      setSubmitState('ready');
      return false;
    }).then(function (ok) {
      submitting = false;
      return ok;
    });
  }

  function submitNow() {
    if (!(pendingScore > 0)) return;
    pushScore(myName(), pendingScore, true);
  }

  /* 游戏结束：只准备界面，不自动提交 —— 等玩家点「提交分数」 */
  function onGameOver(score) {
    if (!submitBox) return;
    pendingScore = Number(score) || 0;
    submitted = false;
    paintName();
    if (!(pendingScore > 0)) {
      submitBox.style.display = 'none';
      return;
    }
    submitBox.style.display = '';
    setSubmitState('ready');
    setMsg('点下面的按钮提交成绩', '');
  }

  /* ---------------- 绑定 ---------------- */

  function bind() {
    var boardBtn = $('boardBtn');
    if (boardBtn) boardBtn.addEventListener('click', openBoard);
    var boardBtn2 = $('boardBtn2');
    if (boardBtn2) boardBtn2.addEventListener('click', openBoard);
    var closeBtn = $('boardClose');
    if (closeBtn) closeBtn.addEventListener('click', closeBoard);
    var refreshBtn = $('boardRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', function () {
      refreshBoard(null).catch(function () {});
    });
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeBoard();
      });
    }
    if (submitBtn) submitBtn.addEventListener('click', submitNow);

    if (nickInput) {
      nickInput.value = loadName();
      var commit = function () {
        saveName(cleanName(nickInput.value));
        nickInput.value = loadName();
        paintName();
      };
      nickInput.addEventListener('change', commit);
      nickInput.addEventListener('blur', commit);
      nickInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); commit(); nickInput.blur(); }
      });
    }

    var editNameBtn = $('editNameBtn');
    if (editNameBtn) {
      editNameBtn.addEventListener('click', function () {
        openBoard();
        if (nickInput) setTimeout(function () { nickInput.focus(); nickInput.select(); }, 260);
      });
    }

    paintName();
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeBoard();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.DanaiwaBoard = {
    open: openBoard,
    close: closeBoard,
    refresh: refreshBoard,
    onGameOver: onGameOver,
    submitNow: submitNow,
    fetchTop: fetchTop,
    submitScore: addScore,
    myName: myName,
    setName: function (n) { saveName(cleanName(n)); paintName(); },
    hasName: function () { return !!loadName(); }
  };
})();
