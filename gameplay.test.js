/* ============================================================
 *  玩法自检：结算 + 神奶蛙清场 + 手动提交
 *  运行：node gameplay.test.js
 *
 *  覆盖：
 *    · 越线 → 直接结算（复活币已移除，不再有询问屏）
 *    · 结算时把成绩交给排行榜模块，但「不自动上传」，由玩家点按钮
 *    · 两只神奶蛙相撞：一起消失、+500、大字飘分、定格
 *    · 定格会自己结束，不会卡死
 *    · 投放权重被收紧过（难度参数没被写回原值）
 * ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = __dirname;

function makeCtx() {
  const g = { addColorStop() {} };
  return {
    setTransform() {}, save() {}, restore() {}, scale() {}, rotate() {}, translate() {},
    clearRect() {}, fillRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, ellipse() {}, clip() {}, stroke() {}, fill() {}, setLineDash() {},
    drawImage() {}, createLinearGradient: () => g, createRadialGradient: () => g,
    measureText: () => ({ width: 10 }), fillText() {}, strokeText() {},
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    font: '', textAlign: '', textBaseline: '', lineCap: ''
  };
}

function makeEl(id) {
  const el = {
    id, style: {}, textContent: '', width: 680, height: 112,
    hidden: false, disabled: false, offsetWidth: 100, _c: new Set(), _h: {},
    classList: {
      add: (c) => el._c.add(c), remove: (c) => el._c.delete(c), contains: (c) => el._c.has(c)
    },
    getContext: () => el._ctx || (el._ctx = makeCtx()),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 420, height: 700 }),
    addEventListener(t, fn) { el._h[t] = fn; },
    click() { if (el._h.click) el._h.click({ preventDefault() {} }); },
    querySelector: () => ({ textContent: '', style: {}, classList: { add() {}, remove() {} } }),
    setAttribute() {}, focus() {}, select() {}, blur() {}
  };
  return el;
}

const els = {};
['game', 'stage', 'overlay', 'score', 'best', 'finalScore', 'finalBest', 'next', 'chain',
 'soundBtn', 'resetBtn', 'restartBtn', 'overPanel',
 'boardBtn', 'boardBtn2', 'boardModal', 'boardList', 'boardClose', 'boardRefresh',
 'nickInput', 'myNameLabel', 'submitBtn', 'submitBox', 'submitMsg', 'editNameBtn', 'boardCount'
].forEach((id) => { els[id] = makeEl(id); });
els.overPanel.hidden = false;

const winListeners = {};
const sandbox = {
  console, Math, Date, JSON, Object, Array, Number, String, Boolean, Error, isNaN, parseFloat, parseInt,
  performance: { now: () => Date.now() },
  requestAnimationFrame() { return 1; },
  setTimeout, clearTimeout, setInterval, clearInterval,
  document: {
    readyState: 'complete',
    getElementById: (id) => els[id] || null,
    addEventListener() {}, createElement: () => makeEl('tmp'),
    querySelector: () => null, querySelectorAll: () => []
  },
  localStorage: {
    _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }
  },
  addEventListener(t, fn) { winListeners[t] = fn; },
  navigator: {},
  Image: class {
    constructor() { this.width = 512; this.height = 512; this.naturalWidth = 512; }
    set src(v) { this._src = v; if (this.onload) this.onload(); }
    get src() { return this._src; }
  }
};
sandbox.window = sandbox;
sandbox.window.addEventListener = (t, fn) => { winListeners[t] = fn; };
vm.createContext(sandbox);
const load = (f) => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
load('assets/fruits/parts.js');
load('game.js');

/* 假装排行榜模块已加载，记录它收到了什么 */
let gameOverCalls = 0;
let lastScore = null;
sandbox.window.DanaiwaBoard = {
  onGameOver(score) { gameOverCalls++; lastScore = score; return 'orig'; }
};

const G = sandbox.window.__DNW__;

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); }
}
function eq(a, b, label) { ok(a === b, label, 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }

const ball = (y, r) => ({ x: 200, y, r: r || 30, dead: false, landed: true, overTime: 0, vx: 0, vy: 0, tier: 0 });

console.log('玩法自检：结算 + 清场\n');

/* ---------- A. 复活币已彻底移除 ---------- */
console.log('[A] 复活币机制已移除');
G.reset();
eq(G.state.revives, undefined, 'state 上不再有 revives 字段');
eq(G.state.reviveGiven, undefined, 'state 上不再有 reviveGiven 字段');
eq(typeof G.revive, 'undefined', '调试句柄不再暴露 revive()');
eq(typeof G.paintRevives, 'undefined', '不再有 paintRevives()');
eq(G.REVIVE_STEP, undefined, '不再有 REVIVE_STEP 常量');
G.addScore(99999);
eq(G.state.score, 99999, '加多少分都不会再发币（state 没有 revives）');

/* ---------- B. 越线直接结算 ---------- */
console.log('\n[B] 越线 → 直接结算（不再有询问屏）');
G.reset();
gameOverCalls = 0;
G.state.balls = [ball(600), ball(300)];
G.gameOver();
eq(G.state.over, true, '标记为结束');
eq(els.overlay.classList.contains('show'), true, '遮罩弹出');
eq(els.overPanel.hidden, false, '直接是结算屏');
eq(gameOverCalls, 1, '把成绩交给了排行榜模块');
eq(els.finalScore.textContent, 0, '结算屏写上了本局得分');

/* ---------- C. 结算不等于自动上传 ---------- */
console.log('\n[C] 结算只是「通知」，不是「上传」');
G.reset();
G.addScore(1234);
gameOverCalls = 0;
G.gameOver();
eq(gameOverCalls, 1, '游戏结束时通知了排行榜模块一次');
ok(lastScore === 1234, '传过去的分数正确（1234）', 'got ' + lastScore);
/* game.js 只负责通知；是否真正上传由 leaderboard.js 的 onGameOver 决定，
   而那边现在是「只准备界面、等玩家点按钮」。这里断言 game.js 没有自己的上传通道。 */
ok(typeof G.submitScore === 'undefined', 'game.js 里没有直接上传分数的入口');

/* ---------- D. 神奶蛙清场 ---------- */
console.log('\n[D] 两只神奶蛙一起炸掉');
G.reset();
const r10 = G.FRUITS[10].r;
G.state.balls.length = 0;
const wa = G.makeBall(210, 500, 10, 0, 0); wa.landed = true; wa.py = wa.y;
const wb = G.makeBall(210, 500 - (2 * r10 + 0.6), 10, 0, 0); wb.landed = true; wb.py = wb.y;
G.state.balls.push(wa, wb);
eq(G.state.balls.length, 2, '先摆好两只神奶蛙');

let merged = false;
for (let i = 0; i < 60 && !merged; i++) {
  G.stepPhysics(1 / 60);
  if (G.state.balls.length === 0) merged = true;
}
ok(merged, '两只神奶蛙相撞后一起消失');
eq(G.state.score, G.MAX_BONUS, '得分正好是 MAX_BONUS');
eq(G.MAX_BONUS, 500, 'MAX_BONUS 是 500');
ok(G.state.freeze > 0, '触发了定格（freeze > 0）');
ok(G.state.freeze <= 0.2, '定格时长合理（≤200ms）');
const bigFloat = G.state.floats.filter((f) => f.big);
eq(bigFloat.length, 1, '有且只有一个大字飘分（不会和普通飘字重复）');
eq(bigFloat[0].text, '+500', '大字写的是 +500');
eq(G.state.floats.length, 2, '一共就两行飘字：大字 +500、小字说明');
ok(G.state.floats.some((f) => f.text.indexOf('两个神奶蛙') >= 0), '还有一行「两个神奶蛙」说明文字');

/* ---------- E. 定格会自己结束 ---------- */
console.log('\n[E] 定格会自己结束');
G.reset();
G.state.freeze = 0.13;
G.update(0.05);
ok(G.state.freeze > 0.07 && G.state.freeze < 0.09, '定格在倒计时（0.13 → 约 0.08）');
G.update(0.05);
G.update(0.05);
eq(G.state.freeze, 0, '倒计时结束后归零');
G.update(1 / 60);
eq(G.state.freeze, 0, '之后正常走更新，不报错');

/* ---------- F. 难度参数（投放权重收紧） ---------- */
console.log('\n[F] 难度参数没被写回原值');
const w = G.SPAWN_WEIGHTS;
ok(Array.isArray(w) && w.length === 5, '权重表是 5 项');
eq(w[0], 0.40, 'tier0（葡萄）权重 = 0.40');
eq(w[1], 0.28, 'tier1 权重 = 0.28');
eq(w[2], 0.18, 'tier2 权重 = 0.18');
eq(w[3], 0.09, 'tier3 权重 = 0.09');
eq(w[4], 0.05, 'tier4（最大投放档）权重 = 0.05');
const sum = w.reduce((a, b) => a + b, 0);
ok(Math.abs(sum - 1) < 1e-9, '权重和为 1（= ' + sum + '）');
ok(w[3] < 0.16 && w[4] < 0.12, '大水果权重低于原版（原 0.16 / 0.12）');

/* ---------- G. 物理参数保持上游原值 ---------- */
console.log('\n[G] 物理参数保持上游原值（弹跳未改动）');
eq(G.REST_THRESHOLD, 55, '反弹触发阈值 = 55（上游原值）');
eq(G.RESTITUTION, 0.38, '球球弹性 = 0.38（上游原值）');
eq(G.WALL_RESTITUTION, 0.45, '撞墙弹性 = 0.45（上游原值）');
eq(G.FRICTION, 0.955, '切向摩擦 = 0.955（上游原值）');
eq(G.SQUASH_MAX, 0.30, '最大挤压变形 = 0.30（上游原值）');

console.log('\n' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
