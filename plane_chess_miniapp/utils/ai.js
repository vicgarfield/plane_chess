/**
 * AI 机器人模块
 * 实现飞机布阵策略和攻击策略（Hunt & Target 模式）
 */

const Plane = require('./plane');

class AI {
  constructor() {
    // 攻击记忆：记录已攻击和命中的格子
    this._attacked = new Set();       // 已攻击坐标
    this._hits = [];                  // 命中但未击落的坐标 [{x, y}]
    this._targetQueue = [];           // 优先攻击队列（命中格子相邻格）
  }

  /**
   * 重置攻击记忆（新游戏开始时调用）
   */
  resetAttackMemory() {
    this._attacked = new Set();
    this._hits = [];
    this._targetQueue = [];
  }

  // ==================== 布阵策略 ====================

  /**
   * 在棋盘上自动布置 3 架飞机
   * 策略：随机尝试合法位置，分散放置
   */
  placePlanes(board) {
    board.resetPlanes();
    const directions = Plane.ROTATION_ORDER; // ['up', 'right', 'down', 'left']
    const positions = this._shufflePositions();

    for (const { x, y, dir } of positions) {
      if (board.planes.length >= 3) break;
      const plane = new Plane(x, y, dir);
      if (board.canPlace(plane)) {
        board.addPlane(plane);
      }
    }

    // 极端情况：如果随机顺序没放够 3 架，暴力遍历
    if (board.planes.length < 3) {
      board.resetPlanes();
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          for (const dir of directions) {
            if (board.planes.length >= 3) break;
            const plane = new Plane(x, y, dir);
            if (board.canPlace(plane)) {
              board.addPlane(plane);
            }
          }
        }
      }
    }

    return board.planes.length === 3;
  }

  /**
   * 生成随机打乱的位置-方向组合
   */
  _shufflePositions() {
    const positions = [];
    const directions = Plane.ROTATION_ORDER;

    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        for (const dir of directions) {
          positions.push({ x, y, dir });
        }
      }
    }

    // Fisher-Yates 洗牌
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    return positions;
  }

  // ==================== 攻击策略 ====================

  /**
   * 选择下一个攻击目标（Hunt & Target 策略）
   * @param {Board} opponentBoard - 对手棋盘
   * @returns {{ x: number, y: number }}
   */
  chooseAttack(opponentBoard) {
    // 1. Target 模式：优先攻击命中格子周围的格子
    while (this._targetQueue.length > 0) {
      const target = this._targetQueue.shift();
      const key = `${target.x},${target.y}`;
      if (!this._attacked.has(key) && this._isInBounds(target.x, target.y)) {
        return target;
      }
    }

    // 2. Hunt 模式：使用棋盘格模式（checkerboard）遍历未攻击格
    const huntTarget = this._huntPattern(opponentBoard);
    if (huntTarget) return huntTarget;

    // 3. 兜底：随机选一个未攻击的格子
    return this._randomUnexplored();
  }

  /**
   * 棋盘格模式搜索：隔行隔列跳跃，提高命中概率
   */
  _huntPattern(opponentBoard) {
    // 先尝试 2x2 棋盘格（奇偶交叉）
    for (let parity = 0; parity <= 1; parity++) {
      for (let y = 0; y < 10; y++) {
        for (let x = (y + parity) % 2; x < 10; x += 2) {
          const key = `${x},${y}`;
          if (!this._attacked.has(key)) {
            return { x, y };
          }
        }
      }
    }
    return null;
  }

  /**
   * 随机选择未攻击的格子（兜底）
   */
  _randomUnexplored() {
    const candidates = [];
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        if (!this._attacked.has(`${x},${y}`)) {
          candidates.push({ x, y });
        }
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * 记录攻击结果，更新 Target 队列
   */
  recordAttackResult(x, y, resultType) {
    const key = `${x},${y}`;
    this._attacked.add(key);

    if (resultType === 'hit' || resultType === 'kill') {
      this._hits.push({ x, y });
      // 添加相邻四格到优先队列
      const neighbors = [
        { x: x + 1, y }, { x: x - 1, y },
        { x, y: y + 1 }, { x, y: y - 1 }
      ];
      for (const n of neighbors) {
        const nk = `${n.x},${n.y}`;
        if (this._isInBounds(n.x, n.y) && !this._attacked.has(nk)) {
          // 避免重复添加
          if (!this._targetQueue.some(t => t.x === n.x && t.y === n.y)) {
            this._targetQueue.unshift(n);
          }
        }
      }
    }

    // 如果是 kill，可以清理 targetQueue 中该飞机已覆盖的格子
    // 简化处理：kill 后继续使用 targetQueue
    if (resultType === 'kill') {
      // 清除与该 kill 相关的孤立 hit 记录（简化：不移除，保留队列）
    }
  }

  _isInBounds(x, y) {
    return x >= 0 && x < 10 && y >= 0 && y < 10;
  }
}

module.exports = AI;
