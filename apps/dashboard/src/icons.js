// 图标使用可编辑的 SVG 形状；以实际墨迹盒匹配尺寸，避免固定 SVG 宽高覆盖父容器。
const svg = (body, viewBox = '0 0 44 36') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+viewBox+'" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">'+body+'</svg>';
const cyan = '#00deef', hot = '#ff8d38', yellow = '#ffe777';
const people = '<circle cx="22" cy="8" r="6" fill="#ffd66a"/><circle cx="9" cy="13" r="4.4" fill="#ffb347"/><circle cx="35" cy="13" r="4.4" fill="#ffb347"/>'
  + '<path d="M1 34V27Q1 19 9 19Q15 19 17 25V34ZM27 34V25Q29 19 35 19Q43 19 43 27V34Z" fill="#ff7934" stroke="#ffd572" stroke-width="1.2"/>'
  + '<path d="M10 35V28Q10 17 22 17Q34 17 34 28V35Z" fill="#ff9835" stroke="#ffde85" stroke-width="1.4"/>';
export const icons = {
  trend: svg('<path d="M4 33H43M7 31V25H14V31M19 31V19H26V31M32 31V10H38V31" fill="'+hot+'" stroke="'+yellow+'" stroke-width="1.1"/>'
    + '<path d="M3 29L14 21L22 23L39 4M32 6L41 2L40 12" fill="none" stroke="#ffdd80" stroke-width="2.4"/>'
    + '<path d="M5 17L14 12L23 18L31 11" fill="none" stroke="#ff8f38" stroke-width="1.5"/>'),
  pie: svg('<path d="M21 4A15 15 0 1 0 37 20H21Z" fill="'+hot+'" stroke="#ffdf7c" stroke-width="1.6"/>'
    + '<path d="M25 1A15 15 0 0 1 41 16H25Z" fill="#ffae45" stroke="#ffe387" stroke-width="1.4"/>', '0 0 44 36'),
  flame: svg('<path d="M15 35C-1 31 0 20 9 12C7 22 15 19 14 13C18 7 15 4 14 1C28 6 25 16 26 19C29 18 29 15 29 12C41 25 31 36 15 35Z" fill="#ff9633" stroke="#ffc754" stroke-width="1"/>'
    + '<path d="M16 33C7 29 15 20 18 14C17 22 26 28 21 33Z" fill="#ffe26a"/>', '0 0 34 36'),
  people: svg(people),
  users: svg('<g fill="'+cyan+'"><circle cx="13" cy="8" r="7"/><circle cx="32" cy="8" r="7"/>'
    + '<path d="M0 36V28Q0 17 13 17Q17 17 19 19Q9 22 9 31V36ZM11 36V29Q11 18 22 18Q33 18 33 29V36ZM35 36V29Q35 22 26 18Q28 16 32 16Q45 16 45 29V36Z"/></g>', '0 0 45 36'),
  province: svg('<path d="M2 14L9 12L13 5L18 11L26 12L30 8L35 9L37 2L42 0L45 4L42 8L47 10L45 16L38 17L37 21L32 21L33 28L27 33L24 32L21 37L18 32L12 31L13 28L8 29L5 25L1 22L3 19L0 17Z" fill="'+cyan+'"/>'
    + '<path d="M22 12L28 18L24 25M33 13L31 21L35 25" fill="none" stroke="#00b9d6" stroke-width=".8"/>','0 0 47 38'),
  pin: svg('<path d="M15 1C6 1 1 7 1 15C1 23 15 39 15 39S30 23 30 15C30 7 24 1 15 1ZM15 9A6 6 0 1 1 15 21A6 6 0 1 1 15 9" fill="'+cyan+'" fill-rule="evenodd"/>'
    + '<path d="M34 31C46 31 44 43 32 43H4L7 40" fill="none" stroke="'+cyan+'" stroke-width="2" stroke-dasharray="7 4"/>', '0 0 44 44'),
  app: svg('<path d="M8 12V2H36V12M8 31V43H36V31M20 39H25" fill="none" stroke="'+cyan+'" stroke-width="3"/>'
    + '<path d="M1 13H44V32H1Z" fill="'+cyan+'"/>'
    + '<text x="3" y="29" fill="#003367" font-family="Arial,sans-serif" font-size="21">APP</text>', '0 0 45 45'),
  car: svg('<path d="M3 11L7 2H24L28 11L30 13V23H26V20H5V23H1V13ZM7 4L4 12H27L23 4ZM5 14A2.2 2.2 0 1 0 5 18A2.2 2.2 0 1 0 5 14ZM26 14A2.2 2.2 0 1 0 26 18A2.2 2.2 0 1 0 26 14Z" fill="'+cyan+'" fill-rule="evenodd"/>','0 0 31 25'),
  train: svg('<path d="M6 3H11V0H17V3H22Q27 3 27 8V27H23L28 33H23L21 30H7L5 33H0L5 27H1V8Q1 3 6 3ZM5 9V18H23V9ZM7 21A2 2 0 1 0 7 25A2 2 0 1 0 7 21ZM21 21A2 2 0 1 0 21 25A2 2 0 1 0 21 21" fill="'+cyan+'" fill-rule="evenodd"/>', '0 0 28 34'),
  plane: svg('<path d="M13 4Q13 0 16 0Q19 0 19 4V13L31 23V26L19 22V29L24 32V34L16 32L8 34V32L13 29V22L1 26V23L13 13Z" fill="#f8df58"/>', '0 0 32 34'),
  male: svg('<circle cx="9" cy="4" r="3.5" fill="'+cyan+'"/><path d="M4 10Q9 7 14 10L17 24H14L12 15V35H9V23H8V35H5V15L3 24H0Z" fill="'+cyan+'"/>', '0 0 18 35'),
  dropPink: svg('<path d="M7 0C6 5 0 5 0 10A7 7 0 0 0 14 10C14 5 8 4 7 0Z" fill="#f8a0f1"/><circle cx="6" cy="8" r="3" fill="#fff0ff"/>', '0 0 14 17'),
  dropCyan: svg('<path d="M7 0C6 5 0 5 0 10A7 7 0 0 0 14 10C14 5 8 4 7 0Z" fill="'+cyan+'"/><circle cx="6" cy="8" r="3" fill="#dfffff"/>', '0 0 14 17'),
  dotCyan: svg('<circle cx="7" cy="7" r="5.75" fill="#cffcfe" stroke="#03e2f8" stroke-width="2.5"/>', '0 0 14 14'),
  dotYellow: svg('<circle cx="7" cy="7" r="5.75" fill="#fcfbe3" stroke="#f7e26b" stroke-width="2.5"/>', '0 0 14 14'),
  arrowUp: svg('<path d="M9.5 0L19 12.4H14V26H5V12.4H0Z" fill="#ff3038"/>', '0 0 19 26'),
};
