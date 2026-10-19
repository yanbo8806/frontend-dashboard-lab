// DOM 工具只负责创建元素；外部文本始终走 textContent，html 只接收内置 SVG。
export function box(parent,tag,{x=0,y=0,w,h,cls='',text='',html=''}={}){
  const node=document.createElement(tag);node.className=cls;
  Object.assign(node.style,{position:'absolute',left:x+'px',top:y+'px'});
  if(w!==undefined)node.style.width=w+'px';if(h!==undefined)node.style.height=h+'px';
  if(text!==undefined)node.textContent=text;
  // 仅允许内部 SVG 模板经过 html 参数；所有外部配置文本一律 textContent。
  if(html)node.innerHTML=html;
  parent.append(node);return node;
}
export const fmt=value=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value);
export function image(parent,source,name,rect,position='50% 50%'){
  const img=box(parent,'img',{...rect,cls:rect.cls||'content-image'});img.alt=name;img.referrerPolicy='no-referrer';
  img.style.objectPosition=position;img.decoding='async';
  const missing=()=>{img.hidden=true;const note=document.createElement('span');note.className='image-missing';note.textContent='图片未配置或加载失败';parent.append(note);};
  img.addEventListener('error',missing,{once:true});if(source)img.src=source;else missing();return img;
}
export function button(parent,label,action,options){const node=box(parent,'button',{...options,text:label});node.type='button';node.addEventListener('click',action);return node;}
export function empty(parent,message){box(parent,'p',{x:20,y:88,w:418,h:60,cls:'empty-state',text:message});}
