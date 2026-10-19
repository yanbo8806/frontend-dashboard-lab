// 布局只保存舞台几何；业务名称、图片和数值统一位于 public/config/dashboard.json。
export const STAGE = { width:1871, height:841 };
// 标题正文必须留在中央蓝色缎带 y<54 的安全区，不能压住下沿双发光线。
export const HEADER_COPY = {
  title:{x:697,y:2,w:477,h:35},
  subtitle:{x:711,y:39,w:449,h:14},
};
export const ORIGIN_ROW = {x:16,step:86.5,w:84,photo:{x:3,y:101,w:78,h:78},rank:{x:30,y:173,w:24,h:24}};
export const PANELS = {
  L1:{x:16,y:74,w:458,h:262}, L2:{x:16,y:346,w:458,h:252}, L3:{x:16,y:606,w:458,h:227},
  R1:{x:1399,y:74,w:459,h:308}, R2:{x:1399,y:388,w:459,h:210}, R3:{x:1399,y:606,w:459,h:227},
};
export const KPI_CARDS = [
  {id:'K1',x:504,y:81,w:208,h:84},{id:'K2',x:726,y:81,w:206,h:84},
  {id:'K3',x:945,y:81,w:202,h:84},{id:'K4',x:1161,y:81,w:206,h:84},
];
export const MAP_RECT = {x:485,y:178,w:903,h:646};
export const WALL_TILES = [
  {x:20,y:59,w:166,h:234},{x:194,y:59,w:116,h:119},{x:317,y:59,w:127,h:119},
  {x:194,y:183,w:116,h:110},{x:317,y:183,w:127,h:110},
];
