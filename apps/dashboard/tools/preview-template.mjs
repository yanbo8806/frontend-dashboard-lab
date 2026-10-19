// 读取最终 XLSX，以实际单元格内容生成浏览器预览；不是原生 Excel 渲染。
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ExcelJS from 'exceljs';
import {launchBrowser} from '../../../packages/img2code/src/commands/shot.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(path.join(root,'outputs/xianyang-config/咸阳文旅配置模板.xlsx'));
const sheets=workbook.worksheets.map(sheet=>({name:sheet.name,rows:sheet.getSheetValues().slice(1).map(row=>row.slice(1))}));
const {browser}=await launchBrowser();
try{const page=await browser.newPage({viewport:{width:1650,height:1100}});
  await page.setContent('<html lang="zh-CN"><head><style>body{font:14px Arial,Microsoft YaHei,sans-serif;background:#f4f7f9;color:#12334a;margin:28px}h1{font-size:23px}h2{font-size:17px;margin:14px 0}section{background:white;margin:18px 0;padding:18px;border-top:3px solid #32647b}table{border-collapse:collapse;width:100%;table-layout:fixed}th{background:#123751;color:white;padding:10px;text-align:left}td{border-bottom:1px solid #e0e7eb;padding:8px;overflow-wrap:anywhere;vertical-align:top}p{color:#667f91}td:first-child{font-family:Consolas,Microsoft YaHei,sans-serif}small{color:#8aa0af}</style></head><body><h1>咸阳文旅配置模板 · 内容与表头检查</h1><p>从最终 XLSX 回读。浏览器表格预览，不代表 Excel 原生排版。</p><main></main></body></html>');
  await page.evaluate(sheets=>{const main=document.querySelector('main');for(const sheet of sheets){const columns=sheet.rows[0].length;for(let start=0;start<columns;start+=5){const section=document.createElement('section');const title=document.createElement('h2');title.textContent=sheet.name+(columns>5?' · 第 '+(start+1)+'–'+Math.min(start+5,columns)+' 列':'');section.append(title);const table=document.createElement('table');sheet.rows.slice(0,7).forEach((row,index)=>{const tr=document.createElement('tr');for(let i=start;i<Math.min(start+5,columns);i++){const cell=document.createElement(index?'td':'th');cell.textContent=String(row[i]??'');tr.append(cell);}table.append(tr);});section.append(table);main.append(section);}}},sheets);
  await fs.mkdir(path.join(root,'out/app/template-preview'),{recursive:true});
  const sections=await page.locator('section').all();for(let i=0;i<sections.length;i++)await sections[i].screenshot({path:path.join(root,'out/app/template-preview',String(i+1).padStart(2,'0')+'.png')});
  await fs.writeFile(path.join(root,'out/app/template-preview/summary.json'),JSON.stringify({sheets:sheets.map(sheet=>({name:sheet.name,rows:sheet.rows.length,columns:sheet.rows[0].length})),previews:sections.length,nativeExcel:false},null,2));
  console.log(`${sheets.length} 个工作表、${sections.length} 张分组预览已生成。`);
}finally{await browser.close();}
