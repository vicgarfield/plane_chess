/**
 * 棋盘飞机对战 - 微信小游戏入口（Canvas 渲染）
 * 仅支持人机对战（PvE）模式
 */

// ==================== 导入游戏逻辑模块 ====================
const Plane = require('./utils/plane');
const Board = require('./utils/board');
const Game = require('./utils/game');

// ==================== Canvas 初始化 ====================
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');

// 高清屏适配：物理像素 = 逻辑像素 × DPR
const sysInfo = wx.getSystemInfoSync();
const DPR = sysInfo.pixelRatio || 1;
let W = sysInfo.windowWidth;
let H = sysInfo.windowHeight;
canvas.width = W * DPR;
canvas.height = H * DPR;

// 安全区顶部偏移（适配 iPhone 灵动岛/刘海屏）
const SAFE_TOP = (sysInfo.safeArea || {}).top || 0;

// ==================== 颜色常量 ====================
// 统一深空蓝主题：背景深蓝渐变 + 金橙主色 + 翡翠/玫红点缀
const C = {
  // 背景（深空蓝渐变）
  bgTop: '#0b1026',
  bgBottom: '#1a2444',
  bg: '#101736',
  panelBg: 'rgba(6,10,28,0.82)',

  // 标题/强调
  title: '#ffd200',
  titleDark: '#ff9f43',
  titleGlow: 'rgba(255,210,0,0.45)',

  // 棋盘
  cellBg: 'rgba(255,255,255,0.055)',
  cellBgHover: 'rgba(255,255,255,0.13)',
  gridLine: 'rgba(255,255,255,0.09)',
  headerBg: 'rgba(255,255,255,0.075)',
  headerText: '#7d8db0',

  // 飞机
  planeHead: '#ff4d6d',
  planeHeadGlow: 'rgba(255,77,109,0.65)',
  planeBody: '#2dd4a7',

  // 攻击结果
  miss: '#5c6c8a',
  hitBg: '#ffb020',
  hitGlow: 'rgba(255,176,32,0.55)',
  killBg: '#ff4d6d',
  killGlow: 'rgba(255,77,109,0.65)',

  // 布阵预览
  previewValid: 'rgba(45,212,167,0.20)',
  previewInvalid: 'rgba(255,77,109,0.20)',
  previewHeadValid: 'rgba(45,212,167,0.48)',
  previewHeadInvalid: 'rgba(255,77,109,0.48)',

  // 文字
  text: '#e8ecf4',
  textDim: '#8b97b5',
  textGray: '#9aa5c4',
  ruleBoxBg: 'rgba(255,255,255,0.045)',
  ruleBoxBorder: 'rgba(255,255,255,0.10)',

  // 日志
  logMiss: '#5c6c8a',
  logHit: '#ffb020',
  logKill: '#ff4d6d',

  // 弹窗
  popupMissBg: 'rgba(92,108,138,0.93)',
  popupHitBg: 'rgba(255,176,32,0.93)',
  popupKillBg: 'rgba(255,77,109,0.93)',

  overlayBg: 'rgba(0,0,0,0.6)',
  waitBg: 'rgba(0,0,0,0.55)',
};

// 按钮样式表：渐变配色（from → to），统一胶囊 + 高光 + 投影
const BTN = {
  primary: { from: '#ffc24b', to: '#ff8a00' }, // 金橙（主操作）
  warning: { from: '#ffc24b', to: '#ff9f43' }, // 暖橙（次级操作）
  success: { from: '#37d6ab', to: '#12a37f' }, // 翡翠（确认/分享）
  danger:  { from: '#ff6b81', to: '#e63950' }, // 玫红（退出/认输）
  ghost:   { from: '#3d4a6e', to: '#2a324e' }, // 暗蓝（次要）
};

// ==================== 游戏状态 ====================
let game = new Game();
let phase = 'start';        // start | setup | battle | gameover
let previewMap = {};        // 布阵预览 map: "x,y" -> className
let activePreview = null;   // 当前预览的机头坐标 { x, y }
let aiThinking = false;     // AI 思考中
let attackPopup = null;     // 攻击弹窗 { text, type, startTime }
let showOverlay = false;    // 是否显示遮罩
let overlayText = '';       // 遮罩文字
let scrollOffset = 0;       // 滚动偏移
let maxScroll = 0;          // 最大滚动距离
let dragStartY = 0;
let dragScrollStart = 0;
let isDragging = false;
let dragMoved = false;
let popupStartTime = 0;

// ==================== 布局计算 ====================
const L = {};

function calcLayout() {
  // W/H 已在初始化时设为逻辑像素，canvas.width/height = 物理像素（× DPR）
  // ctx.setTransform 负责 DPR 缩放，此处使用逻辑像素计算布局

  if (phase === 'battle' || phase === 'gameover') {
    // 对战/结算画面需要竖排放两个棋盘，格子按高度约束更小
    const wCell = Math.floor((W - 16) / 11.5);
    const hCell = Math.floor((H - SAFE_TOP - 140) / 23);
    L.cellSize = Math.max(20, Math.min(wCell, hCell));
  } else {
    L.cellSize = Math.max(24, Math.min(34, Math.floor((W - 16) / 11.5)));
  }
  L.gridUnit = L.cellSize + 1;
  L.boardPx = L.gridUnit * 11;
  L.boardX = Math.floor((W - L.boardPx) / 2);
  L.fontSize = Math.floor(L.cellSize * 0.5);
  L.headerFontSize = Math.floor(L.cellSize * 0.58);
  L.smallFontSize = Math.max(11, Math.floor(L.cellSize * 0.4));
}

// ==================== 绘制工具 ====================

function fillRoundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.fill();
}

function strokeRoundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.stroke();
}

function drawText(text, x, y, color, size, align, bold) {
  ctx.fillStyle = color || C.text;
  ctx.font = `${bold ? 'bold ' : ''}${size || L.fontSize}px sans-serif`;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

// 发光标题（游戏主标题 / 结算标题）
function drawTitle(text, x, y, size, color) {
  ctx.save();
  ctx.shadowColor = C.titleGlow;
  ctx.shadowBlur = 22;
  drawText(text, x, y, color || C.title, size || 50, 'center', 'bold');
  ctx.restore();
}

// 背景渐变 + 星点装饰
let stars = null;
function initStars() {
  stars = [];
  const count = Math.min(46, Math.floor(W * H / 12000));
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.3 + 0.4,
      a: Math.random() * 0.4 + 0.08
    });
  }
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, C.bgTop);
  grad.addColorStop(1, C.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 星点（每帧微闪，营造夜空感）
  if (!stars) initStars();
  const t = Date.now() / 1000;
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    ctx.globalAlpha = s.a * (0.75 + 0.25 * Math.sin(t + i * 1.7));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ==================== 按钮系统 ====================

function Button(label, x, y, w, h, style, action) {
  this.label = label;
  this.x = x;
  this.y = y;
  this.w = w;
  this.h = h;
  this.style = style || 'primary';
  this.action = action;
}

Button.prototype.draw = function () {
  const s = BTN[this.style] || BTN.primary;
  const r = Math.min(this.h / 2, 18);

  // 底部投影（立体感）
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  // 渐变填充
  const grad = ctx.createLinearGradient(0, this.y, 0, this.y + this.h);
  grad.addColorStop(0, s.from);
  grad.addColorStop(1, s.to);
  ctx.fillStyle = grad;
  fillRoundRect(this.x, this.y, this.w, this.h, r);
  ctx.restore();

  // 顶部高光带（玻璃质感）
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  fillRoundRect(this.x + 2, this.y + 1.5, this.w - 4, Math.max(3, this.h * 0.42), Math.min(this.h * 0.35, 10));

  // 文字：加粗 + 微投影
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;
  drawText(this.label, this.x + this.w / 2, this.y + this.h / 2 + 1, '#ffffff', Math.floor(this.h * 0.44), 'center', 'bold');
  ctx.restore();
};

Button.prototype.hitTest = function (px, py) {
  return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
};

let buttons = [];

// ==================== 棋盘绘制 ====================

function boardCellX(col) { return L.boardX + (col + 1) * L.gridUnit; }
function boardCellY(row) { return (row + 1) * L.gridUnit; }
function boardCellRect(col, row) {
  return {
    x: boardCellX(col), y: boardCellY(row),
    w: L.cellSize, h: L.cellSize
  };
}

function drawBoard(board, boardY, boardType, opts) {
  opts = opts || {};
  const planeMap = board.getPlaneMap();
  const pmap = opts.previewMap || {};
  const showPlanes = opts.showPlanes !== false;
  const showAttacks = opts.showAttacks !== false;

  // 面板背景（深色底板 + 细边框，形成卡片感）
  ctx.fillStyle = C.panelBg;
  fillRoundRect(L.boardX - 3, boardY - 3, L.boardPx + 6, L.boardPx + 6, 8);
  ctx.strokeStyle = C.ruleBoxBorder;
  ctx.lineWidth = 1;
  strokeRoundRect(L.boardX - 3, boardY - 3, L.boardPx + 6, L.boardPx + 6, 8);

  // 角标
  const cornerX = L.boardX;
  const cornerY = boardY + L.gridUnit;
  ctx.fillStyle = C.headerBg;
  ctx.fillRect(cornerX, cornerY, L.cellSize, L.cellSize);

  // 列标题 (0-9)
  for (let col = 0; col < 10; col++) {
    const x = boardCellX(col);
    const y = boardY;
    ctx.fillStyle = C.headerBg;
    ctx.fillRect(x, y, L.cellSize, L.cellSize);
    drawText(String(col), x + L.cellSize / 2, y + L.cellSize / 2, C.textDim, L.headerFontSize, 'center');
  }

  // 行标题 (A-J) + 格子
  for (let row = 0; row < 10; row++) {
    // 行标题
    const labelX = L.boardX;
    const labelY = boardCellY(row) + boardY;
    ctx.fillStyle = C.headerBg;
    ctx.fillRect(labelX, labelY, L.cellSize, L.cellSize);
    drawText(String.fromCharCode(65 + row), labelX + L.cellSize / 2, labelY + L.cellSize / 2, C.textDim, L.headerFontSize, 'center');

    for (let col = 0; col < 10; col++) {
      const cx = boardCellX(col);
      const cy = boardCellY(row) + boardY;
      drawCell(cx, cy, board, col, row, planeMap, pmap, boardType, showPlanes, showAttacks);
    }
  }
}

function drawCell(cx, cy, board, col, row, planeMap, pmap, boardType, showPlanes, showAttacks) {
  const key = `${col},${row}`;

  // 背景（圆角格子）
  ctx.fillStyle = C.cellBg;
  fillRoundRect(cx, cy, L.cellSize, L.cellSize, 3);

  if (boardType === 'setup') {
    // 预览
    if (pmap[key]) {
      if (pmap[key].indexOf('head') >= 0) {
        ctx.fillStyle = pmap[key].indexOf('invalid') >= 0 ? C.previewHeadInvalid : C.previewHeadValid;
      } else {
        ctx.fillStyle = pmap[key].indexOf('invalid') >= 0 ? C.previewInvalid : C.previewValid;
      }
      fillRoundRect(cx, cy, L.cellSize, L.cellSize, 3);
    }
    // 飞机
    if (showPlanes) {
      if (planeMap[key] === 'head') {
        ctx.save();
        ctx.shadowColor = C.planeHeadGlow;
        ctx.shadowBlur = 7;
        ctx.fillStyle = C.planeHead;
        fillRoundRect(cx, cy, L.cellSize, L.cellSize, 3);
        ctx.restore();
        drawText('\u2708', cx + L.cellSize / 2, cy + L.cellSize / 2, '#fff', L.headerFontSize, 'center', 'bold');
      } else if (planeMap[key] === 'body') {
        ctx.fillStyle = C.planeBody;
        fillRoundRect(cx, cy, L.cellSize, L.cellSize, 3);
      }
    }
  } else if (boardType === 'my') {
    // 我方棋盘：显示飞机 + 受攻击标记
    if (showPlanes) {
      if (planeMap[key] === 'head') {
        ctx.save();
        ctx.shadowColor = C.planeHeadGlow;
        ctx.shadowBlur = 7;
        ctx.fillStyle = C.planeHead;
        fillRoundRect(cx, cy, L.cellSize, L.cellSize, 3);
        ctx.restore();
        drawText('\u2708', cx + L.cellSize / 2, cy + L.cellSize / 2, '#fff', L.headerFontSize, 'center', 'bold');
      } else if (planeMap[key] === 'body') {
        ctx.fillStyle = C.planeBody;
        fillRoundRect(cx, cy, L.cellSize, L.cellSize, 3);
      }
    }
    if (showAttacks) {
      const atk = board.attacks[row][col];
      if (atk === 'miss') {
        if (!planeMap[key]) {
          ctx.fillStyle = C.miss;
          ctx.beginPath();
          ctx.arc(cx + L.cellSize / 2, cy + L.cellSize / 2, L.cellSize * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (atk === 'hit') {
        if (!planeMap[key]) {
          ctx.fillStyle = C.hitBg;
          ctx.beginPath();
          ctx.arc(cx + L.cellSize / 2, cy + L.cellSize / 2, L.cellSize * 0.24, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      } else if (atk === 'kill') {
        if (!planeMap[key]) {
          ctx.fillStyle = C.killBg;
          ctx.beginPath();
          ctx.arc(cx + L.cellSize / 2, cy + L.cellSize / 2, L.cellSize * 0.26, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  } else if (boardType === 'attack') {
    // 攻击棋盘：只显示攻击结果
    if (showAttacks) {
      const atk = board.attacks[row][col];
      if (atk === 'miss') {
        drawText('\u00d7', cx + L.cellSize / 2, cy + L.cellSize / 2, C.miss, L.headerFontSize, 'center', 'bold');
      } else if (atk === 'hit') {
        ctx.save();
        ctx.shadowColor = C.hitGlow;
        ctx.shadowBlur = 6;
        ctx.fillStyle = C.hitBg;
        fillRoundRect(cx, cy, L.cellSize, L.cellSize, 3);
        ctx.restore();
        drawText('\u4f24', cx + L.cellSize / 2, cy + L.cellSize / 2, '#fff', L.headerFontSize, 'center', 'bold');
      } else if (atk === 'kill') {
        ctx.save();
        ctx.shadowColor = C.killGlow;
        ctx.shadowBlur = 8;
        ctx.fillStyle = C.killBg;
        fillRoundRect(cx, cy, L.cellSize, L.cellSize, 3);
        ctx.restore();
        drawText('\u843d', cx + L.cellSize / 2, cy + L.cellSize / 2, '#fff', L.headerFontSize, 'center', 'bold');
      }
    }
  } else if (boardType === 'gameover') {
    // 结算：显示飞机 + 攻击结果
    if (showPlanes) {
      if (planeMap[key] === 'head') {
        ctx.save();
        ctx.shadowColor = C.planeHeadGlow;
        ctx.shadowBlur = 7;
        ctx.fillStyle = C.planeHead;
        fillRoundRect(cx, cy, L.cellSize, L.cellSize, 3);
        ctx.restore();
        drawText('\u2708', cx + L.cellSize / 2, cy + L.cellSize / 2, '#fff', L.headerFontSize, 'center', 'bold');
      } else if (planeMap[key] === 'body') {
        ctx.fillStyle = C.planeBody;
        fillRoundRect(cx, cy, L.cellSize, L.cellSize, 3);
      }
    }
    if (showAttacks) {
      const atk = board.attacks[row][col];
      if (atk === 'miss' && !planeMap[key]) {
        drawText('\u00d7', cx + L.cellSize / 2, cy + L.cellSize / 2, C.miss, L.headerFontSize, 'center', 'bold');
      } else if (atk === 'hit') {
        if (!planeMap[key]) {
          drawText('\u4f24', cx + L.cellSize / 2, cy + L.cellSize / 2, C.hitBg, L.headerFontSize, 'center', 'bold');
        }
      } else if (atk === 'kill') {
        if (!planeMap[key]) {
          drawText('\u843d', cx + L.cellSize / 2, cy + L.cellSize / 2, C.killBg, L.headerFontSize, 'center', 'bold');
        }
      }
    }
  }

  // 网格线（圆角描边）
  ctx.strokeStyle = C.gridLine;
  ctx.lineWidth = 0.5;
  strokeRoundRect(cx, cy, L.cellSize, L.cellSize, 3);
}

function getCellFromTouch(tx, ty, boardY) {
  const col = Math.floor((tx - L.boardX) / L.gridUnit) - 1;
  const row = Math.floor((ty - boardY) / L.gridUnit) - 1;
  if (col < 0 || col > 9 || row < 0 || row > 9) return null;
  return { col, row };
}

function getAttackCellFromTouch(tx, ty, boardY) {
  return getCellFromTouch(tx, ty, boardY);
}

// ==================== 开始画面 ====================

function renderStart() {
  const cy = H / 2;

  // 标题（发光 + 加粗 + 金色分隔线）
  drawTitle('\u68cb\u76d8\u98de\u673a\u5bf9\u6218', W / 2, cy - 168);
  ctx.strokeStyle = 'rgba(255,210,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 96, cy - 136);
  ctx.lineTo(W / 2 + 96, cy - 136);
  ctx.stroke();
  drawText('\u68cb\u76d8\u4e0a\u7684\u535a\u5f08', W / 2, cy - 114, C.textDim, 20, 'center');

  // 按钮（胶囊渐变）
  const btnW = 250;
  const btnH = 56;
  const btnX = (W - btnW) / 2;
  const btnY = cy - 74;

  // 玩法指引按钮
  const guideBtnW = 170;
  const guideBtnH = 42;
  const guideBtnY = btnY + btnH + 12;

  // 转发按钮（主动转发）
  const shareBtnW = 170;
  const shareBtnH = 38;
  const shareBtnY = guideBtnY + guideBtnH + 10;

  buttons = [
    new Button('\u5f00\u59cb\u4eba\u673a\u5bf9\u6218', btnX, btnY, btnW, btnH, 'primary', 'startPvE'),
    new Button('\u7b2c\u4e00\u6b21\u73a9\uff1f\u770b\u6307\u5f15', W / 2 - guideBtnW / 2, guideBtnY, guideBtnW, guideBtnH, 'warning', 'showGuide'),
    new Button('\u8f6c\u53d1\u7ed9\u597d\u53cb', W / 2 - shareBtnW / 2, shareBtnY, shareBtnW, shareBtnH, 'success', 'share')
  ];

  for (const b of buttons) b.draw();

  // 规则说明（卡片：渐变底 + 顶部金色标题线）
  const rulesY = shareBtnY + shareBtnH + 18;
  const rules = [
    '1. \u4f60\u548c\u673a\u5668\u4eba\u5404\u62e5\u6709\u4e00\u4e2a 10\u00d710 \u68cb\u76d8\uff0c\u5404\u81ea\u5e03\u7f6e 3 \u67b6\u98de\u673a',
    '2. \u98de\u673a\u5f62\u72b6\uff0810\u683c\uff09\u4e3a\u201c\u58eb\u201d\u5b57\u5f62\uff0c\u53ef\u65cb\u8f6c 4 \u4e2a\u65b9\u5411',
    '3. \u5e03\u9635\u5b8c\u6210\u540e\uff0c\u4ea4\u66ff\u5411\u5bf9\u65b9\u68cb\u76d8\u5f00\u70ae',
    '4. \u547d\u4e2d\u673a\u5934\u2192\u51fb\u843d\uff0c\u547d\u4e2d\u673a\u8eab\u2192\u51fb\u4f24\uff0c\u672a\u547d\u4e2d\u2192\u51fb\u7a7a',
    '5. \u9996\u5148\u51fb\u843d\u5bf9\u65b9\u5168\u90e8 3 \u67b6\u98de\u673a\u7684\u4e00\u65b9\u83b7\u80dc'
  ];

  const titleFontSize = 17;
  const ruleFontSize = 13.5;
  const lineH = 23;
  const boxPadding = 14;
  const titleBarH = 30;
  const boxW = W - 32;

  const boxH = titleBarH + rules.length * lineH + boxPadding * 2;
  const boxY = rulesY;
  const boxX = 16;

  ctx.fillStyle = C.ruleBoxBg;
  fillRoundRect(boxX, boxY, boxW, boxH, 12);
  ctx.strokeStyle = C.ruleBoxBorder;
  ctx.lineWidth = 1;
  strokeRoundRect(boxX, boxY, boxW, boxH, 12);

  drawText('\u6e38\u620f\u89c4\u5219', boxX + boxW / 2, boxY + boxPadding + titleBarH / 2, C.titleDark, titleFontSize, 'center', 'bold');

  // 标题下金色渐变分隔线
  const sepY = boxY + boxPadding + titleBarH + 6;
  const sepGrad = ctx.createLinearGradient(boxX + 24, 0, boxX + boxW - 24, 0);
  sepGrad.addColorStop(0, 'rgba(255,210,0,0)');
  sepGrad.addColorStop(0.5, 'rgba(255,210,0,0.45)');
  sepGrad.addColorStop(1, 'rgba(255,210,0,0)');
  ctx.fillStyle = sepGrad;
  ctx.fillRect(boxX + 24, sepY, boxW - 48, 1);

  const ruleStartY = sepY + 8;
  for (let i = 0; i < rules.length; i++) {
    ctx.fillStyle = C.textGray;
    ctx.font = `${ruleFontSize}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(rules[i], boxX + 18, ruleStartY + i * lineH + lineH / 2);
  }
}

// ==================== 玩法指引画面 ====================

let guideBackBtn = null; // 固定顶栏返回按钮（不随滚动移动）

// 中文按字符换行：返回行数组
function wrapText(text, maxW, size) {
  ctx.font = `${size}px sans-serif`;
  const lines = [];
  let line = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (line && ctx.measureText(line + ch).width > maxW) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// 居中绘制多行文本，返回结束后的 y
function drawWrappedText(text, centerX, y, maxW, lineH, color, size, bold) {
  const lines = wrapText(text, maxW, size);
  ctx.fillStyle = color;
  ctx.font = `${bold ? 'bold ' : ''}${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], centerX, y + i * lineH + lineH / 2);
  }
  return y + lines.length * lineH;
}

// 绘制指南里的飞机形状（机头1 + 机翼5 + 机身1 + 尾翼3）
function drawGuidePlane(cx, cy, cell) {
  const unit = cell + 2;
  const cells = [
    { dx: 0, dy: -1, head: true },
    { dx: -2, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 2 }, { dx: 0, dy: 2 }, { dx: 1, dy: 2 }
  ];
  for (const c of cells) {
    const x = cx + c.dx * unit - cell / 2;
    const y = cy + c.dy * unit - cell / 2;
    ctx.fillStyle = c.head ? C.planeHead : C.planeBody;
    fillRoundRect(x, y, cell, cell, 3);
    if (c.head) {
      drawText('\u2708', x + cell / 2, y + cell / 2, '#fff', Math.floor(cell * 0.8), 'center');
    }
  }
}

function renderGuide() {
  const topBarH = SAFE_TOP + 48;
  const pad = 16;
  const contentW = W - pad * 2;

  // 指引页没有内容级按钮，清空避免误触上一画面的残留按钮
  buttons = [];

  // ---- 滚动内容 ----
  ctx.save();
  ctx.translate(0, -scrollOffset);

  let y = topBarH + 18;

  // 一句话玩法
  const oneText = '\u4e00\u53e5\u8bdd\u73a9\u6cd5\uff1a\u85cf\u597d\u81ea\u5df1\u7684 3 \u67b6\u98de\u673a\uff0c\u731c\u51fa\u5bf9\u624b\u98de\u673a\u7684\u4f4d\u7f6e\uff0c\u8c01\u5148\u628a\u5bf9\u65b9 3 \u67b6\u5168\u90e8\u51fb\u843d\uff0c\u8c01\u5c31\u8d62\uff01';
  const oneLines = wrapText(oneText, contentW - 28, 15);
  const oneBoxH = oneLines.length * 22 + 20;
  ctx.fillStyle = 'rgba(255,210,0,0.09)';
  fillRoundRect(pad, y, contentW, oneBoxH, 12);
  ctx.strokeStyle = 'rgba(255,210,0,0.25)';
  ctx.lineWidth = 1;
  strokeRoundRect(pad, y, contentW, oneBoxH, 12);
  drawWrappedText(oneText, W / 2, y + 10, contentW - 28, 22, C.title, 15, true);
  y += oneBoxH + 24;

  // ① 飞机形状
  drawText('\u2460 \u4f60\u7684\u98de\u673a\u957f\u8fd9\u6837', pad + 2, y, C.titleDark, 17, 'left', 'bold');
  y += 14;
  const cell = 24;
  const planeCy = y + 2 * (cell + 2);
  drawGuidePlane(W / 2, planeCy, cell);
  // 部件标注
  const labelX = W / 2 + 3 * (cell + 2) + 4;
  drawText('\u673a\u5934\u00d71', labelX, planeCy - (cell + 2), C.planeHead, 12, 'left');
  drawText('\u673a\u7ffc\u00d75', labelX, planeCy, C.planeBody, 12, 'left');
  drawText('\u5c3e\u7ffc\u00d73', labelX, planeCy + 2 * (cell + 2), C.planeBody, 12, 'left');
  y = planeCy + 2 * (cell + 2) + cell / 2 + 18;
  y = drawWrappedText(
    '\u6bcf\u67b6\u98de\u673a\u5360 10 \u683c\uff1a\u7ea2\u8272\u673a\u5934\u00d71 + \u7eff\u8272\u673a\u8eab\u00d79\uff0c\u53ef\u671d\u4e0a\u4e0b\u5de6\u53f3 4 \u4e2a\u65b9\u5411\u6446\u653e',
    W / 2, y, contentW, 20, C.textGray, 13
  );
  y += 22;

  // ② 布阵
  drawText('\u2461 \u5e03\u9635\uff1a\u628a 3 \u67b6\u98de\u673a\u85cf\u8fdb\u68cb\u76d8', pad + 2, y, C.titleDark, 17, 'left', 'bold');
  y += 10;
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.text;
  const steps = [
    '\u25b8 \u70b9\u4e00\u4e0b\u68cb\u76d8\uff0c\u51fa\u73b0\u98de\u673a\u9884\u89c8\uff08\u7eff\u8272=\u80fd\u653e\uff09',
    '\u25b8 \u518d\u70b9\u540c\u4e00\u4e2a\u4f4d\u7f6e\uff0c\u98de\u673a\u843d\u5730',
    '\u25b8 \u70b9\u300c\u65cb\u8f6c\u65b9\u5411\u300d\u6362\u671d\u5411\uff0c\u300c\u91cd\u7f6e\u5168\u90e8\u300d\u91cd\u6765',
    '\u25b8 \u653e\u6ee1 3 \u67b6\u540e\uff0c\u70b9\u300c\u786e\u8ba4\u5e03\u9635\u300d\u5f00\u6218'
  ];
  for (const s of steps) {
    ctx.fillText(s, pad + 6, y + 12);
    y += 24;
  }

  // 布阵流程图（翡翠渐变系）
  y += 6;
  const flowBoxH = 48;
  const flowGap = 20;
  const flowW = (contentW - flowGap * 2) / 3;
  const flowBoxes = [
    { t: '\u98de\u673a\u9884\u89c8', s: '\u70b9\u51fb\u68cb\u76d8', from: 'rgba(45,212,167,0.20)', to: 'rgba(45,212,167,0.40)' },
    { t: '\u653e\u7f6e 1/3', s: '\u518d\u70b9\u4e00\u6b21', from: 'rgba(45,212,167,0.40)', to: 'rgba(45,212,167,0.65)' },
    { t: '\u786e\u8ba4\u5e03\u9635', s: '\u653e\u6ee1 3 \u67b6', from: BTN.success.from, to: BTN.success.to }
  ];
  for (let i = 0; i < 3; i++) {
    const bx = pad + i * (flowW + flowGap);
    const fg = ctx.createLinearGradient(0, y, 0, y + flowBoxH);
    fg.addColorStop(0, flowBoxes[i].from);
    fg.addColorStop(1, flowBoxes[i].to);
    ctx.fillStyle = fg;
    fillRoundRect(bx, y, flowW, flowBoxH, 10);
    drawText(flowBoxes[i].t, bx + flowW / 2, y + 17, '#fff', 13, 'center', 'bold');
    drawText(flowBoxes[i].s, bx + flowW / 2, y + 34, 'rgba(255,255,255,0.85)', 11, 'center');
    if (i < 2) {
      drawText('\u2192', bx + flowW + flowGap / 2, y + flowBoxH / 2, C.titleDark, 16, 'center', 'bold');
    }
  }
  y += flowBoxH + 22;

  // ③ 开炮结果
  drawText('\u2462 \u5f00\u70ae\uff1a\u70b9\u5bf9\u65b9\u68cb\u76d8\u4efb\u610f\u683c\u5b50', pad + 2, y, C.titleDark, 17, 'left', 'bold');
  y += 10;
  const rBoxW = (contentW - 16) / 3;
  const rBoxH = 76;
  const results = [
    { t: '\ud83d\udca5 \u51fb\u843d', bg: C.popupKillBg, s1: '\u547d\u4e2d\u673a\u5934', s2: '\u6574\u67b6\u62a5\u5e9f' },
    { t: '\u26a0 \u51fb\u4f24', bg: C.popupHitBg, s1: '\u547d\u4e2d\u673a\u8eab', s2: '\u53ea\u6389\u8840' },
    { t: '\u00d7 \u51fb\u7a7a', bg: C.popupMissBg, s1: '\u6ca1\u6253\u4e2d', s2: '\u6392\u9664\u6b64\u683c' }
  ];
  for (let i = 0; i < 3; i++) {
    const bx = pad + i * (rBoxW + 8);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = results[i].bg;
    fillRoundRect(bx, y, rBoxW, rBoxH, 10);
    ctx.restore();
    drawText(results[i].t, bx + rBoxW / 2, y + 18, '#fff', 15, 'center', 'bold');
    drawText(results[i].s1, bx + rBoxW / 2, y + 42, 'rgba(255,255,255,0.92)', 11, 'center');
    drawText(results[i].s2, bx + rBoxW / 2, y + 58, 'rgba(255,255,255,0.92)', 11, 'center');
  }
  y += rBoxH + 14;
  y = drawWrappedText(
    '\ud83d\udca1 \u5173\u952e\uff1a\u53ea\u6709\u547d\u4e2d\u7ea2\u8272\u673a\u5934\u624d\u80fd\u51fb\u843d\u6574\u67b6\u98de\u673a\uff01\u6253\u673a\u8eab\u53ea\u662f\u51fb\u4f24\uff0c\u731c\u673a\u5934\u4f4d\u7f6e\u624d\u662f\u80dc\u8d1f\u624b\u3002',
    W / 2, y, contentW - 8, 20, '#f5b7b1', 13
  );
  y += 20;

  // ④ 怎么赢
  drawText('\u2463 \u600e\u4e48\u8d62', pad + 2, y, C.titleDark, 17, 'left', 'bold');
  y += 10;
  const winText = '\u5148\u51fb\u843d\u5bf9\u65b9 3 \u67b6\u98de\u673a\uff08\u6253\u4e2d 3 \u4e2a\u673a\u5934\uff09\u7684\u4e00\u65b9\u83b7\u80dc\u3002\u5bf9\u6218\u65f6\u754c\u9762\u4e0a\u65b9\u662f\u5bf9\u624b\u68cb\u76d8\uff08\u70b9\u5b83\u5f00\u70ae\uff09\uff0c\u4e0b\u65b9\u662f\u4f60\u7684\u68cb\u76d8\uff0c\u53ef\u4e0a\u4e0b\u6ed1\u52a8\u67e5\u770b\u3002';
  const winLines = wrapText(winText, contentW - 24, 14);
  const winBoxH = winLines.length * 20 + 24;
  ctx.fillStyle = 'rgba(45,212,167,0.12)';
  fillRoundRect(pad, y, contentW, winBoxH, 10);
  ctx.strokeStyle = 'rgba(45,212,167,0.30)';
  ctx.lineWidth = 1;
  strokeRoundRect(pad, y, contentW, winBoxH, 10);
  drawWrappedText(winText, W / 2, y + 12, contentW - 24, 20, '#a9dfbf', 14);
  y += winBoxH + 22;

  drawText('\u2014\u2014 \u5c31\u8fd9\u4e48\u7b80\u5355\uff0c\u53bb\u8bd5\u8bd5\u5427 \u2708 \u2014\u2014', W / 2, y, C.textDim, 13, 'center');
  y += 30;

  // 滚动范围
  maxScroll = Math.max(0, y - (H - 10));
  if (scrollOffset > maxScroll) scrollOffset = maxScroll;

  ctx.restore();

  // ---- 固定顶栏（返回按钮 + 标题）----
  ctx.fillStyle = 'rgba(11,16,38,0.92)';
  ctx.fillRect(0, 0, W, topBarH);
  ctx.fillStyle = 'rgba(255,210,0,0.18)';
  ctx.fillRect(0, topBarH - 1, W, 1);
  guideBackBtn = new Button('\u2190 \u8fd4\u56de', 12, SAFE_TOP + 8, 80, 34, 'warning', 'backToStart');
  guideBackBtn.draw();
  drawText('\u7b2c\u4e00\u6b21\u73a9\uff1f\u770b\u6307\u5f15', W / 2, SAFE_TOP + 24, C.title, 18, 'center', 'bold');
}



function renderSetup() {
  const HEADER_H = SAFE_TOP + 50;
  const boardY = HEADER_H + 10;
  const board = game.getCurrentBoard();

  // 顶部状态条
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, 0, W, HEADER_H);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, HEADER_H - 1, W, 1);

  // 标题
  drawText('\u73a9\u5bb6 \u5e03\u9635', W / 2, SAFE_TOP + 24, C.text, 18, 'center', 'bold');
  drawText('\u5728\u68cb\u76d8\u4e0a\u653e\u7f6e 3 \u67b6\u98de\u673a\uff08\u70b9\u51fb\u9884\u89c8\uff0c\u518d\u6b21\u70b9\u51fb\u653e\u7f6e\uff09', W / 2, SAFE_TOP + 42, C.textDim, 11, 'center');

  // 棋盘
  drawBoard(board, boardY, 'setup', { previewMap, showAttacks: false });

  // 控制面板
  const controlsY = boardY + L.boardPx + 12;

  // 已放置徽章
  const badgeW = 150;
  const badgeH = 30;
  ctx.fillStyle = 'rgba(255,159,67,0.14)';
  fillRoundRect(W / 2 - badgeW / 2, controlsY - 4, badgeW, badgeH, badgeH / 2);
  ctx.strokeStyle = 'rgba(255,159,67,0.4)';
  ctx.lineWidth = 1;
  strokeRoundRect(W / 2 - badgeW / 2, controlsY - 4, badgeW, badgeH, badgeH / 2);
  drawText(`\u5df2\u653e\u7f6e\uff1a${board.planes.length} / 3 \u67b6`, W / 2, controlsY + 11, C.titleDark, 13, 'center', 'bold');

  // 方向提示（两段式：说明文字 + 彩色箭头）
  const dirLabel = `\u5f53\u524d\u65b9\u5411\uff1a${Plane.DIRECTION_NAMES[game.setupDirection]}`;
  ctx.font = '12px sans-serif';
  const dirLabelW = ctx.measureText(dirLabel).width;
  const dirX = W / 2 - dirLabelW / 2;
  drawText(dirLabel, dirX + dirLabelW / 2, controlsY + 28, C.textDim, 12, 'center');
  drawText(Plane.DIRECTION_ARROWS[game.setupDirection], dirX + dirLabelW + 14, controlsY + 28, C.planeBody, 14, 'center', 'bold');

  // 按钮
  const btnW = 130;
  const btnH = 44;
  const btnGap = 12;
  const btnCount = board.planes.length >= 3 ? 3 : 2;
  const totalBtnW = btnW * btnCount + btnGap * (btnCount - 1);
  const btnStartX = (W - totalBtnW) / 2;
  const btnY = controlsY + 38;

  buttons = [
    new Button('\u65cb\u8f6c\u65b9\u5411', btnStartX, btnY, btnW, btnH, 'warning', 'rotateDir'),
    new Button('\u91cd\u7f6e\u5168\u90e8', btnStartX + btnW + btnGap, btnY, btnW, btnH, 'danger', 'resetSetup'),
  ];

  if (board.planes.length >= 3) {
    buttons.push(new Button('\u786e\u8ba4\u5e03\u9635', btnStartX + (btnW + btnGap) * 2, btnY, btnW, btnH, 'success', 'confirmSetup'));
  }

  for (const b of buttons) b.draw();
}

// ==================== 对战画面 ====================

function renderBattle() {
  const HEADER_H = SAFE_TOP + 50;

  // 滚动偏移（内容整体上移，露出下方被遮挡部分）
  ctx.save();
  ctx.translate(0, -scrollOffset);

  // 顶部状态条
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, 0, W, HEADER_H);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, HEADER_H - 1, W, 1);

  // 标题
  const turnLabel = game.currentPlayer === 1
    ? '\u4f60\u7684\u56de\u5408 - \u8bf7\u5728\u673a\u5668\u4eba\u68cb\u76d8\u4e0a\u9009\u62e9\u653b\u51fb\u4f4d\u7f6e'
    : '\u673a\u5668\u4eba\u601d\u8003\u4e2d...';
  drawText('\u5bf9\u6218\u9636\u6bb5', W / 2, SAFE_TOP + 12, C.text, 16, 'center', 'bold');
  drawText(turnLabel, W / 2, SAFE_TOP + 32, game.currentPlayer === 1 ? C.titleDark : C.textDim, 11, 'center');

  // 攻击棋盘（对手，点击开炮）
  const atkBoardY = HEADER_H;
  drawText(
    '\u673a\u5668\u4eba\u7684\u68cb\u76d8\uff08\u70b9\u51fb\u5f00\u70ae\uff09',
    W / 2, atkBoardY + 6, C.textDim, L.smallFontSize, 'center'
  );
  const atkGridY = atkBoardY + 14;
  drawBoard(game.boards[1], atkGridY, 'attack', { previewMap: {}, showPlanes: false });

  // 分隔
  const sepY = atkGridY + L.boardPx + 4;

  // 我方棋盘
  drawText('\u4f60\u7684\u68cb\u76d8', W / 2, sepY + 4, C.textDim, L.smallFontSize, 'center');
  const myGridY = sepY + 12;
  drawBoard(game.boards[0], myGridY, 'my', { previewMap: {}, showAttacks: true });

  // 统计徽章（三个小胶囊）
  const statsY = myGridY + L.boardPx + 6;
  const myKills = game.boards[1].getKillCount();
  const otherKills = game.boards[0].getKillCount();
  const badgeItems = [
    { t: `\u4f60 ${myKills}/3`, color: C.titleDark, bg: 'rgba(255,159,67,0.15)' },
    { t: `\u673a\u5668\u4eba ${otherKills}/3`, color: C.killBg, bg: 'rgba(255,77,109,0.15)' },
    { t: `\u56de\u5408 ${game.round}`, color: C.textDim, bg: 'rgba(255,255,255,0.07)' }
  ];
  ctx.font = 'bold 12px sans-serif';
  const badgeGap = 10;
  const badgeW = badgeItems.map(b => ctx.measureText(b.t).width + 22);
  const badgeTotal = badgeW.reduce((a, b) => a + b, 0) + badgeGap * 2;
  let badgeX = W / 2 - badgeTotal / 2;
  const badgeY = statsY;
  for (let i = 0; i < badgeItems.length; i++) {
    ctx.fillStyle = badgeItems[i].bg;
    fillRoundRect(badgeX, badgeY, badgeW[i], 24, 12);
    drawText(badgeItems[i].t, badgeX + badgeW[i] / 2, badgeY + 12, badgeItems[i].color, 12, 'center', 'bold');
    badgeX += badgeW[i] + badgeGap;
  }

  // 日志（最多4条）
  const logY = statsY + 32;
  const recentLogs = game.logs.slice(-4);
  for (let i = 0; i < recentLogs.length; i++) {
    const l = recentLogs[i];
    const color = l.cls === 'log-miss' ? C.logMiss : l.cls === 'log-hit' ? C.logHit : C.logKill;
    drawText(l.text, W / 2, logY + i * 13, color, 9, 'center');
  }

  // 认输按钮
  const logAreaH = Math.min(recentLogs.length, 4) * 13;
  const btnY2 = logY + logAreaH + 4;
  buttons = [
    new Button('\u8ba4\u8f93', W / 2 - 40, btnY2, 80, 32, 'danger', 'surrender')
  ];
  for (const b of buttons) b.draw();

  // 计算最大滚动距离（内容底部超出屏幕的高度）
  const contentBottom = btnY2 + 32 + 20;
  maxScroll = Math.max(0, contentBottom - H);
  if (scrollOffset > maxScroll) scrollOffset = maxScroll;

  ctx.restore();

  // AI 思考动画（固定底部）
  if (aiThinking) {
    drawAIThinkingBar();
  }

  // 攻击弹窗（固定居中，不受滚动影响）
  if (attackPopup) {
    drawAttackPopup();
  }
}

function drawAIThinkingBar() {
  const barH = 46;
  const barY = H - barH;

  // 翡翠渐变底（上淡下浓）
  const grad = ctx.createLinearGradient(0, barY, 0, H);
  grad.addColorStop(0, 'rgba(45,212,167,0)');
  grad.addColorStop(1, 'rgba(45,212,167,0.22)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, barY, W, barH);
  ctx.fillStyle = 'rgba(45,212,167,0.25)';
  ctx.fillRect(0, barY, W, 1);

  // 呼吸点动画
  const t = Date.now() / 450;
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t + i * 1.15));
    ctx.fillStyle = C.planeBody;
    ctx.beginPath();
    ctx.arc(W / 2 - 46 + i * 18, barY + barH / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  drawText('\u673a\u5668\u4eba\u601d\u8003\u4e2d...', W / 2, barY + barH / 2, C.planeBody, 13, 'center', 'bold');
}

function drawAttackPopup() {
  if (!attackPopup) return;
  const { text, type } = attackPopup;
  const bgColor = type === 'miss' ? C.popupMissBg : type === 'hit' ? C.popupHitBg : C.popupKillBg;
  const popupW = 190;
  const popupH = 58;
  const popupX = (W - popupW) / 2;
  const popupY = H / 2 - popupH / 2;

  // 阴影 + 渐变底
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = bgColor;
  fillRoundRect(popupX, popupY, popupW, popupH, 18);
  ctx.restore();

  // 顶部高光
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  fillRoundRect(popupX + 3, popupY + 2, popupW - 6, popupH * 0.42, 14);

  // 文字
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 3;
  drawText(text, W / 2, popupY + popupH / 2 + 1, '#fff', 24, 'center', 'bold');
  ctx.restore();
}

// ==================== 结算画面 ====================

function renderGameover() {
  const totalH = 40 + 40 + L.boardPx * 2 + 60 + 60;
  const startY = H / 2 - totalH / 2 + 20;

  // 标题（发光）
  drawTitle('\u6e38\u620f\u7ed3\u675f', W / 2, startY, 24, C.text);

  // 获胜者判断
  const iWon = game.winner === 1;
  const winnerText = iWon
    ? '\u606d\u559c\uff0c\u4f60\u8d62\u4e86\uff01'
    : '\u673a\u5668\u4eba\u83b7\u80dc\uff01';
  const winColor = iWon ? C.title : C.logKill;
  ctx.save();
  ctx.shadowColor = iWon ? C.titleGlow : C.killGlow;
  ctx.shadowBlur = 14;
  drawText(winnerText, W / 2, startY + 28, winColor, 18, 'center', 'bold');
  ctx.restore();

  // 棋盘标签
  const b1Y = startY + 52;
  drawText('\u4f60\u7684\u68cb\u76d8', W / 2, b1Y, C.textDim, L.smallFontSize, 'center', 'bold');
  drawBoard(game.boards[0], b1Y + 6, 'gameover', { showAttacks: true });

  const b2Y = b1Y + L.boardPx + 12;
  drawText('\u673a\u5668\u4eba\u7684\u68cb\u76d8', W / 2, b2Y, C.textDim, L.smallFontSize, 'center', 'bold');
  drawBoard(game.boards[1], b2Y + 6, 'gameover', { showAttacks: true });

  // 重新开始 / 分享战绩按钮
  const btnY = b2Y + L.boardPx + 12;
  buttons = [
    new Button('\u518d\u6765\u4e00\u5c40', W / 2 - 80, btnY, 160, 44, 'primary', 'restart'),
    new Button('\u5206\u4eab\u6218\u7ee9', W / 2 - 80, btnY + 54, 160, 44, 'success', 'share')
  ];
  for (const b of buttons) b.draw();
}

// ==================== 主循环 ====================

function loop() {
  // 重置变换矩阵并应用 DPR 缩放（物理像素 = 逻辑像素 × DPR）
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  calcLayout();

  // 渐变背景 + 星点装饰
  drawBackground();

  switch (phase) {
    case 'start': renderStart(); break;
    case 'guide': renderGuide(); break;
    case 'setup': renderSetup(); break;
    case 'battle': renderBattle(); break;
    case 'gameover': renderGameover(); break;
  }

  requestAnimationFrame(loop);
}

// ==================== 触摸事件 ====================

function handleTouchStart(tx, ty) {
  dragStartY = ty;
  dragScrollStart = scrollOffset;
  isDragging = false;
  dragMoved = false;
}

function handleTouchEnd(tx, ty) {
  // 滚动中不处理点击
  if (dragMoved) return;

  // 玩法指引：固定顶栏返回按钮（不随滚动偏移，用原始坐标检测）
  if (phase === 'guide' && guideBackBtn && guideBackBtn.hitTest(tx, ty)) {
    backToStart();
    return;
  }

  // 对战/指引页面需要补偿滚动偏移后再进行点击检测
  const checkY = (phase === 'battle' || phase === 'guide') ? ty + scrollOffset : ty;

  // 先检测按钮点击
  for (const b of buttons) {
    if (b.hitTest(tx, checkY)) {
      handleButtonAction(b.action);
      return;
    }
  }

  switch (phase) {
    case 'start':
      handleStartTouch(tx, ty);
      break;
    case 'setup':
      handleSetupTouch(tx, ty);
      break;
    case 'battle':
      handleBattleTouch(tx, checkY);
      break;
    case 'gameover':
      handleGameoverTouch(tx, ty);
      break;
  }
}

function handleTouchMove(tx, ty) {
  if (phase !== 'battle' && phase !== 'guide') return;

  const dy = ty - dragStartY;
  if (Math.abs(dy) < 4) return; // 防抖

  dragMoved = true;
  scrollOffset = dragScrollStart - dy;
  scrollOffset = Math.max(0, Math.min(maxScroll, scrollOffset));
}

function handleButtonAction(action) {
  switch (action) {
    // 开始画面
    case 'startPvE':
      startGame();
      break;
    case 'showGuide':
      enterGuide();
      break;
    case 'backToStart':
      backToStart();
      break;
    // 布阵画面
    case 'rotateDir':
      game.rotateDirection();
      if (activePreview) {
        updatePreview(activePreview.x, activePreview.y);
      } else {
        previewMap = {};
      }
      break;
    case 'resetSetup':
      game.resetSetup();
      previewMap = {};
      activePreview = null;
      break;
    case 'confirmSetup':
      confirmSetup();
      break;
    // 对战画面
    case 'surrender':
      surrender();
      break;
    // 结算画面
    case 'restart':
      restartGame();
      break;
    // 转发分享（开始画面 / 结算画面）
    case 'share':
      shareToFriend();
      break;
  }
}

function handleStartTouch(tx, ty) {
  // 规则框在按钮下方，无需特殊处理
}

function handleSetupTouch(tx, ty) {
  const board = game.getCurrentBoard();
  if (board.planes.length >= 3) return;

  const boardY = SAFE_TOP + 60; // HEADER_H + 10
  const cell = getCellFromTouch(tx, ty, boardY);
  if (!cell) return;

  const { col, row } = cell;

  if (activePreview && activePreview.x === col && activePreview.y === row) {
    // 再次点击：确认放置
    const result = game.placePlane(col, row);
    if (result.success) {
      wx.vibrateShort({ type: 'medium' });
    } else {
      wx.vibrateShort({ type: 'medium' });
    }
    previewMap = {};
    activePreview = null;
    return;
  }

  // 首次点击：预览
  updatePreview(col, row);
  wx.vibrateShort({ type: 'light' });
}

function updatePreview(x, y) {
  const preview = game.getPreviewState(x, y);
  if (!preview) {
    previewMap = {};
    activePreview = null;
    return;
  }

  const map = {};
  preview.points.forEach((p, i) => {
    const k = `${p.x},${p.y}`;
    map[k] = i === 0
      ? (preview.valid ? 'preview-head-valid' : 'preview-head-invalid')
      : (preview.valid ? 'preview-valid' : 'preview-invalid');
  });
  previewMap = map;
  activePreview = { x, y };
}

function handleBattleTouch(tx, ty) {
  if (game.currentPlayer !== 1 || game.phase !== 'battle') return;

  const atkBoardY = SAFE_TOP + 50 + 14; // HEADER_H + atkGridY offset
  const cell = getCellFromTouch(tx, ty, atkBoardY);
  if (!cell) return;

  const { col, row } = cell;
  const opponentBoard = game.boards[1];
  if (opponentBoard.attacks[row][col] !== null) return;

  // PvE 模式：本地执行攻击
  const result = game.executeAttack(col, row);
  if (!result) return;

  // 显示弹窗
  const display = game.getAttackDisplay(result.type);
  attackPopup = { text: display.text, type: result.type };
  popupStartTime = Date.now();

  wx.vibrateShort({ type: result.type === 'kill' ? 'heavy' : 'medium' });

  if (result.gameOver) {
    setTimeout(() => {
      attackPopup = null;
      phase = 'gameover';
    }, 1500);
    return;
  }

  // 切换 AI 回合
  game.switchTurn();
  setTimeout(() => {
    attackPopup = null;
    aiThinking = true;
    setTimeout(() => {
      executeAiTurn();
    }, 1000);
  }, 900);
}

function executeAiTurn() {
  if (game.phase !== 'battle' || game.currentPlayer !== 2) {
    aiThinking = false;
    return;
  }

  const result = game.aiExecuteAttack();
  if (!result) {
    aiThinking = false;
    return;
  }

  const display = game.getAttackDisplay(result.type);
  attackPopup = { text: display.text, type: result.type };
  popupStartTime = Date.now();

  wx.vibrateShort({ type: result.type === 'kill' ? 'heavy' : 'medium' });
  aiThinking = false;

  if (result.gameOver) {
    setTimeout(() => {
      attackPopup = null;
      phase = 'gameover';
    }, 1500);
    return;
  }

  game.switchTurn();

  setTimeout(() => {
    attackPopup = null;
  }, 900);
}

function handleGameoverTouch(tx, ty) {
  // 按钮由 handleTouchEnd 统一处理
}

// ==================== 游戏流程控制 ====================

// 进入玩法指引页（从开始画面）
function enterGuide() {
  phase = 'guide';
  scrollOffset = 0;
  maxScroll = 0;
  previewMap = {};
  activePreview = null;
  guideBackBtn = null;
}

// 从玩法指引页返回开始画面
function backToStart() {
  phase = 'start';
  scrollOffset = 0;
  maxScroll = 0;
  guideBackBtn = null;
}

function startGame() {
  game.startGame('pve');
  phase = 'setup';
  previewMap = {};
  activePreview = null;
  aiThinking = false;
  attackPopup = null;
  scrollOffset = 0;
  maxScroll = 0;
}

function confirmSetup() {
  const result = game.confirmSetup();
  if (result.action === 'start_battle') {
    phase = 'battle';
    previewMap = {};
    activePreview = null;
    aiThinking = false;
  }
}

function surrender() {
  game.phase = 'gameover';
  game.winner = 2;
  phase = 'gameover';
  aiThinking = false;
  attackPopup = null;
  scrollOffset = 0;
  maxScroll = 0;
}

function restartGame() {
  game = new Game();
  phase = 'start';
  previewMap = {};
  activePreview = null;
  aiThinking = false;
  attackPopup = null;
  showOverlay = false;
  buttons = [];
  scrollOffset = 0;
  maxScroll = 0;
}

// ==================== 触摸事件绑定 ====================

wx.onTouchStart(function (e) {
  const t = e.touches[0];
  handleTouchStart(t.clientX, t.clientY);
});

wx.onTouchEnd(function (e) {
  const t = e.changedTouches[0];
  handleTouchEnd(t.clientX, t.clientY);
});

wx.onTouchMove(function (e) {
  const t = e.touches[0];
  handleTouchMove(t.clientX, t.clientY);
});

// ==================== 转发与分享功能 ====================

// 生成转发图片：截取 Canvas 当前画面（卡片最佳显示比例 5:4）
function getShareImage() {
  try {
    return canvas.toTempFilePathSync({
      x: 0,
      y: 0,
      width: canvas.width,
      height: Math.floor(canvas.width * 0.8),
      destWidth: 500,
      destHeight: 400
    });
  } catch (e) {
    return ''; // 截图失败时使用默认 logo
  }
}

// 转发标题（结算画面根据胜负动态生成）
function getShareTitle() {
  if (phase === 'gameover') {
    return game.winner === 1
      ? '我在棋盘飞机对战击落了机器人全部飞机，来挑战我吧！'
      : '机器人赢了这一盘，不服来战——棋盘飞机对战！';
  }
  return '棋盘飞机对战 - 来下一盘棋盘上的博弈吧！';
}

// 主动转发给好友（游戏内按钮触发）
function shareToFriend() {
  wx.shareAppMessage({
    title: getShareTitle(),
    imageUrl: getShareImage()
  });
}

// 1. 开启右上角转发菜单（含"转发给好友"和"分享到朋友圈"两个入口）
wx.showShareMenu({
  withShareTicket: true,
  menus: ['shareAppMessage', 'shareTimeline']
});

// 2. 被动转发回调：用户点右上角菜单"转发"时触发
wx.onShareAppMessage(function () {
  return {
    title: getShareTitle(),
    imageUrl: getShareImage()
  };
});

// 3. 分享到朋友圈回调（基础库 2.12.0+，目前仅 Android 支持）
wx.onShareTimeline(function () {
  return {
    title: getShareTitle(),
    query: '',
    imageUrl: '' // 留空使用小游戏 logo
  };
});

// ==================== 启动游戏 ====================
loop();
