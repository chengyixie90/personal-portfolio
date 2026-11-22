'use strict';
const $ = (selector, from=document) => from.querySelector(selector);
const $$ = (selector, from=document) => [...from.querySelectorAll(selector)];
const area = $('#editor');
const pageSwitch = $('#page-switch');
const picker = $('#picker');
const preview = $('#preview');
const frame = $('iframe',preview);
const canvasStatus = $('#canvas-status');
const workspace = $('.workspace');
const status = $('#save-status');
const make = (tag,text,attrs={}) => {
  const node=document.createElement(tag);
  if(text!==null)node.textContent=text;
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
  return node;
};
const push = (parent,...nodes) => {
  parent.append(...nodes);
  return parent;
};
const button = (label,action,className='') => {
  const b=make('button',label,{type:'button',class:className});
  b.addEventListener('click',action);
  return b;
};
const actions = (...nodes) => push(make('div',null,{class:'actions'}),...nodes);
const cell = (className, ...nodes) => push(make('div',null,{class:className}),...nodes);
const para = (text,className='subtle') => make('p',text,{class:className});
const names={visible:'展示',hidden:'隐藏',archived:'已归档'};
const formatBytes = n => n>=1024*1024 ? (n/1024/1024).toFixed(1)+' MB' : Math.max(1,Math.round(n/1024))+' KB';
const formatDate = value => value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'初始版本';
let app, model, selected, tab='project', openBlocks=new Set();
let dirty=0, persisted=0, timer, pending, conflict=false, uploading=false, choice, mediaKind;
let syncEnabled=true, scrollDriver="canvas", inspectorScrollFrame=0;
let dragged=null, activeBlock=null, canvasMode='edit', canvasScroll=0, canvasJump=false;
let draggedProject=null;
let canvasTimer, canvasRequest, canvasContext, canvasReady=false, canvasNeedsRefresh=false, inputBindings=new WeakMap();

const panelScroll=createPortfolioScroller(
  ()=>area.scrollTop,
  y=>area.scrollTo({top:y,behavior:'instant'}),
  ()=>Math.max(0,area.scrollHeight-area.clientHeight)
);
function revealInspector(id) {
  const card=document.getElementById(id);
  if(!card || !matchMedia('(min-width:851px)').matches)return;
  const top=card.getBoundingClientRect().top-area.getBoundingClientRect().top+area.scrollTop;
  panelScroll.to(top-Math.min(area.clientHeight*.18,150));
}
function highlightBlock(id) {
  $$('.block-card',area).forEach(node=>node.toggleAttribute('data-active',node.id===id));
}
function patchCanvasText(obj,key) {
  if(canvasNeedsRefresh)return false;
  if(canvasReady && canvasMode==='edit' && canvasContext==='home') {
    const binding=homeCanvasBinding(obj,key);
    if(!binding)return false;
    canvasMessage('patch-text',{...binding,value:obj[key]});
    return true;
  }
  if(!canvasReady || canvasMode!=='edit' || canvasContext!==current()?.id)return false;
  const block=current().blocks.find(b=>(b.type==='legacy'&&b.edits===obj)||b===obj);
  if(!block)return false;
  const field=block.type==='legacy'?app.originals[current().legacy][block.source].fields.find(f=>f.id===key&&f.kind==='text'):
    ['title','text','caption'].includes(key);
  if(!field)return false;
  canvasMessage('patch-text',{id:block.id,field:key,value:obj[key]});
  return true;
}
function canvasMessage(type, data={}) {
  frame.contentWindow?.postMessage({channel:'portfolio-editor',type,...data},location.origin);
}
function updateCanvasNotice(text,error=false) {
  canvasStatus.textContent=text;
  canvasStatus.dataset.error=String(error);
}
function scheduleCanvas(delay=140) {
  canvasNeedsRefresh=true;
  clearTimeout(canvasTimer);
  canvasRequest?.abort();
  canvasTimer=setTimeout(refreshCanvas,delay);
}
async function refreshCanvas() {
  if(!model)return;
  const project=tab==='project'?current():null;
  const key=project?.id||'home';
  if(key!==canvasContext)canvasScroll=0;
  const req=new AbortController();
  canvasRequest=req;
  try {
    const res=await fetch('/api/editor/canvas',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({state:model,projectId:project?.id??null,animate:canvasMode==='animate'}),signal:req.signal});
    if(!res.ok) {
      const error=await res.json().catch(()=>({}));
      throw new Error(error.message||'无法更新页面，请重试。');
    }
    const markup=await res.text();
    if(req.signal.aborted)return;
    canvasReady=false;
    canvasContext=key;
    frame.srcdoc=markup;
    $('#preview-title').textContent=project?.title || '作品集首页';
    updateCanvasNotice('');
  } catch(error) {
    if(error.name!=='AbortError')updateCanvasNotice(error.message,true);
  }
}
function selectBlock(id,{scroll=false,inspect=false}={}) {
  if(tab==='home'?!HOME_SECTIONS.includes(id):!current()?.blocks.some(block=>block.id===id))return;
  activeBlock=id;
  if(scroll)scrollDriver='inspector';
  canvasMessage('select',{id,jump:scroll});
  if(inspect) {
    openBlocks.clear();
    openBlocks.add(id);
    render();
    revealInspector(id);
  }
}
function canSyncScroll() {
  return syncEnabled && canvasMode==='edit' && ['project','home'].includes(tab) &&
    canvasReady && !workspace.classList.contains('inspector-closed') &&
    matchMedia('(min-width:851px)').matches;
}
function followCanvas(id,progress) {
  if(!canSyncScroll() || scrollDriver!=='canvas')return;
  if(tab==='home'?!HOME_SECTIONS.includes(id):!current()?.blocks.some(block=>block.id===id))return;
  if(area.contains(document.activeElement))return;
  if(activeBlock!==id) {
    activeBlock=id;
    highlightBlock(id);
    canvasMessage('select',{id,jump:false});
  }
  const card=document.getElementById(id);
  if(!card)return;
  const top=card.getBoundingClientRect().top-area.getBoundingClientRect().top+area.scrollTop;
  const travel=Math.max(0,card.offsetHeight-area.clientHeight*.65);
  panelScroll.to(Math.max(0,top-Math.min(area.clientHeight*.18,150)+Math.min(1,Math.max(0,progress))*travel));
}
for(const eventName of ['wheel','touchmove','pointerdown']) {
  area.addEventListener(eventName,()=>{scrollDriver='inspector';panelScroll.cancel();},{passive:true});
}
area.addEventListener('keydown',event=>{
  if(['PageDown','PageUp','Home','End','ArrowDown','ArrowUp',' '].includes(event.key)) {scrollDriver='inspector';panelScroll.cancel();}
});
area.addEventListener('scroll',()=>{
  if(!canSyncScroll() || scrollDriver!=='inspector' || inspectorScrollFrame)return;
  inspectorScrollFrame=requestAnimationFrame(()=>{
    inspectorScrollFrame=0;
    const cards=$$('.block-card',area);
    const line=area.getBoundingClientRect().top+Math.min(area.clientHeight*.18,150);
    const card=cards.find(node=>node.getBoundingClientRect().bottom>line);
    if(!card || card.getBoundingClientRect().top>line+area.clientHeight*.5)return;
    const rect=card.getBoundingClientRect();
    const travel=Math.max(0,rect.height-area.clientHeight*.65);
    const progress=travel>0?Math.min(1,Math.max(0,(line-rect.top)/travel)):0;
    activeBlock=card.id;
    $$('.block-card',area).forEach(node=>node.toggleAttribute('data-active',node===card));
    canvasMessage('sync-scroll',{id:card.id,progress});
  });
},{passive:true});
function findCanvasTarget(id,key) {
  if(canvasContext==='home') {
    if(Object.hasOwn(HOME_TEXT_FIELDS,key))return {obj:model.settings,key,kind:'text'};
    if(['portrait','resume'].includes(key))return {obj:model.settings,key,kind:key==='portrait'?'image':'file'};
    const match=key.match(/^(aboutRows|contacts)\.([a-z0-9-]+)\.(label|text|value)$/);
    if(!match)return null;
    ensureHomeLists();
    const row=model.settings[match[1]].find(item=>item.id===match[2]);
    if(row&&Object.hasOwn(row,match[3]))return {obj:row,key:match[3],kind:'text',max:match[3]==='label'?120:match[3]==='text'?4000:1000};
    return null;
  }
  const project=model.projects.find(p=>p.id===canvasContext);
  if(!project)return null;
  if(!id&&['project.title','project.summary'].includes(key))return {obj:project,key:key.slice(8),kind:'text'};
  const block=project.blocks.find(b=>b.id===id);
  if(!block)return null;
  if(block.type==='legacy') {
    const field=app.originals[project.legacy]?.[block.source]?.fields.find(x=>x.id===key);
    return field?{obj:block.edits,key,kind:field.kind,block}:null;
  }
  if(['title','text','caption'].includes(key))return {obj:block,key,kind:'text',block};
  if(key==='src')return {obj:block,key,kind:block.type==='video'?'video':block.type==='file'?'file':'image',block};
  if(key==='items.add')return {kind:'image',append:block.items,block};
  const item=key.match(/^items\.(\d+)$/);
  if(item&&block.items[Number(item[1])])return {obj:block.items[Number(item[1])],key:'src',kind:'image',block};
  return null;
}
addEventListener('message',event=>{
  const m=event.data;
  if(event.source!==frame.contentWindow||event.origin!==location.origin||m?.channel!=='portfolio-canvas')return;
  if(m.type==='ready') {
    canvasReady=true;
    canvasNeedsRefresh=false;
    canvasMessage('initialize',{mode:canvasMode,y:canvasScroll,id:activeBlock,jump:canvasJump});
    if(tab==='projects')canvasMessage('view-projects');
    canvasJump=false;
  }
  if(m.type==='driver')scrollDriver='canvas';
  if(m.type==='scroll'&&canvasReady) {
    canvasScroll=m.y;
    if(m.id)followCanvas(m.id,m.progress||0);
  }
  if(m.type==='select'&&m.id) {
    scrollDriver='canvas';
    if(m.id!==activeBlock)selectBlock(m.id,{inspect:true});
  }
  if(m.type==='text'&&typeof m.value==='string'&&typeof m.field==='string') {
    const target=findCanvasTarget(m.id,m.field);
    if(!target||target.kind!=='text')return;
    target.obj[target.key]=m.value.slice(0, target.max??(target.block?.type==='legacy'?10000 : target.key==='title'?120 : target.key==='summary'?1500 : 10000));
    const binding=inputBindings.get(target.obj)?.get(target.key);
    if(binding)binding.value=target.obj[target.key];
    changed({updateCanvas:false});
    if(target.obj===current()&&target.key==='title') {
      $('#preview-title').textContent=current().title;
      renderNavigation();
    }
  }
  if(m.type==='asset'&&typeof m.field==='string') {
    const target=findCanvasTarget(m.id,m.field);
    if(!target||target.kind==='text')return;
    openPicker(target.kind,asset=>{
      if(target.append)target.append.push({src:asset.url,alt:'',caption:''});
      else target.obj[target.key]=asset.url;
    });
  }
});

async function api(path,method='GET',body,type='application/json') {
  const res=await fetch('/api/editor'+path,{method,headers:body===undefined?{}:{'content-type':type},
    body:body===undefined?undefined:(type==='application/json'?JSON.stringify(body):body)});
  const payload=await res.json().catch(()=>({message:'没有收到预期的数据，请重试。'}));
  if(!res.ok) {
    const err=new Error(payload.message || '操作失败');
    err.status=res.status;
    throw err;
  }
  return payload;
}
function say(message,error=false) {
  status.textContent=message;
  status.dataset.error=String(error);
}
function changed({updateCanvas=true}={}) {
  dirty++;
  say('有更改待保存');
  if(updateCanvas||canvasNeedsRefresh)scheduleCanvas();
  else {
    clearTimeout(canvasTimer);
    canvasRequest?.abort();
  }
  clearTimeout(timer);
  if(!conflict)timer=setTimeout(()=>save().catch(()=>{}),750);
}
async function save() {
  clearTimeout(timer);
  if(conflict)throw new Error('另一个窗口已更新草稿。请先导出当前编辑，再重新加载。');
  if(pending)await pending;
  if(dirty===persisted)return;
  const generation=dirty;
  const body={state:structuredClone(model),revision:app.draft.revision};
  say('正在保存草稿…');
  pending=api('/draft','PUT',body).then(data=>{
    app.draft.revision=data.revision;
    persisted=generation;
    say(dirty===persisted?'草稿已保存':'有更改待保存');
  }).catch(error=>{
    if(error.status===409)conflict=true;
    say(error.message,true);
    throw error;
  }).finally(()=>{pending=null;});
  await pending;
  if(dirty!==persisted)return save();
}
function itemTitle(project,block) {
  return block.type==='legacy'?(app.originals[project.legacy]?.[block.source]?.label || '原有章节'):(block.title||BLOCKS[block.type]);
}
function current() {
  return model.projects.find(project=>project.id===selected);
}
function selectProject(project) {
  tab='project';
  selected=project?.id;
  activeBlock=null;
  canvasJump=false;
  openBlocks.clear();
  render();
  scheduleCanvas(0);
}
function ensureUnsaved(event) {
  if(dirty!==persisted||uploading){event.preventDefault();event.returnValue='';}
}
addEventListener('beforeunload',ensureUnsaved);
function field(label,obj,key,options={}) {
  const {list:values, textArea=false, max, fallback='', disabled=false, update=()=>{}, inputType='text'}=options;
  const kind=values?'select':textArea?'textarea':'input';
  const input=make(kind,null);
  if(kind==='input')input.type=inputType;
  if(values)for(const [v,t] of Object.entries(values))input.append(make('option',t,{value:v}));
  if(max)input.maxLength=max;
  input.value=obj[key]??fallback;
  input.disabled=disabled;
  if(!inputBindings.has(obj))inputBindings.set(obj,new Map());
  inputBindings.get(obj).set(key,input);
  input.addEventListener(kind==='select'?'change':'input',()=>{
    obj[key]=input.value;
    changed({updateCanvas:!patchCanvasText(obj,key)});
    update();
  });
  return push(make('label',label,{class:'field'}),input);
}
function checkbox(label,obj,key) {
  const input=make('input',null,{type:'checkbox',style:'width:auto'});
  input.checked=obj[key];
  input.addEventListener('change',()=>{obj[key]=input.checked;changed();});
  return push(make('label',null,{class:'actions'}),input,make('span',label));
}
function move(array,from,to) {
  if(to<0||to>=array.length||to===from)return;
  const [item]=array.splice(from,1);
  array.splice(to,0,item);
  changed();
  render();
}
function controls(array,index,noun) {
  const up=button('上移',()=>move(array,index,index-1),'compact');
  const down=button('下移',()=>move(array,index,index+1),'compact');
  up.disabled=index===0;
  down.disabled=index===array.length-1;
  up.setAttribute('aria-label','上移'+noun);
  down.setAttribute('aria-label','下移'+noun);
  return [up,down];
}
function renderNavigation() {
  const projects=make('optgroup',null,{label:'项目'});
  for(const project of model.projects) {
    const label=(project.title||'未命名')+(project.state==='visible'?'':' · '+names[project.state]);
    projects.append(make('option',label,{value:'project:'+project.id}));
  }
  const tools=push(make('optgroup',null,{label:'管理'}),
    make('option','项目排序',{value:'projects'}),
    make('option','素材库',{value:'media'}),
    make('option','发布记录',{value:'history'}));
  pageSwitch.replaceChildren(make('option','首页设置',{value:'home'}),projects,tools);
  pageSwitch.value=tab==='project'&&current()?'project:'+selected:tab==='project'?'home':tab;
  pageSwitch.disabled=false;
}
function addProject() {
  const project=makeProject();
  model.projects.push(project);
  changed();
  selectProject(project);
  $('input',area)?.focus();
}
function copyId(original) {
  const slugBase=original.slug.slice(0,55)+'-copy';
  let slug=slugBase,n=2;
  while(model.projects.some(p=>p.slug===slug))slug=slugBase+'-'+n++;
  const copied=structuredClone(original);
  Object.assign(copied,{id:makeId(),slug,title:(original.title+'（副本）').slice(0,120),state:'hidden'});
  return copied;
}
function projectPage(project) {
  const index=model.projects.indexOf(project);
  const title=make('h2',project.title);
  const rename=()=>{title.textContent=project.title||'未命名';renderNavigation();};
  const head=cell('editor-head',cell('',title,para('编辑项目资料、内容区块和显示顺序。')),
    actions(...controls(model.projects,index,'项目'),button('复制项目',()=>{
      const copied=copyId(project);
      model.projects.splice(index+1,0,copied);
      changed();selectProject(copied);
    })));
  const settings=cell('panel form-grid',field('项目名称',project,'title',{max:120,update:rename}),
    field('分类',project,'category',{list:CATEGORIES}),
    field('项目网址',project,'slug',{max:70,disabled:Object.hasOwn(app.originals,project.id)}),
    field('展示状态',project,'state',{list:names,update:renderNavigation}));
  const cover=resource('项目封面',project,'cover','image');
  const summary=field('列表简介',project,'summary',{textArea:true,max:1500});
  summary.classList.add('span-2');
  settings.append(summary,cover,actions(button('删除项目',()=>{
    if(!confirm('确定从草稿删除「'+project.title+'」？发布后展示页才会移除。'))return;
    model.projects.splice(index,1);
    changed();
    selectProject(model.projects[Math.min(index,model.projects.length-1)]);
  },'danger')));
  const heading=make('h3','内容区块',{class:'section-label'});
  const add=cell('block-add',...Object.entries(BLOCKS).filter(([type])=>type!=='legacy').map(([type,label])=>
    button('添加'+label,()=>{
      const block=makeBlock(type);project.blocks.push(block);openBlocks.clear();openBlocks.add(block.id);
      activeBlock=block.id;canvasJump=true;changed();render();
      revealInspector(block.id);
    })));
  area.replaceChildren(head,settings,heading,add,...project.blocks.map((block,i)=>blockCard(project,block,i)));
  if(!project.blocks.length)area.append(para('这个项目还没有区块。可以用上方按钮添加内容。','empty'));
}
function blockCard(project,block,index) {
  const card=make('section',null,{class:'block-card',id:block.id});
  const expanded=openBlocks.has(block.id);
  if(activeBlock===block.id)card.setAttribute('data-active','');
  const title=make('span',itemTitle(project,block));
  const bodyId='edit-'+block.id;
  const toggle=button('',()=>{
    if(openBlocks.has(block.id))openBlocks.delete(block.id);else openBlocks.add(block.id);
    selectBlock(block.id,{scroll:true});
    render();
    document.getElementById(block.id)?.querySelector('.block-expand')?.focus({preventScroll:true});
  },'block-expand');
  toggle.append(title,make('span',BLOCKS[block.type],{class:'block-type'}));
  toggle.setAttribute('aria-expanded',String(expanded));
  toggle.setAttribute('aria-controls',bodyId);
  const handle=make('span','⠿',{draggable:'true',class:'drag-handle',title:'拖动区块排序','aria-hidden':'true'});
  handle.addEventListener('dragstart',event=>{dragged=block.id;event.dataTransfer.setData('text/plain',block.id);event.dataTransfer.effectAllowed='move';});
  handle.addEventListener('dragend',()=>{dragged=null;$$('[data-drag-over]').forEach(el=>delete el.dataset.dragOver);});
  card.addEventListener('dragover',event=>{if(dragged&&dragged!==block.id){event.preventDefault();card.dataset.dragOver='true';}});
  card.addEventListener('dragleave',event=>{if(!card.contains(event.relatedTarget))delete card.dataset.dragOver;});
  card.addEventListener('drop',event=>{
    if(!dragged)return;event.preventDefault();
    const from=project.blocks.findIndex(x=>x.id===dragged);
    dragged=null;delete card.dataset.dragOver;
    if(from>=0)move(project.blocks,from,index);
  });
  const duplicate=button('复制',()=>{
    const copy=structuredClone(block);
    copy.id='block-'+makeId();
    project.blocks.splice(index+1,0,copy);openBlocks.clear();openBlocks.add(copy.id);
    activeBlock=copy.id;canvasJump=true;changed();render();
  },'compact');
  const blockActions=controls(project.blocks,index,'区块');
  if(block.type!=='legacy')blockActions.push(duplicate);
  card.append(cell('block-head',actions(handle,toggle),actions(...blockActions,button('删除',()=>{
      if(!confirm('删除「'+itemTitle(project,block)+'」区块？'))return;
      project.blocks.splice(index,1);
      if(activeBlock===block.id)activeBlock=null;
      changed();render();
    },'compact danger'))));
  if(expanded) {
    const form=cell('block-body form-grid',field('滚动渐显',block,'motion',{list:{inherit:'跟随全站',off:'关闭渐显'}}));
    form.id=bodyId;
    if(block.type==='legacy') {
      const original=app.originals[project.legacy][block.source];
      const content=make('details',null,{class:'span-2'});
      content.open=true;
      content.append(make('summary','编辑本节文字与素材'));
      const rows=cell('form-grid block-body');
      for(const f of original.fields) {
        if(f.kind==='text')rows.append(field(f.label,block.edits,f.id,{fallback:f.value,max:10000,textArea:f.value.length>48}));
        else rows.append(resource(f.label,block.edits,f.id,f.kind,f.value));
      }
      content.append(rows);
      form.append(content);
    } else {
      form.append(field('标题',block,'title',{max:150,update:()=>title.textContent=itemTitle(project,block)}));
      const text=field('正文',block,'text',{textArea:true,max:16000});
      text.classList.add('span-2');
      form.append(text,field('宽度',block,'width',{list:STYLES.width}),field('留白',block,'space',{list:STYLES.space}));
      if(['image','split','grid','gallery','video'].includes(block.type))form.append(field('显示比例',block,'ratio',{list:STYLES.ratio}));
      if(block.type==='split')form.append(field('图文位置',block,'align',{list:{'image-left':'图左文右','image-right':'图右文左'}}));
      if(['image','split'].includes(block.type))form.append(resource('图片',block,'src','image'),field('图片描述',block,'alt',{max:300}),field('图注',block,'caption',{max:500}));
      if(block.type==='video')form.append(resource('视频',block,'src','video'),resource('视频封面',block,'poster','image'),field('视频说明',block,'caption',{max:500}));
      if(block.type==='file')form.append(resource('PDF 文件',block,'src','file'),field('链接文字',block,'caption',{max:500}));
      if(block.type==='gallery')form.append(checkbox('循环滑动',block,'loop'));
      if(['gallery','grid'].includes(block.type))form.append(imageItems(block));
    }
    card.append(form);
  }
  return card;
}
function imageItems(block) {
  return cell('span-2 items-list',...block.items.map((item,index)=>cell('panel form-grid',
    resource('图片 '+(index+1),item,'src','image'),
    actions(...controls(block.items,index,'图片'),button('移除图片',()=>{block.items.splice(index,1);changed();render();},'danger')),
    field('图片描述',item,'alt',{max:300}),field('图注',item,'caption',{max:500}))),
    actions(button('添加图片',()=>openPicker('image',asset=>{
      block.items.push({src:asset.url,alt:'',caption:''});
    }))));
}
function assetName(value) {
  return (app.uploads.find(x=>'/media/'+x.id===value) || app.assets.find(x=>x.url===value))?.name ||
    (value ? decodeURIComponent(value.split('?')[0].split('/').at(-1)) : '尚未选择');
}
function resource(label,obj,key,kind,fallback) {
  const value=obj[key]??fallback;
  const desc=cell('',...((value&&kind==='image')?[make('img',null,{src:value,alt:''})]:[]),
    make('span',value?label+' · '+assetName(value):label+' · 尚未选择',{class:'asset-meta'}));
  const options=[button(value?'替换':'选择',()=>openPicker(kind,asset=>{obj[key]=asset.url;}),'compact')];
  if(value&&fallback===undefined && key!=='src')options.push(button('移除',()=>{obj[key]='';changed();render();},'compact'));
  if(fallback!==undefined&&obj[key]!==undefined)options.push(button('还原',()=>{delete obj[key];changed();render();},'compact'));
  return cell('resource',desc,actions(...options));
}
function existingAssets(kind) {
  const all=[...app.uploads.map(x=>({...x,url:'/media/'+x.id})),...app.assets];
  const query=$('#asset-search').value.trim().toLowerCase();
  return all.filter(x=>(!kind||FORMATS[kind].includes(x.mime))&&x.name.toLowerCase().includes(query));
}
function tile(asset,select) {
  const node=select?button('',()=>select(asset),'asset-tile'):make('a',null,{class:'asset-tile',href:asset.url,target:'_blank',rel:'noopener'});
  if(asset.mime.startsWith('image/'))node.append(make('img',null,{src:asset.url,alt:'',loading:'lazy'}));
  else node.append(make('span',asset.mime.startsWith('video/')?'视频':'PDF',{class:'asset-icon'}));
  node.append(make('span',asset.name));
  if(asset.bytes)node.append(make('small',formatBytes(asset.bytes),{class:'asset-meta'}));
  return node;
}
function fillPicker() {
  const items=existingAssets(mediaKind);
  $('#picker-media').replaceChildren(...(items.length?items.map(asset=>tile(asset,chosen=>{
    choice(chosen);changed();picker.close();render();
  })):[para('没有符合条件的素材。')]));
}
function openPicker(kind,handler) {
  choice=handler;
  mediaKind=kind;
  $('#asset-search').value='';
  const input=$('#picker-upload');
  input.accept=FORMATS[kind].join(',');
  input.value='';
  $('#picker-note').textContent=kind==='video'?'MP4 或 WebM，单个最大 25 MB。':'单个文件最大 12 MB。';
  fillPicker();
  picker.showModal();
}
async function sendFile(file,notice,onSuccess) {
  if(!file||uploading)return;
  uploading=true;
  notice.textContent='正在上传 '+file.name+'…';
  try {
    let data;
    if(app.uploadChunkBytes&&file.size>app.uploadChunkBytes) {
      const id=crypto.randomUUID(),total=Math.ceil(file.size/app.uploadChunkBytes);
      if(file.size>25*1024*1024)throw new Error('文件超过 25 MB，请先压缩后再上传。');
      for(let i=0;i<total;i++) {
        notice.textContent='正在上传 '+file.name+' · '+(i+1)+' / '+total;
        const chunk=file.slice(i*app.uploadChunkBytes,(i+1)*app.uploadChunkBytes);
        let last;
        for(let attempt=0;attempt<3;attempt++) {
          try{await api('/uploads/chunk?id='+id+'&total='+total+'&index='+i,'POST',chunk,'application/octet-stream');last=null;break;}
          catch(error){last=error;if(error.status&&error.status<500)break;await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));}
        }
        if(last)throw last;
      }
      notice.textContent='正在保存 '+file.name+'…';
      data=await api('/uploads/finish?id='+id+'&total='+total+'&name='+encodeURIComponent(file.name)+'&mime='+encodeURIComponent(file.type||'application/octet-stream'),'POST',{});
    }else data=await api('/media?name='+encodeURIComponent(file.name),'POST',file,file.type||'application/octet-stream');
    app.uploads.unshift(data);
    notice.textContent='已上传 '+file.name+'，素材可重复使用。';
    onSuccess(data);
  } catch(error) {
    notice.textContent=error.message;
  } finally {uploading=false;}
}
function showMedia() {
  const note=para('支持图片、MP4、WebM 和 PDF。视频最大 25 MB，图片及 PDF 最大 12 MB。');
  const input=make('input',null,{type:'file',accept:Object.values(FORMATS).flat().join(',')});
  input.addEventListener('change',()=>sendFile(input.files[0],note,()=>render()));
  const uploads=app.uploads.map(x=>tile({...x,url:'/media/'+x.id}));
  area.replaceChildren(cell('editor-head',cell('',make('h2','素材库'),para('上传后，可在不同项目中选择同一份素材。'))),
    cell('panel',actions(push(make('label','上传文件',{class:'upload'}),input),note)),
    cell('asset-list',...(uploads.length?uploads:[para('还没有新上传的素材。')])) );
}
function openProjectOrder() {
  tab='projects';activeBlock=null;render();scheduleCanvas(0);
}
function reorderProject(id,to) {
  const from=model.projects.findIndex(project=>project.id===id);
  if(from<0||to<0||to>=model.projects.length||from===to)return;
  const y=area.scrollTop;
  move(model.projects,from,to);
  area.querySelector('[data-project-order="'+CSS.escape(id)+'"] .project-order-handle')?.focus({preventScroll:true});
  area.scrollTop=y;
}
function showProjects() {
  const rows=model.projects.map((project,index)=>{
    const handle=button('拖动',()=>{},'compact project-order-handle');
    handle.draggable=true;
    handle.setAttribute('aria-label','拖动排序：'+project.title);
    handle.addEventListener('dragstart',event=>{draggedProject=project.id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',project.id);});
    handle.addEventListener('dragend',()=>{draggedProject=null;$$('[data-project-order]',area).forEach(row=>row.removeAttribute('data-drag-over'));});
    const up=button('上移',()=>reorderProject(project.id,index-1),'compact');
    const down=button('下移',()=>reorderProject(project.id,index+1),'compact');
    up.setAttribute('aria-label','上移项目');down.setAttribute('aria-label','下移项目');
    up.disabled=index===0;down.disabled=index===model.projects.length-1;
    const row=cell('project-order-row',cell('project-order-title',make('span',String(index+1).padStart(2,'0'),{class:'project-order-index'}),
      cell('',make('h3',project.title),para(CATEGORIES[project.category]+' · '+names[project.state]))),
      actions(handle,up,down,button('编辑项目',()=>selectProject(project),'compact')));
    row.dataset.projectOrder=project.id;
    row.addEventListener('dragover',event=>{if(draggedProject&&draggedProject!==project.id){event.preventDefault();event.dataTransfer.dropEffect='move';row.setAttribute('data-drag-over','');}});
    row.addEventListener('dragleave',event=>{if(!row.contains(event.relatedTarget))row.removeAttribute('data-drag-over');});
    row.addEventListener('drop',event=>{if(!draggedProject)return;event.preventDefault();const id=draggedProject;draggedProject=null;reorderProject(id,index);});
    return row;
  });
  area.replaceChildren(cell('editor-head',cell('',make('h2','项目排序'),para('拖动或使用上移、下移调整。右侧实时预览，发布草稿后更新正式网站。'))),
    para('隐藏和归档的项目保留在列表中，正式页面只显示设为展示的项目。'),cell('project-order-list',...rows));
}
function ensureHomeLists() {
  const s=model.settings;
  if(!s.aboutRows)s.aboutRows=structuredClone(homeRows(s,app.home));
  if(!s.contacts)s.contacts=structuredClone(homeContacts(s,app.home));
}
function homeCanvasBinding(obj,key) {
  if(obj===model.settings&&Object.hasOwn(HOME_TEXT_FIELDS,key)&&key!=='portraitAlt')return {
    id:key==='intro'?'home-hero':['contactEyebrow','contactHeading','contactLabel','contactIntro','resumeLabel'].includes(key)?'contact':'about',field:key};
  for(const list of ['aboutRows','contacts']) {
    const row=model.settings[list]?.find(item=>item===obj);
    if(row&&['label','text','value'].includes(key))return {id:list==='aboutRows'?'about':'contact',field:list+'.'+row.id+'.'+key};
  }
  return null;
}
function homeCard(id,title,note,...nodes) {
  const card=cell('panel block-card home-card',
    cell('editor-head',cell('',make('h3',title),para(note)),button('定位预览',()=>selectBlock(id,{scroll:true}),'compact')),...nodes);
  card.id=id;
  card.toggleAttribute('data-active',activeBlock===id);
  return card;
}
function showHome() {
  ensureHomeLists();
  const s=model.settings,h=app.home;
  const text=(key,options={})=>field(HOME_TEXT_FIELDS[key],s,key,{fallback:h[key],max:10000,...options});
  const rows=s.aboutRows.map((row,index)=>cell('panel home-list-item',
    cell('block-head',make('span','信息 '+(index+1)),actions(...controls(s.aboutRows,index,'个人信息'),button('删除信息',()=>{
      s.aboutRows.splice(index,1);changed();render();
    },'compact danger'))),
    field('信息标题',row,'label',{max:120}),field('信息内容',row,'text',{textArea:true,max:4000})));
  const contacts=s.contacts.map((item,index)=>cell('panel home-list-item',
    cell('block-head',make('span','联系方式 '+(index+1)),actions(...controls(s.contacts,index,'联系方式'),button('删除联系方式',()=>{
      s.contacts.splice(index,1);changed();render();
    },'compact danger'))),
    field('联系方式类型',item,'type',{list:CONTACT_TYPES,update:()=>render()}),
    field('联系标签',item,'label',{max:120}),field('联系内容',item,'value',{max:1000}),
    ...(item.type==='link'?[field('链接地址',item,'href',{max:2000,inputType:'url'})]:[])));
  const addInfo=button('添加个人信息',()=>{
    s.aboutRows.push({id:'about-info-'+makeId(),label:'新信息',text:''});changed();render();
  });
  const addContact=button('添加联系方式',()=>{
    s.contacts.push({id:'contact-'+makeId(),type:'wechat',label:'微信',value:'',href:''});changed();render();
  });
  addInfo.disabled=s.aboutRows.length>=30;addContact.disabled=s.contacts.length>=30;
  area.replaceChildren(cell('editor-head',cell('',make('h2','首页设置'),para('点击预览中的文字直接修改，点击个人照片替换。')),button('调整作品顺序',openProjectOrder,'compact')),
    homeCard('home-hero','首页介绍','作品列表随项目顺序和展示状态更新。',text('intro',{textArea:true})),
    homeCard('about','关于我','照片、介绍和个人信息均可修改。',
      resource('个人照片',s,'portrait','image',h.portrait),text('portraitAlt'),text('aboutTitle'),text('aboutEnglish'),text('aboutMeta'),
      text('aboutName'),text('aboutRole'),text('about',{textArea:true}),text('graduate'),
      make('h4','个人信息'),...rows,actions(addInfo)),
    homeCard('contact','联系与简历','增删或排序联系方式，预览会自动重新排列。',
      text('contactEyebrow'),text('contactHeading',{textArea:true,max:1000}),text('contactLabel'),text('contactIntro',{textArea:true,max:2000}),
      make('h4','联系方式'),...contacts,actions(addContact),
      resource('简历 PDF',s,'resume','file',h.resume),text('resumeLabel',{max:120})));
}
function downloadBackup() {
  const url=URL.createObjectURL(new Blob([JSON.stringify(model,null,2)],{type:'application/json'}));
  const a=make('a',null,{href:url,download:'作品集内容草稿.json'});
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function showHistory() {
  const rows=[...app.releases,{revision:0,saved_at:null}];
  const history=cell('panel',para('将旧版本恢复为草稿后，可以预览并重新发布。素材继续保留供旧版本使用。'));
  for(const v of rows)history.append(cell('release',make('span',v.revision?'版本 '+v.revision+' · '+formatDate(v.saved_at):'最初的网站内容'),
    button('恢复为草稿',async()=>{
      if(!confirm('用此版本替换当前草稿？正式网站会在重新发布后更新。'))return;
      try {
        await save();
        const result=await api('/restore','POST',{revision:app.draft.revision,liveRevision:v.revision});
        model=result.state;app.draft.revision=result.revision;
        activeBlock=null;openBlocks.clear();
        say('已恢复为草稿');render();scheduleCanvas(0);
      }catch(error){say(error.message,true);}
    })));
  area.replaceChildren(cell('editor-head',cell('',make('h2','发布记录'),para(app.live.revision?'当前已发布版本 '+app.live.revision:'当前展示初始版本')),
    actions(button('导出内容 JSON',downloadBackup),make('a','下载网站迁移备份',{href:'/api/editor/transfer',download:'portfolio-transfer.json'}))),history);
}
function render() {
  inputBindings=new WeakMap();
  renderNavigation();
  if(tab==='home')return showHome();
  if(tab==='projects')return showProjects();
  if(tab==='media')return showMedia();
  if(tab==='history')return showHistory();
  const project=current();
  if(project)return projectPage(project);
  area.replaceChildren(para('新建项目后，可以开始添加区块。','empty'));
}
async function start() {
  try {
    app=await api('/state');
    model=app.draft.state;
    selected=model.projects[0]?.id;
    render();
    say(app.draft.revision?'草稿已读取':'初始版本');
    for(const id of ['#new-project','#publish-button'])$(id).disabled=false;
    scheduleCanvas(0);
  } catch(error) {
    say(error.message,true);
    area.replaceChildren(para(error.message),button('重新加载',start));
  }
}
$('#new-project').addEventListener('click',addProject);
$('#logout-button').addEventListener('click',async event=>{
  const b=event.currentTarget;
  b.disabled=true;
  try {
    try{await save();}catch(error){if(!confirm(error.message+'\n仍要退出？尚未保存的更改会丢失。'))return;}
    const res=await fetch('/api/editor/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'logout'})});
    if(!res.ok)throw new Error('退出没有完成，请重试。');
    location.replace('/admin');
  }catch(error){say(error.message,true);}finally{b.disabled=false;}
});
pageSwitch.addEventListener('change',()=>{
  if(!model)return;
  const value=pageSwitch.value;
  if(value.startsWith('project:')) {
    selectProject(model.projects.find(project=>project.id===value.slice(8)));
    return;
  }
  const wasProject=tab==='project';
  tab=value;
  if(['home','projects'].includes(tab)||wasProject) { activeBlock=null;scheduleCanvas(0); }
  render();
});
$('#asset-search').addEventListener('input',fillPicker);
$('#picker-upload').addEventListener('change',event=>sendFile(event.target.files[0],$('#picker-note'),fillPicker));
$('[data-close]',picker).addEventListener('click',()=>picker.close());
for(const b of $$('[data-size]',preview))b.addEventListener('click',()=>{
  for(const x of $$('[data-size]',preview))x.setAttribute('aria-pressed',String(x===b));
  frame.classList.toggle('mobile',b.dataset.size==='mobile');
});
$('#sync-button').addEventListener('click',event=>{
  syncEnabled=!syncEnabled;
  event.currentTarget.setAttribute('aria-pressed',String(syncEnabled));
  scrollDriver='canvas';
});
$('#mode-button').addEventListener('click',event=>{
  canvasMode=canvasMode==='edit'?'animate':'edit';
  const b=event.currentTarget;
  b.setAttribute('aria-pressed',String(canvasMode==='animate'));
  b.textContent=canvasMode==='edit'?'体验动效':'返回编辑';
  $('#canvas-hint').textContent=canvasMode==='edit'?'点击页面里的文字、图片或区块开始编辑。':'可以滚动、滑动画廊或播放视频。';
  scheduleCanvas(0);
});
$('#inspector-button').addEventListener('click',event=>{
  const closed=workspace.classList.toggle('inspector-closed');
  event.currentTarget.setAttribute('aria-expanded',String(!closed));
  event.currentTarget.textContent=closed?'显示设置':'隐藏设置';
});
$('#publish-button').addEventListener('click',async(event)=>{
  if(!confirm('将当前草稿发布到作品集网址？'))return;
  const b=event.currentTarget;
  b.disabled=true;
  try {
    await save();
    const live=await api('/publish','POST',{revision:app.draft.revision,liveRevision:app.live.revision});
    app.live=live;app.releases.unshift({revision:live.revision,saved_at:live.savedAt});
    say('已发布版本 '+live.revision);
    if(tab==='history')showHistory();
  }catch(error){say(error.message,true);}finally{b.disabled=false;}
});
const headerObserver=new ResizeObserver(entries=>{
  const height=entries[0].target.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--editor-header-height',height+'px');
});
headerObserver.observe($('.app-header'));
start();
