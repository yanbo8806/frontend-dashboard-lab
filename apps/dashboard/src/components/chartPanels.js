import { buildTrendChart,buildDonutChart,buildAgeChart,buildGenderRing } from '../charts.js';
import { icons } from '../icons.js';
import { box,fmt } from '../shared/dom.js';
import { panelShell } from './panel.js';

// 返回图表实例，由应用层统一 dispose，避免每次配置更新积累 Canvas。
export function buildTrend(stage,config){const node=panelShell(stage,'L1',config.labels.trend,'trend');return buildTrendChart(box(node,'div',{x:10,y:55,w:438,h:199,cls:'chart'}),config);}
export function buildTravel(stage,config){
  const node=panelShell(stage,'L2',config.labels.travel,'pie');
  const chart=buildDonutChart(box(node,'div',{x:20,y:58,w:223,h:183,cls:'chart'}),config.travel);
  box(node,'div',{x:66,y:127,w:130,h:56,cls:'donut-centre-text',text:config.labels.travelCenter});
  const step=175/config.travel.length;
  config.travel.forEach((row,i)=>{
    const y=66+i*step;
    if(config.travel.length>3){
      box(node,'div',{x:259,y:y+4,w:21,h:21,cls:'lg-icon',html:icons[row.icon]||icons.car});
      box(node,'div',{x:287,y:y+4,w:88,h:22,cls:'compact-travel-name',text:row.name});
      const value=box(node,'div',{x:374,y:y+4,w:68,h:22,cls:'compact-travel-value',text:fmt(row.value)+'%'});value.style.color=row.color;return;
    }
    box(node,'div',{x:268,y:y+7,w:28,h:30,cls:'lg-icon',html:icons[row.icon]||icons.car});
    box(node,'div',{x:319,y,w:127,h:20,cls:'lg-name',text:row.name});
    const value=box(node,'div',{x:319,y:y+23,w:127,h:25,cls:'lg-value',text:fmt(row.value)+'%'});value.style.color=row.color;
  });
  return chart;
}

export function buildDemographics(stage,config){
  const charts=[];
  const node=panelShell(stage,'R3',config.labels.demographics,'people'),rows=config.demographics.gender;
  box(node,'div',{x:24,y:62,w:100,h:20,cls:'demo-caption',text:config.labels.gender});
  rows.forEach((row,index)=>{const item=box(node,'div',{x:index?310:133,y:68,w:120,h:26,cls:'demo-gender-value',text:row.name+' '+fmt(row.value)+'%'});item.style.color=row.color;});
  charts.push(buildGenderRing(box(node,'div',{x:241,y:52,w:58,h:58,cls:'chart'}),rows));
  box(node,'div',{x:24,y:109,w:100,h:20,cls:'demo-caption',text:config.labels.age});
  charts.push(buildAgeChart(box(node,'div',{x:7,y:123,w:446,h:98,cls:'chart'}),config.demographics.ages));
  return charts;
}
