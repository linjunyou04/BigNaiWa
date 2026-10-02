/*
 * 开局公告自检
 * ------------------------------------------------------------------
 * 用最小 DOM 桩加载 leaderboard.js，验证：
 *   A. 首访自动弹出公告
 *   B. 公告里能起名并写进 localStorage
 *   C. 没名字时点背景 / 按 Esc 关不掉
 *   D. 起过名字后可以正常关闭，且关掉后不再自动弹
 *   E. 公告里的排行榜会去拉数据并渲染（复用主榜单渲染）
 *   F. 没名字时不能通过 Esc 溜走
 * 运行：node intro.test.js
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function group(t) { console.log('\n' + t); }

/* ---------------- DOM 桩 ---------------- */

function makeEl(id) {
  const el = {
    id,
    className: '',
    hidden: false,
    disabled: false,
    value: '',
    style: {},
    children: [],
    _cls: new Set(),
    _handlers: {},
    classList: {
      add(c) { el._cls.add(c); },
      remove(c) { el._cls.delete(c); },
      contains(c) { return el._cls.has(c); }
    },
    setAttribute() {},
    getAttribute() { return null; },
    appendChild(c) {
      /* DocumentFragment 语义：把它的子节点摊平推进来，fragment 本身不入树 */
      if (c && c._isFragment) {
        c.children.forEach(k => { el.children.push(k); k.parentNode = el; });
        c.children.length = 0;
        return c;
      }
      el.children.push(c);
      c.parentNode = el;
      return c;
    },
    addEventListener(t, fn) { (el._handlers[t] = el._handlers[t] || []).push(fn); },
    removeEventListener() {},
    focus() {}, blur() {}, select() {},
    dispatch(t, ev) { (el._handlers[t] || []).forEach(fn => fn(ev || {})); }
  };
  /* textContent 读时拼接子节点文字，写时清空子节点 —— 对齐真实 DOM 语义 */
  let _text = '';
  Object.defineProperty(el, 'textContent', {
    get() {
      if (el.children.length) return el.children.map(c => c.textContent).join('');
      return _text;
    },
    set(v) {
      _text = v === null || v === undefined ? '' : String(v);
      el.children.length = 0;
    },
    enumerable: true
  });
  return el;
}

const IDS = ['boardList', 'boardModal', 'submitMsg', 'nickInput', 'myNameLabel',
  'submitBtn', 'submitBox', 'boardCount', 'boardBtn', 'boardBtn2', 'boardClose',
  'boardRefresh', 'editNameBtn', 'introModal', 'introBoard', 'introNickInput',
  'introClose', 'introStart'];

const els = {};
IDS.forEach(id => { els[id] = makeEl(id); });

const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};

const winHandlers = {};
const docHandlers = {};

let fetchCalls = [];
let fetchImpl = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('[]') });

const sandbox = {
  console,
  localStorage,
  setTimeout,
  clearTimeout,
  Date,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number,
  Promise,
  Error,
  document: {
    readyState: 'complete',
    getElementById: id => els[id] || null,
    createElement: tag => makeEl('<' + tag + '>'),
    createDocumentFragment: () => { const f = makeEl('#frag'); f._isFragment = true; return f; },
    addEventListener: (t, fn) => { (docHandlers[t] = docHandlers[t] || []).push(fn); },
    activeElement: null
  },
  window: {
    addEventListener: (t, fn) => { (winHandlers[t] = winHandlers[t] || []).push(fn); }
  },
  fetch: (url, init) => {
    fetchCalls.push({ url, init });
    return fetchImpl(url, init);
  }
};
sandbox.window.document = sandbox.document;
sandbox.self = sandbox.window;
sandbox.globalThis = sandbox;

const ctx = vm.createContext(sandbox);
const src = fs.readFileSync(path.join(__dirname, 'leaderboard.js'), 'utf8');
vm.runInContext(src, ctx, { filename: 'leaderboard.js' });

const Board = sandbox.window.DanaiwaBoard;
const tick = () => new Promise(r => setTimeout(r, 5));
const fireKey = key => (winHandlers.keydown || []).forEach(fn => fn({ key }));

/* ---------------- A. 首访自动弹公告 ---------------- */

(async function run() {
  group('A. 首访自动弹出公告');
  check('声明了 DanaiwaBoard', !!Board);
  check('公告容器处于 show 状态', els.introModal.classList.contains('show'),
    '实际 class=' + [...els.introModal._cls]);
  check('公告里触发了排行读取', fetchCalls.length > 0,
    'fetch 次数=' + fetchCalls.length);

  /* 首访时没名字 */
  check('首次访问还没有名字', Board.hasName() === false);

  /* ---------------- C. 没名字关不掉 ---------------- */

  group('C. 没起名字时不让溜走');
  Board.hideIntro();
  check('直接调用 hideIntro 仍然会关（内部 API，供开始按钮用）',
    els.introModal.classList.contains('show') === false);

  Board.showIntro();
  check('重新打开成功', els.introModal.classList.contains('show'));

  /* 点背景 */
  els.introModal.dispatch('click', { target: els.introModal });
  check('点背景不关闭（因为还没名字）', els.introModal.classList.contains('show'));

  /* Esc */
  fireKey('Escape');
  check('按 Esc 不关闭（因为还没名字）', els.introModal.classList.contains('show'));

  /* ---------------- B. 起名字 ---------------- */

  group('B. 在公告里起名字');
  els.introNickInput.value = '  奶  娃  大  王  ';
  els.introNickInput.dispatch('change');
  check('名字已保存（去除首尾空格）', store['danaiwa.name'] === '奶  娃  大  王',
    '实际=' + JSON.stringify(store['danaiwa.name']));
  check('hasName() = true', Board.hasName() === true);
  check('主界面的昵称标签同步更新',
    els.myNameLabel.textContent === '奶  娃  大  王',
    '实际=' + els.myNameLabel.textContent);

  /* 超长名字截断 */
  els.introNickInput.value = '一二三四五六七八九十十一十二十三';
  els.introNickInput.dispatch('change');
  check('名字超过 12 字被截断', store['danaiwa.name'].length === 12,
    '长度=' + store['danaiwa.name'].length);

  /* 控制字符清理 */
  els.introNickInput.value = 'a\u0000b\u001fc';
  els.introNickInput.dispatch('change');
  check('控制字符被清掉', store['danaiwa.name'] === 'abc',
    '实际=' + JSON.stringify(store['danaiwa.name']));

  els.introNickInput.value = '奶娃大王';
  els.introNickInput.dispatch('change');

  /* ---------------- D. 有名字后可以关闭 ---------------- */

  group('D. 起完名字就能关闭');
  els.introModal.dispatch('click', { target: els.introModal });
  check('点背景关闭成功', els.introModal.classList.contains('show') === false);
  check('已记录「看过公告」', store['danaiwa.introSeen'] === '1');

  Board.showIntro();
  fireKey('Escape');
  check('Esc 也能关闭', els.introModal.classList.contains('show') === false);

  /* ---------------- E. 公告里的第一名 ---------------- */

  group('E. 公告内只展示当前第一名（名字 + 分数）');
  fetchImpl = () => Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify([
      { id: 1, name: '甲', score: 900, created_at: '2026-10-01T00:00:00Z' },
      { id: 2, name: '乙', score: 500, created_at: '2026-10-02T00:00:00Z' },
      { id: 3, name: '丙', score: 300, created_at: '2026-10-03T00:00:00Z' }
    ]))
  });
  fetchCalls = [];
  Board.showIntro();
  await tick(); await tick();

  const introTxt = els.introBoard.children.map(c => c.textContent).join('');
  check('公告里只有 1 个节点（不是多行列表）', els.introBoard.children.length === 1,
    '实际=' + els.introBoard.children.length);
  check('文案里带第一名名字「甲」', /甲/.test(introTxt), '实际=' + JSON.stringify(introTxt));
  check('文案里带分数 900', /900/.test(introTxt), '实际=' + JSON.stringify(introTxt));
  check('带奖牌 🥇', /🥇/.test(introTxt), '实际=' + JSON.stringify(introTxt));
  check('不含第二/第三名', !/乙|丙/.test(introTxt), '实际=' + JSON.stringify(introTxt));

  /* 关键：公告渲染不能污染主榜单容器 */
  check('主榜单容器未被公告渲染影响',
    els.boardList.children.length === 0,
    '主榜单子节点数=' + els.boardList.children.length);

  /* 主榜单仍能独立渲染全量 */
  Board.refresh();
  await tick(); await tick();
  check('主榜单能独立渲染全部 3 条', els.boardList.children.length === 3,
    '实际=' + els.boardList.children.length);

  /* ---------------- F. 空榜文案 ---------------- */

  group('F. 排行榜为空时的提示');
  fetchImpl = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('[]') });
  Board.showIntro();
  await tick(); await tick();
  const firstTxt = els.introBoard.children.map(c => c.textContent).join('');
  check('公告空榜给出专属引导文案', /第一名等你来拿/.test(firstTxt),
    '实际=' + JSON.stringify(firstTxt));

  Board.refresh();
  await tick(); await tick();
  check('主榜单空榜文案不受影响用原句',
    els.boardList.children[0] && /还没有人提交/.test(els.boardList.children[0].textContent),
    '实际=' + (els.boardList.children[0] && els.boardList.children[0].textContent));

  /* ---------------- G. 读取失败 ---------------- */

  group('G. 读取失败时的降级');
  fetchImpl = () => Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('boom') });
  Board.showIntro();
  await tick(); await tick();
  const bad = els.introBoard.children[0];
  check('失败时给出提示而不是空白', bad && /读取失败/.test(bad.textContent),
    '实际=' + (bad && bad.textContent));

  /* ---------------- H. resetIntro ---------------- */

  group('H. resetIntro 可让公告再次自动弹出');
  Board.resetIntro();
  check('introSeen 标记已清除', !('danaiwa.introSeen' in store));

  console.log('\n' + '─'.repeat(46));
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
})();
