import ExcelJS from 'exceljs';
import { TABLES, SCALAR_GROUPS } from './fields.js';
import { ConfigError, getPath, setPath, validateConfig } from './schema.js';
export const MAX_EXCEL_BYTES = 5 * 1024 * 1024;

/** 先检查 ZIP 中央目录的声明体积，避免直接解压超大文件拖死页面。 */
export function checkXlsxArchive(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength > MAX_EXCEL_BYTES) throw new ConfigError(['Excel 文件超过 5MB']);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new ConfigError(['不是有效的 .xlsx 文件；旧版 .xls 请先另存为 .xlsx']);
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true), total = 0;
  if (count > 600) throw new ConfigError(['Excel 内部文件数量过多']);
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new ConfigError(['Excel ZIP 目录损坏']);
    total += view.getUint32(offset + 24, true);
    if (total > 32 * 1024 * 1024) throw new ConfigError(['Excel 解压后超过 32MB，请去除多余样式和嵌入对象']);
    if (view.getUint16(offset + 8, true) & 1) throw new ConfigError(['不支持加密 Excel，请解除密码后导入']);
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
}

function cellValue(cell, path) {
  let value = cell.value;
  if (value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) {
    if (!Object.hasOwn(value, 'result') || value.result === undefined || value.result === null) throw new ConfigError([`${path}：公式没有缓存结果，请在 Excel 中计算并保存后再导入`]);
    value = value.result;
  }
  if (value instanceof Date) return value.toISOString();
  if (value?.error) throw new ConfigError([`${path}：Excel 错误 ${value.error}`]);
  if (value?.richText) return value.richText.map(item => item.text).join('');
  if (value?.text !== undefined) return value.text;
  if (typeof value === 'object' && value !== null) throw new ConfigError([`${path}：不支持的单元格类型`]);
  return value ?? '';
}

function convert(cell, column, path) {
  const value = cellValue(cell, path);
  if (column.type === 'number') {
    if (value === '' || typeof value === 'boolean') throw new ConfigError([`${path}：数字不能为空`]);
    const percentText = typeof value === 'string' && value.trim().endsWith('%');
    const normalized = typeof value === 'string' ? value.trim().replace(/,/g, '').replace(/%$/, '') : value;
    let number = Number(normalized);
    if (!Number.isFinite(number)) throw new ConfigError([`${path}：不是有效数字`]);
    // 42.3、"42.3%"、原生百分比单元格 0.423 都归一为 42.3。
    if (column.percent && !percentText && typeof value === 'number' && /%/.test(cell.numFmt || '')) number *= 100;
    if (percentText && !column.percent) throw new ConfigError([`${path}：此列不是占比，请输入普通数字`]);
    return Number(number.toPrecision(14));
  }
  if (column.type === 'boolean') {
    if ([true, 1, 'true', 'TRUE', '是', '启用'].includes(value)) return true;
    if ([false, 0, 'false', 'FALSE', '否', '禁用'].includes(value)) return false;
    throw new ConfigError([`${path}：布尔值请输入 true / false 或 是 / 否`]);
  }
  return String(value).trim();
}

function headers(sheet, columns) {
  if (sheet.rowCount > 1000 || sheet.columnCount > 30) throw new ConfigError([`${sheet.name}：最多 1000 行、30 列，请移除多余格式`]);
  const result = new Map();
  sheet.getRow(1).eachCell((cell, index) => {
    const value = String(cellValue(cell, `${sheet.name}!${cell.address}`)).trim();
    const column = columns.find(item => item.label === value || item.key === value);
    if (!column) throw new ConfigError([`${sheet.name}!${cell.address}：未知列 ${value}`]);
    if (result.has(column.key)) throw new ConfigError([`${sheet.name}：重复列 ${value}`]);
    result.set(column.key, index);
  });
  for (const column of columns) if (!result.has(column.key)) throw new ConfigError([`${sheet.name}：缺少列 ${column.label}`]);
  return result;
}

function tableRows(sheet, columns) {
  const mapping = headers(sheet, columns), rows = [];
  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    if ([...mapping.values()].every(column => [null, undefined, ''].includes(row.getCell(column).value))) continue;
    rows.push(Object.fromEntries(columns.map(column => {
      const cell = row.getCell(mapping.get(column.key));
      return [column.key, convert(cell, column, `${sheet.name}!${cell.address}`)];
    })));
  }
  return rows;
}

export async function importWorkbook(buffer, base) {
  checkXlsxArchive(buffer);
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); } catch (error) { throw new ConfigError([`Excel 解析失败：${error.message}`]); }
  const config = structuredClone(base), changed = [];
  const known = new Set(['使用说明', '趋势', '图片资源', ...SCALAR_GROUPS.map(item => item.name), ...TABLES.map(item => item.name)]);
  for (const sheet of workbook.worksheets) if (!known.has(sheet.name)) throw new ConfigError([`未知工作表“${sheet.name}”；请使用下载的模板，防止数据被静默忽略`]);
  for (const group of SCALAR_GROUPS) {
    const sheet = workbook.getWorksheet(group.name);
    if (!sheet) continue;
    const mapping = headers(sheet, [{key:'field',label:'字段'}, {key:'value',label:'值'}, {key:'description',label:'说明'}]);
    const seen = new Set();
    for (let row = 2; row <= sheet.rowCount; row++) {
      const key = String(cellValue(sheet.getRow(row).getCell(mapping.get('field')), `${sheet.name}!A${row}`)).trim();
      if (!key) continue;
      const column = group.fields.find(item => item.key === key);
      if (!column) throw new ConfigError([`${sheet.name}!A${row}：未知字段 ${key}`]);
      if (seen.has(key)) throw new ConfigError([`${sheet.name}!A${row}：重复字段 ${key}`]);
      seen.add(key);
      const cell = sheet.getRow(row).getCell(mapping.get('value'));
      setPath(config, key, convert(cell, column, `${sheet.name}!${cell.address}`));
    }
    changed.push(group.name);
  }
  for (const table of TABLES) {
    const sheet = workbook.getWorksheet(table.name);
    if (!sheet) continue;
    setPath(config, table.key, tableRows(sheet, table.columns));
    changed.push(`${table.name} ${getPath(config, table.key).length} 条`);
  }
  const trend = workbook.getWorksheet('趋势');
  if (trend) {
    const rows = tableRows(trend, [{key:'date',label:'日期'}, {key:'name',label:'系列'}, {key:'value',label:'数值',type:'number'}, {key:'color',label:'颜色'}]);
    const categories = [], series = new Map(), pairs = new Set();
    for (const row of rows) {
      const pair = JSON.stringify([row.date, row.name]);
      if (pairs.has(pair)) throw new ConfigError([`趋势：${row.date} / ${row.name} 重复`]);
      pairs.add(pair);
      if (!categories.includes(row.date)) categories.push(row.date);
      if (!series.has(row.name)) series.set(row.name, { name: row.name, color: row.color, values: new Map() });
      if (series.get(row.name).color !== row.color) throw new ConfigError([`趋势：系列 ${row.name} 的颜色不一致`]);
      series.get(row.name).values.set(row.date, row.value);
    }
    config.trend.categories = categories;
    config.trend.series = [...series.values()].map(item => ({ ...item, values: categories.map(date => {
      if (!item.values.has(date)) throw new ConfigError([`趋势：${item.name} 缺少 ${date} 的数值`]);
      return item.values.get(date);
    }) }));
    changed.push(`趋势 ${categories.length} 个时间点`);
  }
  if (!changed.length) throw new ConfigError(['没有可导入的数据工作表']);
  // Excel 单元格上限 32767 字符：上传的内嵌图片分块存入资源表，引用处保持可读 ID。
  const resources = new Map(), media = workbook.getWorksheet('图片资源');
  if (media) {
    const parts = tableRows(media, [{key:'id',label:'ID'}, {key:'index',label:'分段',type:'number'}, {key:'content',label:'内容'}]);
    for (const part of parts) {
      if (!/^image-[0-9]+$/.test(part.id) || !Number.isInteger(part.index) || part.index < 0 || part.index > 32 || part.content.length > 30000) throw new ConfigError(['图片资源：ID、分段或长度不合法']);
      if (!resources.has(part.id)) resources.set(part.id, new Map());
      if (resources.get(part.id).has(part.index)) throw new ConfigError([`图片资源：${part.id} 分段 ${part.index} 重复`]);
      resources.get(part.id).set(part.index, part.content);
    }
  }
  for (const row of [...config.attractions, ...config.origins]) {
    if (!row.image.startsWith('@image:')) continue;
    const id = row.image.slice(7), chunks = resources.get(id);
    if (!chunks) throw new ConfigError([`${row.id}：缺少图片资源 ${id}`]);
    const content = [];
    for (let i=0;i<chunks.size;i++) { if (!chunks.has(i)) throw new ConfigError([`图片资源：${id} 缺少分段 ${i}`]); content.push(chunks.get(i)); }
    row.image = content.join('');
  }
  return { config: validateConfig(config), summary: changed };
}

function styleSheet(sheet, widths) {
  sheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
  sheet.getRow(1).height = 28;
  sheet.getRow(1).font = { name: 'Microsoft YaHei', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123751' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  widths.forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
  for (let row = 2; row <= sheet.rowCount; row++) {
    sheet.getRow(row).height = 24;
    sheet.getRow(row).eachCell(cell => {
      cell.font = { name: 'Microsoft YaHei', size: 11, color: { argb: 'FF174A79' } };
      cell.alignment = { vertical: 'middle', horizontal: typeof cell.value === 'number' ? 'right' : 'left', wrapText: false };
      if (typeof cell.value === 'number') cell.numFmt = '0.########';
    });
  }
}

/** 模板与导出都由当前完整配置生成，不输出 Token，不偷偷增加公式。 */
export async function exportWorkbook(input) {
  const config = validateConfig(input), workbook = new ExcelJS.Workbook();
  const mediaRows = [];
  let imageIndex = 0;
  for (const row of [...config.attractions, ...config.origins]) {
    if (!row.image.startsWith('data:image/')) continue;
    const id = `image-${imageIndex++}`, image = row.image;
    for (let offset=0;offset<image.length;offset+=30000) mediaRows.push([id, offset/30000, image.slice(offset,offset+30000)]);
    row.image = '@image:' + id;
  }
  workbook.creator = '文旅大屏';
  const help = workbook.addWorksheet('使用说明');
  help.addRows([['咸阳文旅大屏数据模板', '说明'],
    ['数据性质', config.meta.dataLabel],
    ['导入方法', '第一行是表头；仅保留要更新的工作表即可。缺失工作表沿用当前配置。'],
    ['替换规则', '存在的数据表整组替换；只有表头表示清空。基础、地图、API 设置按字段更新。'],
    ['百分比', '普通数值 42.3、文本 42.3% 或 Excel 原生百分比均支持。'],
    ['公式', '只读取 Excel 保存的缓存结果，不在网页执行公式；请计算并保存后导入。'],
    ['景点与飞线', '景点 ID 唯一；飞线起终点为景点 ID，hub 为地图汇聚点。'],
    ['坐标', '明确填写坐标系；默认景点 WGS84、DataV 边界 GCJ02。位置为参考，非实测。'],
    ['图片', '填写相对路径或 http(s) URL；内嵌图片请在网页上传。发布前确认图片授权。'],
    ['图片资源', '上传图片自动分段保存并关联到 @image: 引用，导入时还原，请勿单独删除资源表。'],
    ['示例数据', '游客量、热度和占比是可替换的演示数据，不是真实运营统计。'],
    ['保存', '导入仅生成预览；检查后点击保存并应用。配置只保存在本浏览器。'],
    ['API', '接口仅支持 GET JSON；Token 只在会话内存，不写入此文件。'],
    ['文件限制', '支持 .xlsx，最大 5MB；旧版 .xls 请先另存为 .xlsx。'],
  ]);
  styleSheet(help, [25, 100]);
  for (const group of SCALAR_GROUPS) {
    const sheet = workbook.addWorksheet(group.name);
    sheet.addRow(['字段', '值', '说明']);
    for (const column of group.fields) sheet.addRow([column.key, getPath(config, column.key), column.label]);
    styleSheet(sheet, [32, 82, 40]);
  }
  for (const table of TABLES) {
    const sheet = workbook.addWorksheet(table.name);
    sheet.addRow(table.columns.map(item => item.label));
    for (const row of getPath(config, table.key)) sheet.addRow(table.columns.map(column => row[column.key]));
    styleSheet(sheet, table.columns.map(column => ['image', 'description', 'imageSource', 'imageCredit', 'coordinateNote'].includes(column.key) ? 64 : column.type === 'number' ? 16 : 24));
    table.columns.forEach((column, index) => {
      if (column.type === 'boolean') for (let row = 2; row <= Math.max(sheet.rowCount, 2); row++) sheet.getCell(row, index + 1).dataValidation = { type:'list', allowBlank:false, formulae:['"true,false"'] };
    });
  }
  const trend = workbook.addWorksheet('趋势');
  trend.addRow(['日期', '系列', '数值', '颜色']);
  config.trend.categories.forEach((date, index) => config.trend.series.forEach(series => trend.addRow([date, series.name, series.values[index], series.color])));
  styleSheet(trend, [22, 22, 18, 22]);
  if (mediaRows.length) {
    const sheet = workbook.addWorksheet('图片资源');
    sheet.addRow(['ID','分段','内容']);sheet.addRows(mediaRows);styleSheet(sheet,[20,12,100]);
  }
  return workbook.xlsx.writeBuffer();
}
