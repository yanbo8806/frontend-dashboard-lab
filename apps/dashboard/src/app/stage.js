import { STAGE } from '../layout.js';

/** 纯计算函数便于单元测试；普通网站应使用流式布局，不照搬固定舞台。 */
export function stageTransform(width, height) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) {
    throw new RangeError('视口宽高必须是大于零的有限数值');
  }
  const scale = Math.min(width / STAGE.width, height / STAGE.height);
  return {
    scale,
    left: Math.max(0, (width - STAGE.width * scale) / 2),
    top: Math.max(0, (height - STAGE.height * scale) / 2),
  };
}

export function fitStage(stage) {
  if (!window.innerWidth || !window.innerHeight) return;
  const { scale, left, top } = stageTransform(window.innerWidth, window.innerHeight);
  stage.style.transform = `scale(${scale})`;
  stage.style.left = `${left}px`;
  stage.style.top = `${top}px`;
}
