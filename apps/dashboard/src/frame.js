// Panel / KPI frame drawn as SVG.
//
// Everything here is measured from reference/ref.png by the img2code probes
// (see README, section "边框模型"). Summary of what the reference actually
// draws, per panel:
//   * a rounded-off *cut corner*: vertical edge + 45° diagonal + horizontal
//     edge (never a right angle, never an arc); L1's diagonal runs (24,74) → (16,82)
//   * a ~1.4px base line, flat along each edge, whose centre sits slightly
//     outside the box on the top/left and inside on the bottom/right
//   * per corner a 2.8px bright cyan diagonal plus two bright arms that fade
//     within ~17px (horizontal) / ~15px (vertical)
//   * a thin 1.05px brightness tail that continues along the edge (long only on
//     the top edge next to the top-left corner)
//
// Colours below are the probe's *rendered* pixel values, which is why they look
// odd (e.g. the base line reads rgb(1,146,221) once the panel gradient is under it).

const SLOPE = 0.05;  // tiny tilt: keeps horizontal/vertical strokes gradient-capable

export const FRAME = {
  panel: {
    cut: 8,
    base: {
      left: 0.75, top: 0.75, right: 0.75, bottom: 0.75, widthH: 1.4, widthV: 1.5,
      topColor: 'rgb(1,146,221)', bottomColor: 'rgb(1,140,215)', sideColor: 'rgb(2,160,215)',
    },
    diag: { color: 'rgb(2,214,249)', width: 2.8 },
    arm: { width: 2.8, lenH: 17, lenV: 15, top: 1.13, left: 1.1, bottom: 1.1, right: 1.1 },
    tail: {
      width: 1.05, color: '#01bee8', top: 0.79, left: 0.84, bottom: 0.79, right: 0.84,
      tl: { h: 190, v: 22 }, tr: { h: 48, v: 22 }, bl: { h: 42, v: 22 }, br: { h: 48, v: 22 },
    },
  },
  kpi: {
    cut: 11,
    base: {
      left: 0.75, top: 0.75, right: 0.75, bottom: 0.75, widthH: 1.7, widthV: 1.6,
      topColor: 'rgb(2,115,197)', bottomColor: 'rgb(7,140,212)', sideColor: 'rgb(2,155,224)',
    },
    diag: { color: 'rgb(2,214,249)', width: 2.6 },
    arm: { width: 2.6, lenH: 18, lenV: 16, top: 0.9, left: 0.45, bottom: 0.45, right: 0.45 },
    tail: {
      width: 1.2, color: '#01bee8', top: 0.75, left: 0.8, bottom: 0.75, right: 0.8,
      tl: { h: 15, v: 20 }, tr: { h: 15, v: 20 }, bl: { h: 55, v: 45 }, br: { h: 55, v: 45 },
    },
  },
};

const ARM_COLOR = '#02f0ff'; // bright corner arms (g≈240)

/**
 * Shared gradient defs, in objectBoundingBox units so every frame in the
 * document can reuse them (each arm's own bbox spans exactly one arm length).
 * The bright arm holds full strength over its first 82% and then falls off; the
 * tail fades linearly along the edge.
 */
export function frameDefsSVG() {
  const dirs = { r: [0, 0, 1, 0], l: [1, 0, 0, 0], d: [0, 0, 0, 1], u: [0, 1, 0, 0] };
  const stops = (color, hard) => (hard
    ? `<stop offset="0" stop-color="${color}"/><stop offset="0.82" stop-color="${color}"/>`
      + `<stop offset="0.95" stop-color="${color}" stop-opacity="0.3"/>`
      + `<stop offset="1" stop-color="${color}" stop-opacity="0"/>`
    : `<stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/>`);
  const defs = [];
  for (const [d, v] of Object.entries(dirs)) {
    defs.push(`<linearGradient id="fca-${d}" x1="${v[0]}" y1="${v[1]}" x2="${v[2]}" y2="${v[3]}">${stops(ARM_COLOR, true)}</linearGradient>`);
    defs.push(`<linearGradient id="fcb-${d}" x1="${v[0]}" y1="${v[1]}" x2="${v[2]}" y2="${v[3]}">${stops(FRAME.panel.tail.color, false)}</linearGradient>`);
  }
  return `<svg class="frame-defs" width="0" height="0" aria-hidden="true"><defs>${defs.join('')}</defs></svg>`;
}

/** One frame; `kind` is 'panel' or 'kpi', `w`/`h` are the owning box size. */
export function frameSVG(w, h, kind = 'panel') {
  const c = FRAME[kind];
  const b = c.base, a = c.arm, t = c.tail;
  const k = c.cut;
  const lef = b.left, rig = w - b.right, top = b.top, bot = h - b.bottom;
  const xL = a.left, xR = w - a.right, yT = a.top, yB = h - a.bottom;
  const xLt = t.left, xRt = w - t.right, yTt = t.top, yBt = h - t.bottom;
  const p = [];
  const line = (d, stroke, width) => p.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="bevel"/>`);

  // ---- base outline: each edge path carries its two corner diagonals -------
  // `stroke-linejoin="bevel"` keeps those 45° joints flat. A miter join would
  // grow a 1.4/sin(22.5°) ≈ 3.7px spike past the vertex, and the reference has
  // no spike: its corner is exactly vertical + 45° + horizontal, nothing more.
  line(`M ${lef},${top + k} L ${lef + k},${top} H ${rig - k} L ${rig},${top + k}`, b.topColor, b.widthH);
  line(`M ${lef},${bot - k} L ${lef + k},${bot} H ${rig - k} L ${rig},${bot - k}`, b.bottomColor, b.widthH);
  line(`M ${lef},${top + k} V ${bot - k}`, b.sideColor, b.widthV);
  line(`M ${rig},${top + k} V ${bot - k}`, b.sideColor, b.widthV);

  // ---- corner accents: 45° diagonal + two fading arms + two tails ---------
  // The diagonal is *not* a bare segment: a butt cap on a 45° segment puts its
  // two cap corners ±width/2 along the perpendicular, so the stroke pokes ~1px
  // past the corner (the reference has no such overhang). Each accent therefore
  // runs as one polyline — a short stub along the vertical edge, the 45°
  // diagonal, a short stub along the horizontal edge — with bevel joins, so
  // both end caps are perpendicular to their own edge and nothing protrudes.
  const stub = a.width * 0.8;
  const corners = [
    { d: `M ${lef},${top + k + stub} L ${lef},${top + k} L ${lef + k},${top} L ${lef + k + stub},${top}`,
      hA: `M ${lef + k},${yT} L ${lef + k + a.lenH},${yT + SLOPE}`, hDir: 'r',
      vA: `M ${xL},${top + k} L ${xL + SLOPE},${top + k + a.lenV}`, vDir: 'd',
      hT: `M ${lef + k},${yTt} L ${lef + k + t.tl.h},${yTt + SLOPE}`,
      vT: `M ${xLt},${top + k} L ${xLt + SLOPE},${top + k + t.tl.v}` },
    { d: `M ${rig - k - stub},${top} L ${rig - k},${top} L ${rig},${top + k} L ${rig},${top + k + stub}`,
      hA: `M ${rig - k},${yT} L ${rig - k - a.lenH},${yT + SLOPE}`, hDir: 'l',
      vA: `M ${xR},${top + k} L ${xR - SLOPE},${top + k + a.lenV}`, vDir: 'd',
      hT: `M ${rig - k},${yTt} L ${rig - k - t.tr.h},${yTt + SLOPE}`,
      vT: `M ${xRt},${top + k} L ${xRt - SLOPE},${top + k + t.tr.v}` },
    { d: `M ${lef},${bot - k - stub} L ${lef},${bot - k} L ${lef + k},${bot} L ${lef + k + stub},${bot}`,
      hA: `M ${lef + k},${yB} L ${lef + k + a.lenH},${yB + SLOPE}`, hDir: 'r',
      vA: `M ${xL},${bot - k} L ${xL + SLOPE},${bot - k - a.lenV}`, vDir: 'u',
      hT: `M ${lef + k},${yBt} L ${lef + k + t.bl.h},${yBt + SLOPE}`,
      vT: `M ${xLt},${bot - k} L ${xLt + SLOPE},${bot - k - t.bl.v}` },
    { d: `M ${rig - k - stub},${bot} L ${rig - k},${bot} L ${rig},${bot - k} L ${rig},${bot - k - stub}`,
      hA: `M ${rig - k},${yB} L ${rig - k - a.lenH},${yB + SLOPE}`, hDir: 'l',
      vA: `M ${xR},${bot - k} L ${xR - SLOPE},${bot - k - a.lenV}`, vDir: 'u',
      hT: `M ${rig - k},${yBt} L ${rig - k - t.br.h},${yBt + SLOPE}`,
      vT: `M ${xRt},${bot - k} L ${xRt - SLOPE},${bot - k - t.br.v}` },
  ];
  for (const q of corners) {
    // tails first: a tail drawn on top would dim the bright arm underneath
    p.push(`<path d="${q.hT}" fill="none" stroke="url(#fcb-${q.hDir})" stroke-width="${t.width}"/>`);
    p.push(`<path d="${q.vT}" fill="none" stroke="url(#fcb-${q.vDir})" stroke-width="${t.width}"/>`);
    line(q.d, c.diag.color, c.diag.width);
    p.push(`<path d="${q.hA}" fill="none" stroke="url(#fca-${q.hDir})" stroke-width="${a.width}"/>`);
    p.push(`<path d="${q.vA}" fill="none" stroke="url(#fca-${q.vDir})" stroke-width="${a.width}"/>`);
  }

  return `<svg class="frame-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">${p.join('')}</svg>`;
}
