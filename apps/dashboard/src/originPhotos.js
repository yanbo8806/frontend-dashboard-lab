/** 教学版仅使用干净插图/上传图片，由 CSS object-fit: cover 填满独立圆框。 */
export function originImageRect(diameter) {
  if (!Number.isFinite(diameter) || diameter <= 0) throw new RangeError('圆框直径必须是正数');
  return { x: 0, y: 0, w: diameter, h: diameter };
}
