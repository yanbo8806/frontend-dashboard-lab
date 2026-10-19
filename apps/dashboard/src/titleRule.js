// The decoration line under every panel title (标题装饰线).
//
// Measured from reference/ref.png — it is a *polyline*, not a bar:
//   * a thin line starting right after the title icon, ~5px thick there and
//     thinning to 1–2px as it runs right, drifting ~1px downward;
//   * at ~3/4 of the panel width it bends upward at 30–36°;
//   * L1 alone continues with a short horizontal tail that fades out.
// Colour runs from a yellow-orange next to the icon to red at the bend, and the
// tail fades to transparent. All numbers (x0/x1/x2/x3/y0/y1, page pixels) come
// from that probe; this module only draws them.

/** Build the SVG for one panel's title rule. `rect` is the panel box. */
export function titleRuleSVG(rect, rule, uid) {
  const x0 = rule.x0 - rect.x, x1 = rule.x1 - rect.x, x2 = rule.x2 - rect.x, x3 = rule.x3 - rect.x;
  const y0 = rule.y0 - rect.y, y1 = rule.y1 - rect.y;
  const span = Math.max(1, x3 - x0);
  const f1 = (x1 - x0) / span;                 // colour has turned red here
  const f2 = (x2 - x0) / span;                 // bend completed here
  const hasTail = x3 - x2 > 4;

  const stop = ([o, c, a]) => `<stop offset="${o.toFixed(3)}" stop-color="${c}" stop-opacity="${a}"/>`;
  const core = [
    [0, 'rgb(255,205,125)', 1],
    [0.18, 'rgb(255,180,92)', 1],
    [0.38, 'rgb(252,148,76)', 1],
    [0.62, 'rgb(236,118,84)', 1],
    [Math.min(f1, 0.97), 'rgb(251,110,82)', 1],
    ...(f2 - f1 > 0.03 ? [[Math.min(f2 - 0.01, 0.98), 'rgb(242,112,88)', 0.95]] : []),
    ...(hasTail
      ? [[Math.min(f2 + 0.05, 0.99), 'rgb(196,112,142)', 0.34], [1, 'rgb(160,108,150)', 0]]
      : [[Math.min(f2 + 0.02, 0.99), 'rgb(215,112,110)', 0.4], [1, 'rgb(180,110,130)', 0]]),
  ];
  // the thick start: a wider, translucent copy of the same path
  const bloom = [
    [0, 'rgb(255,195,115)', 0.55],
    [0.16, 'rgb(252,168,95)', 0.34],
    [0.34, 'rgb(244,140,88)', 0.12],
    [0.46, 'rgb(240,130,85)', 0],
  ];
  const d = `M ${x0},${y0} H ${x1} L ${x2},${y1}` + (hasTail ? ` H ${x3}` : '');

  return `<svg class="title-rule" width="${rect.w}" height="${rect.h}" viewBox="0 0 ${rect.w} ${rect.h}"`
    + ` xmlns="http://www.w3.org/2000/svg" style="overflow:visible">`
    + `<defs>`
    + `<linearGradient id="tr-${uid}" gradientUnits="userSpaceOnUse" x1="${x0}" y1="0" x2="${x3}" y2="0">${core.map(stop).join('')}</linearGradient>`
    + `<linearGradient id="trb-${uid}" gradientUnits="userSpaceOnUse" x1="${x0}" y1="0" x2="${x3}" y2="0">${bloom.map(stop).join('')}</linearGradient>`
    + `</defs>`
    + `<path d="${d}" fill="none" stroke="url(#trb-${uid})" stroke-width="5" stroke-linecap="round"/>`
    + `<path d="${d}" fill="none" stroke="url(#tr-${uid})" stroke-width="2.2" stroke-linecap="round"/>`
    + `</svg>`;
}
