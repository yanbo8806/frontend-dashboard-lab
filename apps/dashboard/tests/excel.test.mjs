import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { exportWorkbook, importWorkbook, checkXlsxArchive } from '../src/config/excel.js';
const config = JSON.parse(fs.readFileSync(new URL('../public/config/dashboard.json', import.meta.url), 'utf8'));
test('所有配置字段 Excel 往返一致，包括 API、图片、飞线', async () => {
  const result = await importWorkbook(await exportWorkbook(config), config);
  assert.deepEqual(result.config, config);
});
test('Excel 原生百分比与数字零正确处理', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('年龄');
  sheet.addRows([['名称','占比(%)'], ['一组',0], ['二组',0.423], ['三组','57.7%']]);
  sheet.getCell('B3').numFmt = '0.0%';
  const result = await importWorkbook(await workbook.xlsx.writeBuffer(), config);
  assert.deepEqual(result.config.demographics.ages.map(item=>item.value), [0,42.3,57.7]);
});
test('数字空单元格拒绝，错误不带入现有数据', async () => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('年龄');
  sheet.addRows([['名称','占比(%)'],['一组',null]]);
  await assert.rejects(importWorkbook(await workbook.xlsx.writeBuffer(), config), /B2.*不能为空/);
  assert.equal(config.demographics.ages.length,6);
});
test('公式缓存结果读取；缺失缓存结果报错', async () => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('年龄');
  sheet.addRows([['名称','占比(%)'],['一组',{formula:'50+50',result:100}]]);
  assert.equal((await importWorkbook(await workbook.xlsx.writeBuffer(),config)).config.demographics.ages[0].value,100);
  sheet.getCell('B2').value = {formula:'50+50'};
  await assert.rejects(importWorkbook(await workbook.xlsx.writeBuffer(),config), /缓存结果/);
});
test('拒绝表名、列名拼错和重复列', async () => {
  for (const [name, row] of [['年令',['名称','占比(%)']], ['年龄',['名称','比例']], ['年龄',['名称','名称']]]) {
    const workbook = new ExcelJS.Workbook(); workbook.addWorksheet(name).addRow(row);
    await assert.rejects(importWorkbook(await workbook.xlsx.writeBuffer(),config), /未知|重复/);
  }
});
test('拒绝损坏 ZIP 和超体积文件', () => {
  assert.throws(()=>checkXlsxArchive(new Uint8Array(10)), /有效/);
  assert.throws(()=>checkXlsxArchive(new Uint8Array(6*1024*1024)), /5MB/);
});
test('大于单元格上限的上传图片通过资源表无损往返', async () => {
  const updated=structuredClone(config);
  updated.attractions[0].image='data:image/jpeg;base64,'+'A'.repeat(70000);
  const bytes=await exportWorkbook(updated);
  const roundtrip=await importWorkbook(bytes,config);
  assert.equal(roundtrip.config.attractions[0].image,updated.attractions[0].image);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);
  workbook.getWorksheet('图片资源').getCell('B3').value=8;
  await assert.rejects(importWorkbook(await workbook.xlsx.writeBuffer(),config),/缺少分段/);
});
