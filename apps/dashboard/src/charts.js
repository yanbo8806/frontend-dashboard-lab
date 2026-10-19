// 图表始终读取同一配置；图例、数值和圆弧共用数据，不再保留截图估算角度。
import * as echarts from 'echarts/core';
import { LineChart, PieChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([LineChart,PieChart,BarChart,GridComponent,TooltipComponent,LegendComponent,CanvasRenderer]);
const FONT='Arial, "Microsoft YaHei", sans-serif';
const mount=el=>echarts.init(el,null,{renderer:'canvas',devicePixelRatio:Math.min(window.devicePixelRatio||1,2)});
const tooltip={trigger:'axis',renderMode:'richText',backgroundColor:'#00234bee',borderColor:'#02ccee',textStyle:{color:'#edfaff',fontFamily:FONT,fontSize:12}};
const axisLabel={color:'#e8f1fa',fontSize:12,fontFamily:FONT};
const splitLine={show:true,lineStyle:{color:'#175072',type:'dotted'}};
export function buildTrendChart(el,config){
  const chart=mount(el),trend=config.trend;
  chart.setOption({animation:false,tooltip,legend:{top:3,right:20,data:trend.series.map(item=>item.name),textStyle:{color:'#e9f5ff',fontSize:13},itemWidth:16,itemHeight:8},grid:{left:54,right:22,top:51,bottom:31},
    xAxis:{type:'category',data:trend.categories,boundaryGap:false,axisLine:{lineStyle:{color:'#96bbcc'}},axisTick:{show:false},axisLabel:{...axisLabel,hideOverlap:true},splitLine},
    yAxis:{type:'value',min:0,max:trend.yMax||null,splitNumber:4,name:config.labels.trendUnit,nameLocation:'end',nameGap:13,nameTextStyle:{...axisLabel,align:'left',padding:[0,0,0,-30]},axisLabel,splitLine},
    series:trend.series.map(series=>({name:series.name,type:'line',data:series.values,smooth:.15,symbol:'circle',symbolSize:6,lineStyle:{width:2,color:series.color,shadowBlur:8,shadowColor:series.color},itemStyle:{color:series.color}})),
  });return chart;
}
export function buildDonutChart(el,rows){
  const chart=mount(el);chart.setOption({animation:false,tooltip:{...tooltip,trigger:'item'},series:[{type:'pie',radius:['60%','82%'],center:['50%','50%'],label:{show:false},labelLine:{show:false},data:rows.map(row=>({name:row.name,value:row.value,itemStyle:{color:row.color}}))}]});return chart;
}
export function buildAgeChart(el,rows){
  const chart=mount(el);chart.setOption({animation:false,tooltip,grid:{left:40,right:14,top:25,bottom:25},
    xAxis:{type:'category',data:rows.map(row=>row.name),axisTick:{show:false},axisLine:{lineStyle:{color:'#95afbc'}},axisLabel:{...axisLabel,fontSize:11,hideOverlap:true}},
    yAxis:{type:'value',min:0,splitNumber:3,axisLabel:{...axisLabel,fontSize:10,formatter:'{value}%'},splitLine},
    series:[{type:'bar',data:rows.map(row=>row.value),barMaxWidth:32,label:{show:true,position:'top',color:'#f8fcff',fontSize:11,formatter:'{c}%'},itemStyle:{borderRadius:[2,2,0,0],color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#08e9f4'},{offset:1,color:'#0392cc'}])}}],
  });return chart;
}
export function buildGenderRing(el,rows){
  const chart=mount(el);chart.setOption({animation:false,tooltip:{...tooltip,trigger:'item'},series:[{type:'pie',radius:['52%','87%'],label:{show:false},data:rows.map(row=>({name:row.name,value:row.value,itemStyle:{color:row.color}}))}]});return chart;
}
