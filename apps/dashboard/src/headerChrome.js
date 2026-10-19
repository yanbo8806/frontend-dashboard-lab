// 页头由连续折线轮廓、裁切渐变与成组斜块组成。先还原轮廓，再调局部亮度。
// SVG 使用用户坐标渐变，水平线不会因包围盒零高而消失。
export function headerChromeSVG(w, h) {
  const band = 'M0 0H1871V5L1418 28L1370 9L1229 14L1180 54L693 54L644 14L503 9L454 28L0 5Z';
  const edge = 'M0 5L454 28L503 9L644 14L693 54L935 61L1180 54L1229 14L1370 9L1418 28L1871 5';
  const lower = 'M294 28L454 39L501 22L644 23L692 59L936 67L1180 59L1229 23L1370 22L1417 39L1578 28';
  const slabs = [
    [529,26,21,11,.15], [563,26,24,12,.7], [604,27,29,12,1],
    [1226,27,29,12,1], [1275,26,24,12,.7], [1314,26,21,11,.15],
  ].map(([x,y,width,height,opacity]) => {
    const skew = x < 935 ? 12 : -12;
    return '<path d="M'+x+' '+y+'h'+width+'l'+skew+' '+height+'h-'+width+'Z" fill="url(#header-red)" opacity="'+opacity+'"/>';
  }).join('');
  return '<svg class="header-chrome" width="'+w+'" height="'+h+'" viewBox="0 0 1871 76" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<defs>'
    + '<linearGradient id="header-fill" x1="0" y1="0" x2="1871" y2="0" gradientUnits="userSpaceOnUse">'
    + '<stop stop-color="#003050"/><stop offset=".2" stop-color="#0045b3"/><stop offset=".38" stop-color="#005add"/>'
    + '<stop offset=".5" stop-color="#0062ef"/><stop offset=".64" stop-color="#005bdd"/><stop offset=".8" stop-color="#0045b3"/><stop offset="1" stop-color="#003050"/>'
    + '</linearGradient>'
    + '<linearGradient id="header-shade" x1="0" y1="0" x2="0" y2="65" gradientUnits="userSpaceOnUse">'
    + '<stop stop-color="#000d39" stop-opacity=".12"/><stop offset=".48" stop-color="#002fa0" stop-opacity=".24"/><stop offset="1" stop-color="#0089ff" stop-opacity=".5"/></linearGradient>'
    + '<linearGradient id="header-edge" x1="0" y1="0" x2="1871" y2="0" gradientUnits="userSpaceOnUse">'
    + '<stop stop-color="#0574bc"/><stop offset=".18" stop-color="#6ef5ff"/><stop offset=".5" stop-color="#a7faff"/><stop offset=".82" stop-color="#6ef5ff"/><stop offset="1" stop-color="#0574bc"/></linearGradient>'
    + '<linearGradient id="header-red" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ff6242"/><stop offset=".5" stop-color="#ff9b62"/><stop offset="1" stop-color="#e33330"/></linearGradient>'
    + '<radialGradient id="header-bottom"><stop stop-color="#8aeaff" stop-opacity=".7"/><stop offset="1" stop-color="#1ab7ff" stop-opacity="0"/></radialGradient>'
    + '<filter id="header-glow" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="2.5"/></filter></defs>'
    + '<path d="'+band+'" fill="url(#header-fill)"/><path d="'+band+'" fill="url(#header-shade)"/>'
    + '<path d="'+edge+'" fill="none" stroke="#00c8ff" stroke-width="3" opacity=".36" filter="url(#header-glow)"/>'
    + '<path d="'+edge+'" fill="none" stroke="url(#header-edge)" stroke-width="1.7"/>'
    + '<path d="'+lower+'" fill="none" stroke="url(#header-edge)" stroke-width="1.4"/>'
    + '<path d="M191 0L208 10L455 27L502 9L696 12L711 0M1158 0L1173 12L1368 9L1418 27L1665 10L1682 0" fill="none" stroke="#64ddff" stroke-width="1.3"/>'
    + '<path d="M97 11L249 20M1623 20L1774 11" stroke="#a5f8ff" stroke-width="1.5"/>'
    + '<path d="M475 34L502 29L542 57L507 35Z M1330 57L1364 29L1394 34L1366 35Z" fill="#0863a1" stroke="#1397cc" stroke-width=".7"/>'
    + '<path d="M14 38L32 21L154 27L166 38L32 34L21 44Z M1857 38L1839 21L1717 27L1705 38L1839 34L1850 44Z" fill="#053361" opacity=".65"/>'
    + '<g filter="url(#header-glow)" opacity=".65">'+slabs+'</g><g>'+slabs+'</g>'
    + '<ellipse cx="936" cy="64" rx="198" ry="4" fill="url(#header-bottom)"/></svg>';
}
