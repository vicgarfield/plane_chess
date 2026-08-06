/**
 * Game 类 - 游戏状态机（纯逻辑，不含视图操作）
 * 负责管理游戏阶段、回合切换、攻击判定等核心逻辑
 * 仅支持 PvE（人机对战）模式
 */

const Plane = require('./plane');
const Board = require('./board');
const AI = require('./ai');

class Game {
  constructor() {
    this.phase = 'start';          // 'start' | 'setup' | 'battle' | 'gameover'
    this.gameMode = 'pve';
    this.currentPlayer = 1;        // 1=我方回合, 2=对方回合
    this.boards = [new Board(), new Board()];  // [0]=我方棋盘, [1]=对手棋盘
    this.setupDirection = 'up';
    this.round = 1;
    this.logs = [];
    this.winner = null;
    this.ai = null;
  }

  startGame(mode = 'pve') {
    this.gameMode = mode;
    this.boards = [new Board(), new Board()];
    this.currentPlayer = 1;
    this.round = 1;
    this.logs = [];
    this.setupDirection = 'up';
    this.winner = null;
    this.ai = mode === 'pve' ? new AI() : null;
    this.phase = 'setup';
  }

  isAiTurn() {
    return this.gameMode === 'pve' && this.currentPlayer === 2;
  }

  aiSetupPlanes() {
    if (!this.ai || this.currentPlayer !== 2) return false;
    const board = this.getCurrentBoard();
    return this.ai.placePlanes(board);
  }

  aiExecuteAttack() {
    if (!this.ai || this.phase !== 'battle' || this.currentPlayer !== 2) return null;
    const opponentBoard = this.getOpponentBoard();
    const target = this.ai.chooseAttack(opponentBoard);
    if (!target) return null;
    return this.executeAttack(target.x, target.y);
  }

  getCurrentBoard() {
    return this.boards[this.currentPlayer - 1];
  }

  getOpponentBoard() {
    const opponent = this.currentPlayer === 1 ? 2 : 1;
    return this.boards[opponent - 1];
  }

  getOpponent() {
    return this.currentPlayer === 1 ? 2 : 1;
  }

  placePlane(x, y) {
    const board = this.getCurrentBoard();
    if (board.planes.length >= 3) return { success: false };
    const plane = new Plane(x, y, this.setupDirection);
    const placed = board.addPlane(plane);
    return { success: placed, plane: placed ? plane : null };
  }

  rotateDirection() {
    const idx = Plane.ROTATION_ORDER.indexOf(this.setupDirection);
    this.setupDirection = Plane.ROTATION_ORDER[(idx + 1) % 4];
  }

  resetSetup() {
    this.getCurrentBoard().resetPlanes();
    this.setupDirection = 'up';
  }

  confirmSetup() {
    if (this.gameMode === 'pve' && this.currentPlayer === 1) {
      this.currentPlayer = 2;
      this.setupDirection = 'up';
      this.aiSetupPlanes();
      this.currentPlayer = 1;
      this.phase = 'battle';
      return { action: 'start_battle' };
    }
    return { action: 'noop' };
  }

  getPreviewState(x, y) {
    const board = this.getCurrentBoard();
    if (board.planes.length >= 3) return null;
    const plane = new Plane(x, y, this.setupDirection);
    const valid = board.canPlace(plane);
    return { points: plane.getPoints(), valid };
  }

  executeAttack(x, y) {
    if (this.phase !== 'battle') return null;

    const opponentBoard = this.getOpponentBoard();
    const result = opponentBoard.receiveAttack(x, y);
    const attacker = this.currentPlayer;

    if (result.type === 'duplicate') return null;

    if (this.ai) {
      this.ai.recordAttackResult(x, y, result.type);
    }

    const coord = `${String.fromCharCode(65 + y)}${x}`;
    const attackerLabel = this._playerLabel(attacker);
    let logEntry;

    if (result.type === 'miss') {
      logEntry = { text: `${attackerLabel} -> (${coord}) 击空`, cls: 'log-miss' };
    } else if (result.type === 'hit') {
      logEntry = { text: `${attackerLabel} -> (${coord}) 击伤!`, cls: 'log-hit' };
    } else if (result.type === 'kill') {
      logEntry = { text: `${attackerLabel} -> (${coord}) 击落!!`, cls: 'log-kill' };
    }

    this.logs.push(logEntry);

    let gameOver = false;
    if (opponentBoard.isAllDestroyed()) {
      this.phase = 'gameover';
      this.winner = attacker;
      gameOver = true;
    }

    return {
      type: result.type,
      coord,
      logEntry,
      gameOver,
      attacker,
      opponent: this.getOpponent()
    };
  }

  switchTurn() {
    const nextPlayer = this.currentPlayer === 1 ? 2 : 1;
    if (nextPlayer === 1) this.round++;
    this.currentPlayer = nextPlayer;
    return nextPlayer;
  }

  _playerLabel(playerNum) {
    return playerNum === 1 ? '玩家' : '机器人';
  }

  getAttackDisplay(resultType) {
    switch (resultType) {
      case 'miss':  return { text: '击空', cls: 'miss' };
      case 'hit':   return { text: '击伤!', cls: 'hit' };
      case 'kill':  return { text: '击落!!', cls: 'kill' };
      default: return null;
    }
  }
}

module.exports = Game;
