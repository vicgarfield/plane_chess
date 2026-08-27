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
const C = {
  bg: '#0f0c29',
  title: '#ffd200',
  titleDark: '#f7971e',
  cellBg: 'rgba(255,255,255,0.08)',
  cellBgHover: 'rgba(255,255,255,0.14)',
  gridLine: 'rgba(255,255,255,0.12)',
  headerBg: 'rgba(255,255,255,0.05)',
  planeHead: '#e74c3c',
  planeBody: '#2ecc71',
  miss: '#95a5a6',
  hitBg: '#f39c12',
  killBg: '#e74c3c',
  previewValid: 'rgba(46,204,113,0.25)',
  previewInvalid: 'rgba(231,76,60,0.25)',
  previewHeadValid: 'rgba(46,204,113,0.45)',
  previewHeadInvalid: 'rgba(231,76,60,0.45)',
  btnPrimary: '#f7971e',
  btnSuccess: '#2ecc71',
  btnDanger: '#e74c3c',
  btnWarning: '#f39c12',
  btnText: '#fff',
  text: '#ddd',
  textDim: '#888',
  textGray: '#999',
  ruleBoxBg: 'rgba(255,255,255,0.06)',
  logMiss: '#95a5a6',
  logHit: '#f39c12',
  logKill: '#e74c3c',
  popupMissBg: 'rgba(149,165,166,0.85)',
  popupHitBg: 'rgba(243,156,18,0.85)',
  popupKillBg: 'rgba(231,76,60,0.85)',
  overlayBg: 'rgba(0,0,0,0.6)',
  waitBg: 'rgba(0,0,0,0.55)',
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

function drawText(text, x, y, color, size, align) {
  ctx.fillStyle = color || C.text;
  ctx.font = `${size || L.fontSize}px sans-serif`;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

// ==================== 按钮系统 ====================

function Button(label, x, y, w, h, color, action) {
  this.label = label;
  this.x = x;
  this.y = y;
  this.w = w;
  this.h = h;
  this.color = color;
  this.action = action;
}

Button.prototype.draw = function () {
  ctx.fillStyle = this.color;
  fillRoundRect(this.x, this.y, this.w, this.h, 6);
  drawText(this.label, this.x + this.w / 2, this.y + this.h / 2, C.btnText, Math.floor(this.h * 0.42), 'center');
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

  // 背景
  ctx.fillStyle = C.bg;
  ctx.fillRect(L.boardX - 2, boardY - 2, L.boardPx + 4, L.boardPx + 4);

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

  // 背景
  ctx.fillStyle = C.cellBg;
  ctx.fillRect(cx, cy, L.cellSize, L.cellSize);

  if (boardType === 'setup') {
    // 预览
    if (pmap[key]) {
      if (pmap[key].indexOf('head') >= 0) {
        ctx.fillStyle = pmap[key].indexOf('invalid') >= 0 ? C.previewHeadInvalid : C.previewHeadValid;
      } else {
        ctx.fillStyle = pmap[key].indexOf('invalid') >= 0 ? C.previewInvalid : C.previewValid;
      }
      ctx.fillRect(cx, cy, L.cellSize, L.cellSize);
    }
    // 飞机
    if (showPlanes) {
      if (planeMap[key] === 'head') {
        ctx.fillStyle = C.planeHead;
        ctx.fillRect(cx, cy, L.cellSize, L.cellSize);
        drawText('\u2708', cx + L.cellSize / 2, cy + L.cellSize / 2, '#fff', L.headerFontSize, 'center');
      } else if (planeMap[key] === 'body') {
        ctx.fillStyle = C.planeBody;
        ctx.fillRect(cx, cy, L.cellSize, L.cellSize);
      }
    }
  } else if (boardType === 'my') {
    // 我方棋盘：显示飞机 + 受攻击标记
    if (showPlanes) {
      if (planeMap[key] === 'head') {
        ctx.fillStyle = C.planeHead;
        ctx.fillRect(cx, cy, L.cellSize, L.cellSize);
        drawText('\u2708', cx + L.cellSize / 2, cy + L.cellSize / 2, '#fff', L.headerFontSize, 'center');
      } else if (planeMap[key] === 'body') {
        ctx.fillStyle = C.planeBody;
        ctx.fillRect(cx, cy, L.cellSize, L.cellSize);
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
          ctx.arc(cx + L.cellSize / 2, cy + L.cellSize / 2, L.cellSize * 0.25, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (atk === 'kill') {
        if (!planeMap[key]) {
          ctx.fillStyle = C.killBg;
          ctx.beginPath();
          ctx.arc(cx + L.cellSize / 2, cy + L.cellSize / 2, L.cellSize * 0.25, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  } else if (boardType === 'attack') {
    // 攻击棋盘：只显示攻击结果
    if (showAttacks) {
      const atk = board.attacks[row][col];
      if (atk === 'miss') {
        drawText('\u00d7', cx + L.cellSize / 2, cy + L.cellSize / 2, C.miss, L.headerFontSize, 'center');
      } else if (atk === 'hit') {
        ctx.fillStyle = C.hitBg;
        ctx.fillRect(cx, cy, L.cellSize, L.cellSize);
        drawText('\u4f24', cx + L.cellSize / 2, cy + L.cellSize / 2, '#fff', L.headerFontSize, 'center');
      } else if (atk === 'kill') {
        ctx.fillStyle = C.killBg;
        ctx.fillRect(cx, cy, L.cellSize, L.cellSize);
        drawText('\u843d', cx + L.cellSize / 2, cy + L.cellSize / 2, '#fff', L.headerFontSize, 'center');
      }
    }
  } else if (boardType === 'gameover') {
    // 结算：显示飞机 + 攻击结果
    if (showPlanes) {
      if (planeMap[key] === 'head') {
        ctx.fillStyle = C.planeHead;
        ctx.fillRect(cx, cy, L.cellSize, L.cellSize);
        drawText('\u2708', cx + L.cellSize / 2, cy + L.cellSize / 2, '#fff', L.headerFontSize, 'center');
      } else if (planeMap[key] === 'body') {
        ctx.fillStyle = C.planeBody;
        ctx.fillRect(cx, cy, L.cellSize, L.cellSize);
      }
    }
    if (showAttacks) {
      const atk = board.attacks[row][col];
      if (atk === 'miss' && !planeMap[key]) {
        drawText('\u00d7', cx + L.cellSize / 2, cy + L.cellSize / 2, C.miss, L.headerFontSize, 'center');
      } else if (atk === 'hit') {
        if (!planeMap[key]) {
          drawText('\u4f24', cx + L.cellSize / 2, cy + L.cellSize / 2, C.hitBg, L.headerFontSize, 'center');
        }
      } else if (atk === 'kill') {
        if (!planeMap[key]) {
          drawText('\u843d', cx + L.cellSize / 2, cy + L.cellSize / 2, C.killBg, L.headerFontSize, 'center');
        }
      }
    }
  }

  // 网格线
  ctx.strokeStyle = C.gridLine;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(cx, cy, L.cellSize, L.cellSize);
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

  // 标题
  drawText('\u68cb\u76d8\u98de\u673a\u5bf9\u6218', W / 2, cy - 170, C.title, 52, 'center');
  drawText('\u68cb\u76d8\u4e0a\u7684\u535a\u5f08', W / 2, cy - 118, C.textDim, 22, 'center');

  // 按钮
  const btnW = 240;
  const btnH = 56;
  const btnX = (W - btnW) / 2;
  const btnY = cy - 78;

  buttons = [
    new Button('\u5f00\u59cb\u4eba\u673a\u5bf9\u6218', btnX, btnY, btnW, btnH, C.btnPrimary, 'startPvE')
  ];

  for (const b of buttons) b.draw();

  // 规则说明
  const rulesY = btnY + btnH + 28;
  const rules = [
    '1. \u4f60\u548c\u673a\u5668\u4eba\u5404\u62e5\u6709\u4e00\u4e2a 10\u00d710 \u68cb\u76d8\uff0c\u5404\u81ea\u5e03\u7f6e 3 \u67b6\u98de\u673a',
    '2. \u98de\u673a\u5f62\u72b6\uff0810\u683c\uff09\u4e3a\u201c\u58eb\u201d\u5b57\u5f62\uff0c\u53ef\u65cb\u8f6c 4 \u4e2a\u65b9\u5411',
    '3. \u5e03\u9635\u5b8c\u6210\u540e\uff0c\u4ea4\u66ff\u5411\u5bf9\u65b9\u68cb\u76d8\u5f00\u70ae',
    '4. \u547d\u4e2d\u673a\u5934\u2192\u51fb\u843d\uff0c\u547d\u4e2d\u673a\u8eab\u2192\u51fb\u4f24\uff0c\u672a\u547d\u4e2d\u2192\u51fb\u7a7a',
    '5. \u9996\u5148\u51fb\u843d\u5bf9\u65b9\u5168\u90e8 3 \u67b6\u98de\u673a\u7684\u4e00\u65b9\u83b7\u80dc'
  ];

  const titleFontSize = 18;
  const ruleFontSize = 14;
  const lineH = 24;
  const boxPadding = 14;
  const titleBarH = 28;
  const boxW = W - 32;

  const boxH = titleBarH + rules.length * lineH + boxPadding * 2;
  const boxY = rulesY;
  const boxX = 16;

  ctx.fillStyle = C.ruleBoxBg;
  fillRoundRect(boxX, boxY, boxW, boxH, 10);

  drawText('\u6e38\u620f\u89c4\u5219', boxX + boxW / 2, boxY + boxPadding + titleBarH / 2, C.titleDark, titleFontSize, 'center');

  const ruleStartY = boxY + boxPadding + titleBarH + 2;
  for (let i = 0; i < rules.length; i++) {
    ctx.fillStyle = C.textGray;
    ctx.font = `${ruleFontSize}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(rules[i], boxX + 16, ruleStartY + i * lineH + lineH / 2);
  }
}

// ==================== 布阵画面 ====================

function renderSetup() {
  const HEADER_H = SAFE_TOP + 50;
  const boardY = HEADER_H + 10;
  const board = game.getCurrentBoard();

  // 标题
  drawText('\u73a9\u5bb6 \u5e03\u9635', W / 2, SAFE_TOP + 24, C.text, 18, 'center');
  drawText('\u5728\u68cb\u76d8\u4e0a\u653e\u7f6e 3 \u67b6\u98de\u673a\uff08\u70b9\u51fb\u9884\u89c8\uff0c\u518d\u6b21\u70b9\u51fb\u653e\u7f6e\uff09', W / 2, SAFE_TOP + 42, C.textDim, 11, 'center');

  // 棋盘
  drawBoard(board, boardY, 'setup', { previewMap, showAttacks: false });

  // 控制面板
  const controlsY = boardY + L.boardPx + 12;

  drawText(`\u5df2\u653e\u7f6e\uff1a${board.planes.length} / 3 \u67b6`, W / 2, controlsY, C.titleDark, 14, 'center');
  drawText(`\u5f53\u524d\u65b9\u5411\uff1a${Plane.DIRECTION_NAMES[game.setupDirection]} ${Plane.DIRECTION_ARROWS[game.setupDirection]}`, W / 2, controlsY + 18, C.textDim, 12, 'center');

  // 按钮
  const btnW = 130;
  const btnH = 44;
  const btnGap = 12;
  const btnCount = board.planes.length >= 3 ? 3 : 2;
  const totalBtnW = btnW * btnCount + btnGap * (btnCount - 1);
  const btnStartX = (W - totalBtnW) / 2;
  const btnY = controlsY + 36;

  buttons = [
    new Button('\u65cb\u8f6c\u65b9\u5411', btnStartX, btnY, btnW, btnH, C.btnWarning, 'rotateDir'),
    new Button('\u91cd\u7f6e\u5168\u90e8', btnStartX + btnW + btnGap, btnY, btnW, btnH, C.btnDanger, 'resetSetup'),
  ];

  if (board.planes.length >= 3) {
    buttons.push(new Button('\u786e\u8ba4\u5e03\u9635', btnStartX + (btnW + btnGap) * 2, btnY, btnW, btnH, C.btnSuccess, 'confirmSetup'));
  }

  for (const b of buttons) b.draw();
}

// ==================== 对战画面 ====================

function renderBattle() {
  const HEADER_H = SAFE_TOP + 50;

  // 滚动偏移（内容整体上移，露出下方被遮挡部分）
  ctx.save();
  ctx.translate(0, -scrollOffset);

  // 标题
  const turnLabel = game.currentPlayer === 1
    ? '\u4f60\u7684\u56de\u5408 - \u8bf7\u5728\u673a\u5668\u4eba\u68cb\u76d8\u4e0a\u9009\u62e9\u653b\u51fb\u4f4d\u7f6e'
    : '\u673a\u5668\u4eba\u601d\u8003\u4e2d...';
  drawText('\u5bf9\u6218\u9636\u6bb5', W / 2, SAFE_TOP + 12, C.text, 16, 'center');
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

  // 统计
  const statsY = myGridY + L.boardPx + 4;
  const myKills = game.boards[1].getKillCount();
  const otherKills = game.boards[0].getKillCount();
  drawText(
    `\u4f60 \u51fb\u843d: ${myKills}/3    \u673a\u5668\u4eba \u51fb\u843d: ${otherKills}/3    \u56de\u5408: ${game.round}`,
    W / 2, statsY + 6, C.text, L.smallFontSize, 'center'
  );

  // 日志（最多4条）
  const logY = statsY + 16;
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
    new Button('\u8ba4\u8f93', W / 2 - 36, btnY2, 72, 28, C.btnDanger, 'surrender')
  ];
  for (const b of buttons) b.draw();

  // 计算最大滚动距离（内容底部超出屏幕的高度）
  const contentBottom = btnY2 + 28 + 20;
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
  const barY = H - 40;
  ctx.fillStyle = 'rgba(46,204,113,0.15)';
  ctx.fillRect(0, barY, W, 40);
  drawText('\u673a\u5668\u4eba\u601d\u8003\u4e2d...', W / 2, barY + 20, C.btnSuccess, 14, 'center');
}

function drawAttackPopup() {
  if (!attackPopup) return;
  const { text, type } = attackPopup;
  const bgColor = type === 'miss' ? C.popupMissBg : type === 'hit' ? C.popupHitBg : C.popupKillBg;
  const popupW = 160;
  const popupH = 48;
  const popupX = (W - popupW) / 2;
  const popupY = H / 2 - popupH / 2;

  ctx.fillStyle = bgColor;
  fillRoundRect(popupX, popupY, popupW, popupH, 12);
  drawText(text, W / 2, popupY + popupH / 2, '#fff', 22, 'center');
}

// ==================== 结算画面 ====================

function renderGameover() {
  const totalH = 40 + 40 + L.boardPx * 2 + 60 + 60;
  const startY = H / 2 - totalH / 2 + 20;

  // 标题
  drawText('\u6e38\u620f\u7ed3\u675f', W / 2, startY, C.text, 24, 'center');

  // 获胜者判断
  const iWon = game.winner === 1;
  const winnerText = iWon
    ? '\u606d\u559c\uff0c\u4f60\u8d62\u4e86\uff01'
    : '\u673a\u5668\u4eba\u83b7\u80dc\uff01';
  const winColor = iWon ? C.title : C.logKill;
  drawText(winnerText, W / 2, startY + 28, winColor, 18, 'center');

  // 棋盘标签
  const b1Y = startY + 52;
  drawText('\u4f60\u7684\u68cb\u76d8', W / 2, b1Y, C.textDim, L.smallFontSize, 'center');
  drawBoard(game.boards[0], b1Y + 6, 'gameover', { showAttacks: true });

  const b2Y = b1Y + L.boardPx + 12;
  drawText('\u673a\u5668\u4eba\u7684\u68cb\u76d8', W / 2, b2Y, C.textDim, L.smallFontSize, 'center');
  drawBoard(game.boards[1], b2Y + 6, 'gameover', { showAttacks: true });

  // 重新开始按钮
  const btnY = b2Y + L.boardPx + 12;
  buttons = [
    new Button('\u518d\u6765\u4e00\u5c40', W / 2 - 80, btnY, 160, 44, C.btnPrimary, 'restart')
  ];
  for (const b of buttons) b.draw();
}

// ==================== 主循环 ====================

function loop() {
  // 重置变换矩阵并应用 DPR 缩放（物理像素 = 逻辑像素 × DPR）
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  calcLayout();

  // 清屏
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  switch (phase) {
    case 'start': renderStart(); break;
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

  // 对战页面需要补偿滚动偏移后再进行点击检测
  const checkY = phase === 'battle' ? ty + scrollOffset : ty;

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
  if (phase !== 'battle') return;

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

// ==================== 转发功能 ====================

// 开启右上角转发菜单
wx.showShareMenu({
  withShareTicket: true,
  menus: ['shareAppMessage', 'shareTimeline']
});

// 注册转发回调
wx.onShareAppMessage(function () {
  return {
    title: '\u68cb\u76d8\u98de\u673a\u5bf9\u6218 - \u6765\u4e0b\u4e00\u76d8\u68cb\u76d8\u4e0a\u7684\u535a\u5f08\u5427\uff01',
    imageUrl: '' // 留空使用默认截图
  };
});

// ==================== 启动游戏 ====================
loop();
