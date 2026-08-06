/**
 * Plane 类 - 飞机模型
 * 飞机由 10 个格子组成，支持 4 个方向旋转
 * 坐标系：x 为列(0-9 左→右)，y 为行(0-9 上→下)
 */

// 各方向的偏移量，以机头为原点 (0,0)
const OFFSETS = {
  up:    [[0,0],[0,1],[-1,1],[1,1],[-2,1],[2,1],[0,2],[0,3],[-1,3],[1,3]],
  down:  [[0,0],[0,-1],[-1,-1],[1,-1],[-2,-1],[2,-1],[0,-2],[0,-3],[-1,-3],[1,-3]],
  left:  [[0,0],[1,0],[1,-1],[1,1],[1,-2],[1,2],[2,0],[3,0],[3,-1],[3,1]],
  right: [[0,0],[-1,0],[-1,-1],[-1,1],[-1,-2],[-1,2],[-2,0],[-3,0],[-3,-1],[-3,1]]
};

const DIRECTION_NAMES = {
  up: '朝上',
  down: '朝下',
  left: '朝左',
  right: '朝右'
};

const DIRECTION_ARROWS = {
  up: '↑ 机头朝上',
  down: '↓ 机头朝下',
  left: '← 机头朝左',
  right: '→ 机头朝右'
};

const ROTATION_ORDER = ['up', 'right', 'down', 'left'];

class Plane {
  constructor(headX, headY, direction = 'up') {
    this.headX = headX;
    this.headY = headY;
    this.direction = direction;
  }

  /**
   * 获取飞机所有点的坐标
   */
  getPoints() {
    const offsets = OFFSETS[this.direction];
    return offsets.map(([dx, dy]) => ({ x: this.headX + dx, y: this.headY + dy }));
  }

  /**
   * 获取机头坐标
   */
  getHeadPoint() {
    return { x: this.headX, y: this.headY };
  }

  /**
   * 获取机身（不含机头）的所有点
   */
  getBodyPoints() {
    return this.getPoints().slice(1);
  }

  /**
   * 判断飞机是否完全在棋盘范围内
   */
  isInBounds(size = 10) {
    return this.getPoints().every(p => p.x >= 0 && p.x < size && p.y >= 0 && p.y < size);
  }

  /**
   * 判断与另一架飞机是否重叠
   */
  conflictsWith(other) {
    const myPoints = this.getPoints();
    const otherPoints = other.getPoints();
    return myPoints.some(p1 => otherPoints.some(p2 => p1.x === p2.x && p1.y === p2.y));
  }

  /**
   * 顺时针旋转 90°
   */
  rotate() {
    const idx = ROTATION_ORDER.indexOf(this.direction);
    this.direction = ROTATION_ORDER[(idx + 1) % 4];
  }

  /**
   * 深拷贝
   */
  clone() {
    return new Plane(this.headX, this.headY, this.direction);
  }
}

Plane.OFFSETS = OFFSETS;
Plane.DIRECTION_NAMES = DIRECTION_NAMES;
Plane.DIRECTION_ARROWS = DIRECTION_ARROWS;
Plane.ROTATION_ORDER = ROTATION_ORDER;

module.exports = Plane;
