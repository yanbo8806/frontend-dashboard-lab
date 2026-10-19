import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readSavedConfig,saveConfig,STORAGE_KEY,PREVIOUS_KEY} from '../src/config/store.js';
const config=JSON.parse(fs.readFileSync(new URL('../public/config/dashboard.json',import.meta.url),'utf8'));
function memory(){const data=new Map();return{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};}
test('本地保存、读取、上一版本备份',()=>{
  const storage=memory();saveConfig(storage,config);
  saveConfig(storage,{...config,meta:{...config.meta,title:'下一版'}});
  assert.equal(readSavedConfig(storage,config).config.meta.title,'下一版');
  assert.equal(JSON.parse(storage.getItem(PREVIOUS_KEY)).meta.title,config.meta.title);
});
test('损坏本地数据回退且不删除原始数据',()=>{
  const storage=memory();storage.setItem(STORAGE_KEY,'{invalid');
  const result=readSavedConfig(storage,config);assert.match(result.warning,/无法读取/);
  assert.equal(result.config.meta.title,config.meta.title);assert.equal(storage.getItem(STORAGE_KEY),'{invalid');
});
test('存储空间不足不能返回保存成功',()=>{
  const storage={getItem:()=>null,setItem:()=>{throw new Error('quota exceeded');}};
  assert.throws(()=>saveConfig(storage,config),/quota/);
});
