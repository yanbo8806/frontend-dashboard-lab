import { STAGE, HEADER_COPY } from '../layout.js';
import { headerChromeSVG } from '../headerChrome.js';
import { box, button } from '../shared/dom.js';

// 用户意图通过回调交给应用层；组件不直接启动 API 或打开编辑器。
export function buildHeader(stage,config,{onConfigure,onRefresh}){
  box(stage,'div',{w:STAGE.width,h:74,cls:'header'});
  box(stage,'div',{w:STAGE.width,h:76,cls:'header-chrome-holder',html:headerChromeSVG(STAGE.width,76)});
  // 两行共用中央标题安全区，保留完整文本，不用隐藏或省略号掩盖越界。
  box(stage,'h1',{...HEADER_COPY.title,cls:'header-title',text:config.meta.title});
  box(stage,'div',{...HEADER_COPY.subtitle,cls:'dashboard-subtitle',text:config.meta.subtitle});
  const badge=box(stage,'div',{x:23,y:18,w:270,h:26,cls:'data-badge',text:config.meta.dataLabel});badge.title='数据更新时间：'+config.meta.updatedAt;
  const statusNode=box(stage,'div',{x:23,y:45,w:380,h:19,cls:'data-status'});
  button(stage,'数据配置',onConfigure,{x:1745,y:18,w:108,h:32,cls:'header-action'});
  button(stage,'同步',onRefresh,{x:1680,y:18,w:55,h:32,cls:'header-action secondary'});
  return statusNode;
}
