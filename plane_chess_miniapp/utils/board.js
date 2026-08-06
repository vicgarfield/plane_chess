/**
 * Board 类 - 棋盘模型
 * 管理 10×10 棋盘上的飞机布置和攻击记录
 */

const Plane = require('./plane');

class Board {
  constructor(size = 10) {
    this.size = size;
    this.planes = [];
    // attacks[y][x] = null | 'miss' | 'hit' | 'kill'
    this.attacks = Array.from({ length: size }, () => Array(size).fill(null));
    this.destroyedPlanes = [];
  }

  /**
   * 尝试添加一架飞机（含越界/碰撞检测）
   */
  addPlane(plane) {
    if (!plane.isInBounds(this.size)) return false;
    if (this.planes.some(p => plane.conflictsWith(p))) return false;
    this.planes.push(plane);
    return true;
  }

  /**
   * 移除最后一架飞机
   */
  removeLastPlane() {
    this.planes.pop();
  }

  /**
   * 清空所有飞机
   */
  resetPlanes() {
    this.planes = [];
  }

  /**
   * 判断飞机是否能放置
   */
  canPlace(plane) {
    if (!plane.isInBounds(this.size)) return false;
    return !this.planes.some(p => plane.conflictsWith(p));
  }

  /**
   * 接收一次攻击，返回攻击结果
   */
  receiveAttack(x, y) {
    if (this.attacks[y][x] !== null) return { type: 'duplicate' };

    // 遍历所有飞机，先检查是否命中机头
    for (const plane of this.planes) {
      const head = plane.getHeadPoint();
      if (head.x === x && head.y === y) {
        this.attacks[y][x] = 'kill';
        this.destroyedPlanes.push(plane);
        return { type: 'kill', plane: plane };
      }
      // 再检查机身
      const points = plane.getPoints();
      if (points.some(p => p.x === x && p.y === y)) {
        this.attacks[y][x] = 'hit';
        return { type: 'hit' };
      }
    }

    this.attacks[y][x] = 'miss';
    return { type: 'miss' };
  }

  /**
   * 获取已被击落的飞机数量
   */
  getKillCount() {
    return this.destroyedPlanes.length;
  }

  /**
   * 是否所有飞机已被击落
   */
  isAllDestroyed() {
    return this.destroyedPlanes.length >= 3;
  }

  /**
   * 获取非存活飞机的格子映射（已击落的飞机所有格子）
   */
  getDestroyedPlaneMap() {
    const map = {};
    this.destroyedPlanes.forEach(plane => {
      plane.getPoints().forEach(p => {
        map[`${p.x},${p.y}`] = true;
      });
    });
    return map;
  }

  /**
   * 构建飞机格子映射 { "x,y": 'head' | 'body' }
   */
  getPlaneMap() {
    const map = {};
    this.planes.forEach(plane => {
      const head = plane.getHeadPoint();
      map[`${head.x},${head.y}`] = 'head';
      plane.getBodyPoints().forEach(p => {
        map[`${p.x},${p.y}`] = 'body';
      });
    });
    return map;
  }
}

module.exports = Board;
