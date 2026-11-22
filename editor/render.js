const escapeHTML = (value='') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const E = escapeHTML;
const lines = value => E(value).replace(/\n/g,'<br>');
const number = n => String(n).padStart(2,'0');
const urlFor = project => '/' + project.slug + '.html';
const jpg = (src, alt, extra='') => '<img src="'+E(src)+'" alt="'+E(alt)+'" loading="lazy" '+extra+'>';
const labelFor = block => BLOCKS[block.type];
function remap(template, tokens) {
  return template.replace(/%%([A-Z]+(?:-[a-z0-9]+)?)%%/g, (_,key) => tokens[key] ?? '');
}
function applyField(raw, value) {
  const match = raw.match(/^(<[\w-]+\b[^>]*>)[\s\S]*(<\/[\w-]+>)$/);
  return match ? match[1].replace(/\sdata-key="[^"]*"/, '') + lines(value) + match[2] : raw;
}
function canvasAttr(key, value) {
  return ' data-canvas-'+key+'="'+E(value)+'"';
}
function canvasTag(html,key,value) {
  return html.replace(/^<[a-z][\w-]*/i, match=>match+canvasAttr(key,value));
}
function homeText(tag,key,value,canvas,attrs='') {
  return '<'+tag+(canvas?canvasAttr('text',key):'')+(attrs?' '+attrs:'')+'>'+lines(value)+'</'+tag+'>';
}
function aboutMarkup(settings,canvas) {
  const value=key=>settings[key]??APP.homeValues[key];
  const text=(tag,key,attrs='')=>homeText(tag,key,value(key),canvas,attrs);
  const portrait=value('portrait');
  const photo=portrait?'<img src="'+E(portrait)+'" alt="'+E(value('portraitAlt'))+'"'+(canvas?canvasAttr('asset','portrait')+' tabindex="0" role="button" aria-label="替换个人照片"':'')+'>':
    (canvas?'<button type="button" class="canvas-placeholder"'+canvasAttr('asset','portrait')+'>选择个人照片</button>':'');
  const rows=homeRows(settings,APP.homeValues).map(row=>'<div class="about-row" data-home-row="'+E(row.id)+'">'+
    homeText('span','aboutRows.'+row.id+'.label',row.label,canvas)+homeText('p','aboutRows.'+row.id+'.text',row.text,canvas)+'</div>').join('');
  return '<section id="about" class="portfolio-about"'+(canvas?canvasAttr('block','about'):'')+'><div class="section-head"><h2>'+
    text('span','aboutTitle')+' '+text('em','aboutEnglish')+'</h2>'+text('span','aboutMeta')+'</div><div class="about-grid">'+
    '<div class="portrait portrait-photo">'+photo+'<div class="portrait-signature">'+text('strong','aboutName')+text('p','aboutRole')+'</div></div><div>'+
    text('p','about','class="about-lead"')+text('p','graduate','class="about-graduate"')+rows+'</div></div></section>';
}
function contactMarkup(settings,canvas) {
  const value=key=>settings[key]??APP.homeValues[key];
  const text=(tag,key,attrs='')=>homeText(tag,key,value(key),canvas,attrs);
  const items=homeContacts(settings,APP.homeValues).filter(item=>canvas||item.value.trim());
  const contacts=items.map(item=>{
    const href=contactURL(item);
    return '<div class="portfolio-contact-item" data-home-contact="'+E(item.id)+'">'+
      (item.label||canvas?homeText('span','contacts.'+item.id+'.label',item.label,canvas,'class="contact-item-label"'):'')+
      (href?'<a href="'+E(href)+'"'+(item.type==='link'?' target="_blank" rel="noopener noreferrer"':'')+'>':'')+
      homeText('span','contacts.'+item.id+'.value',item.value,canvas,'class="contact-item-value"')+
      (item.type==='link'&&href?'<span aria-hidden="true"> ↗</span>':'')+(href?'</a>':'')+'</div>';
  }).join('');
  const resume=value('resume');
  const hasResume=Boolean(resume)||canvas;
  return '<section id="contact" class="portfolio-contact"'+(canvas?canvasAttr('block','contact'):'')+'>'+
    '<div aria-hidden="true" class="contact-orbit"></div><div aria-hidden="true" class="contact-dot"></div>'+text('div','contactEyebrow','class="eyebrow"')+
    '<h2><span class="portfolio-contact-heading"'+(canvas?canvasAttr('text','contactHeading'):'')+'>'+value('contactHeading').split('\n').map(line=>'<span class="contact-line">'+E(line)+'</span>').join('')+
    '</span><span aria-hidden="true" class="contact-arrow">↗</span></h2>'+
    '<div class="contact-bottom'+(items.length>2?' contacts-many':'')+'" data-contact-count="'+items.length+'" data-has-resume="'+hasResume+'"><div class="contact-intro">'+
    text('span','contactLabel')+text('p','contactIntro')+'</div>'+(items.length?'<div class="contact-details'+(items.length<3?' contact-few':'')+'">'+contacts+'</div>':'')+
    (hasResume?'<div class="resume-block">'+(resume?'<a href="'+E(resume)+'" target="_blank" rel="noopener">'+text('span','resumeLabel')+'<b aria-hidden="true">↗</b></a>':'')+
      (canvas?'<button type="button" class="canvas-placeholder"'+canvasAttr('asset','resume')+'>'+(resume?'替换简历 PDF':'选择简历 PDF')+'</button>':'')+'</div>':'')+'</div></section>';
}
function homeMarkup(state,canvas=false) {
  const visible = state.projects.filter(project=>project.state==='visible');
  const value=state.settings.intro;
  let intro=value===undefined?APP.homeFields.intro:applyField(APP.homeFields.intro,value);
  // Legacy browser defaults must not replace server-rendered edits.
  intro=intro.replace(/\sdata-edit="[^"]*"/,'');
  intro=intro.replace('<p','<p class="portfolio-home-intro"');
  if(canvas)intro=canvasTag(intro,'text','intro');
  let markup=remap(APP.homeTemplate,{'HOME-intro':intro,ABOUT:aboutMarkup(state.settings,canvas),CONTACT:contactMarkup(state.settings,canvas),
    CARDS:visible.map(renderCard).join(''),COUNT:number(visible.length),RANGE:visible.length?'01 — '+number(visible.length):'暂无项目'});
  markup=markup.replace('</head>','<link rel="stylesheet" href="/portfolio-home.css"></head>');
  if(canvas)markup=markup.replace(/<section class="hero">/,'<section class="hero" id="home-hero" data-canvas-block="home-hero">');
  return markup;
}
function renderCard(project,index) {
  const baseline=APP.seed.projects.find(p=>p.id===project.id);
  const n=number(index+1);
  if(baseline && ['title','summary','cover','category','slug'].every(k=>project[k]===baseline[k])) {
    return APP.legacy[project.legacy].card
      .replace(/>\d{2} \/ /g, '>'+n+' / ')
      .replace(/<span class="ad-cover-label">\d{2} /, '<span class="ad-cover-label">'+n);
  }
  const cover=project.cover ? jpg(project.cover,project.title) : '<div class="portfolio-placeholder">作品封面</div>';
  return '<article data-category="'+E(project.category)+'"><a class="project" href="'+urlFor(project)+'">'+
    '<div class="cover portfolio-card-cover">'+cover+'</div><div class="caption"><h3>'+E(project.title)+
    '</h3><span>'+n+' / '+E(CATEGORIES[project.category])+'</span></div><p>'+E(project.summary)+'</p></a></article>';
}
function legacyBlock(project, block, index, canvas=false) {
  const original=APP.legacy[project.legacy].sections[block.source];
  const swaps={};
  const media=[];
  for(const field of original.fields) {
    const value=block.edits[field.id];
    if(field.kind==='text') {
      const raw=original.originals[field.id];
      if(value!==undefined) swaps['FIELD-'+field.id]=applyField(raw,value);
      else swaps['FIELD-'+field.id]=raw;
      if(canvas)swaps['FIELD-'+field.id]=canvasTag(swaps['FIELD-'+field.id],'text',field.id);
    } else {
      swaps['ASSET-'+field.id]=E(value ?? field.value.slice(1));
      if(value!==undefined) media.push([field.value.slice(1),value]);
    }
  }
  let template=original.template;
  if(canvas)template=template.replace(/<(?:img|source)\b[^>]*%%ASSET-(\d+)%%[^>]*>/g,
    (tag,id)=>canvasTag(tag,'asset',id));
  let html=remap(template,swaps)
    .replace(/^(<section\b[^>]*\bid=")[^"]+(")/, (_,before,after)=>before+E(block.id)+after)
    .replace(/^(<section\b)/, '$1 data-editor-motion="'+block.motion+'"');
  if(canvas)html=canvasTag(html,'block',block.id);
  for(const [before,after] of media) {
    html=html.replace(/\b(data-image|href)="([^"]+)"/g,(full,attr,value)=>value===before ? attr+'="'+E(after)+'"' : full);
  }
  if(block.source===Object.keys(APP.legacy[project.legacy].sections)[0]&&index>=0) {
    html=html.replace(/(<p\b[^>]*class="eyebrow"[^>]*>)\d{2}( \/)/, (_,before,after)=>before+number(index+1)+after);
    if(project.category==='tool')html=html.replace(/(<p\b[^>]*class="eyebrow"[^>]*>\d{2} \/ )[^<]+/, '$1VIBE CODING');
  }
  return html;
}
function blankViewer() {
  return '<dialog id="image-viewer" aria-label="图片预览"><div class="viewer-bar"><p id="viewer-caption"></p><button type="button" id="viewer-close">关闭</button></div><img id="viewer-image" alt=""></dialog>';
}
function figure(item, ratio, key='') {
  return '<figure><button class="image-open portfolio-media ratio-'+ratio+'" type="button"'+(key?canvasAttr('asset',key):'')+' data-image="'+E(item.src)+
    '" data-caption="'+E(item.caption)+'" aria-label="放大查看 '+E(item.alt || item.caption || '图片')+'">'+
    jpg(item.src,item.alt || item.caption)+'</button>'+(item.caption?'<figcaption>'+E(item.caption)+'</figcaption>':'')+'</figure>';
}
function editableBlock(block, canvas=false) {
  const textAttr=canvas?canvasAttr('text','text'):'';
  const titleAttr=canvas?canvasAttr('text','title'):'';
  const captionAttr=canvas?canvasAttr('text','caption'):'';
  const text=(block.text||canvas)?'<p class="portfolio-copy"'+textAttr+'>'+lines(block.text)+'</p>':'';
  const title=(block.title||canvas)?'<h2'+titleAttr+'>'+E(block.title)+'</h2>':'';
  const label=(block.caption||canvas)?'<p class="portfolio-caption"'+captionAttr+'>'+E(block.caption)+'</p>':'';
  const assetButton=(key,label)=>canvas?'<button type="button" class="canvas-placeholder"'+canvasAttr('asset',key)+'>'+label+'</button>':'';
  const image=block.src?figure(block,block.ratio,canvas?'src':''):assetButton('src','选择图片');
  let body=title+text;
  if(block.type==='image')body+=image;
  if(block.type==='split') body='<div class="portfolio-split '+block.align+'"><div>'+title+text+'</div>'+
    image+'</div>';
  if(block.type==='grid' && block.items.length) body+='<div class="portfolio-image-grid">'+block.items.map((item,i)=>figure(item,block.ratio,canvas?'items.'+i:'')).join('')+'</div>';
  if(block.type==='gallery' && block.items.length) {
    const id='gallery-'+block.id;
    if(block.items.length===1) body+=figure(block.items[0],block.ratio,canvas?'items.0':'');
    else body+='<div class="gallery-group"><div class="carousel-controls"><span data-gallery-count aria-live="polite"></span><div><button type="button" data-gallery-prev aria-controls="'+id+'" aria-label="上一张图片">←</button><button type="button" data-gallery-next aria-controls="'+id+'" aria-label="下一张图片">→</button></div></div><div class="sequence-gallery portfolio-gallery" data-gallery '+(block.loop?'data-gallery-loop ':'')+'id="'+id+'" role="group" tabindex="0" aria-label="横向画廊">'+block.items.map((item,i)=>figure(item,block.ratio,canvas?'items.'+i:'')).join('')+'</div></div>';
  }
  if((block.type==='grid'||block.type==='gallery')&&canvas)body+=assetButton('items.add','添加图片');
  if(block.type==='video') {
    body+=block.src?'<video class="portfolio-video ratio-'+block.ratio+'" controls playsinline preload="metadata" '+(block.poster?'poster="'+E(block.poster)+'"':'')+' aria-label="'+E(block.title||'项目视频')+'" src="'+E(block.src)+'"></video>'+label:'';
    body+=assetButton('src',block.src?'替换视频':'上传视频');
  }
  if(block.type==='file')body+=(block.src?'<a class="text-link" href="'+E(block.src)+'" target="_blank" rel="noopener">'+E(block.caption || '查看文件')+'</a>':'')+assetButton('src',block.src?'替换文件':'选择 PDF');
  return '<section id="'+E(block.id)+'"'+(canvas?canvasAttr('block',block.id):'')+' data-editor-reveal="'+block.motion+'" class="case-section portfolio-block width-'+block.width+
    ' space-'+block.space+'">'+body+'</section>';
}
function projectNavigation(state,project) {
  const visible=state.projects.filter(item=>item.state==='visible');
  const index=visible.findIndex(item=>item.id===project.id);
  const next=index<0?null:visible[index+1];
  return '<div class="case-next"><a href="/#work">返回全部作品</a>'+
    (next?'<a href="'+urlFor(next)+'">下一项目：'+E(next.title)+'</a>':'<a href="/#contact">联系与交流</a>')+'</div>';
}
function projectMarkup(state,project,canvas=false) {
  const order=state.projects.filter(p=>p.state==='visible').findIndex(p=>p.id===project.id);
  const original=APP.legacy[project.legacy];
  const cells=project.blocks.map(block=>block.type==='legacy'?legacyBlock(project,block,order,canvas):editableBlock(block,canvas));
  const originalLinks=original ? [...original.nav.matchAll(/<a\b[^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)] : [];
  const navBlocks=project.blocks.flatMap(block=>{
    if(block.type==='legacy') {
      const link=originalLinks.find(m=>m[1]===block.source);
      if(!link)return [];
      const field=original.sections[block.source].fields.find(f=>f.heading);
      return [{id:block.id,label:(field&&block.edits[field.id])||link[2].replace(/<span[^>]*>[\s\S]*?<\/span>/,'').trim(),original:!(field&&block.edits[field.id])}];
    }
    return block.title ? [{id:block.id,label:block.title}] : [];
  });
  const nav=navBlocks.length?'<nav aria-label="项目章节导航" class="case-nav">'+navBlocks.map((item,i)=>'<a href="#'+E(item.id)+'"><span>'+number(i+1)+'</span> '+(item.original?item.label:E(item.label))+'</a>').join('')+'</nav>':'';
  if(original) {
    const prefix=original.prefix.replace(/<title>[\s\S]*?<\/title>/,'<title>'+E(project.title)+' — 谢易宸作品集</title>');
    const opening=project.blocks.findIndex(block=>block.type==='legacy'&&block.source===Object.keys(original.sections)[0]);
    cells.splice(opening===0?1:0,0,nav);
    return prefix+cells.join('')+original.tail.replace(/<div class="case-next">[\s\S]*?<\/div>/,projectNavigation(state,project));
  }
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+E(project.title)+'</title>'+
    ['style','flow','motion','case-motion','galleries','portfolio-blocks'].map(name=>'<link rel="stylesheet" href="/'+name+'.css">').join('')+
    '</head><body class="flow-page portfolio-editable"><header><a class="logo" href="/">谢易宸 <span>PORTFOLIO</span></a><nav aria-label="主导航"><a href="/#work">返回作品集</a><a href="/#contact">联系</a></nav></header><main>'+
    '<section class="case-opening"><div class="case-heading"><div><p class="eyebrow">'+(order<0?'':number(order+1)+' / ')+E(CATEGORIES[project.category])+'</p><h1'+(canvas?canvasAttr('text','project.title'):'')+'>'+E(project.title)+'</h1></div><p class="case-summary"'+(canvas?canvasAttr('text','project.summary'):'')+'>'+E(project.summary)+'</p></div>'+
    (project.cover?'<figure class="portfolio-hero">'+jpg(project.cover,project.title)+'</figure>':'')+'</section>'+nav+cells.join('')+
    projectNavigation(state,project)+'</main><footer><span>谢易宸 · 作品集</span><a href="#">回到顶部</a></footer>'+blankViewer()+
    ['content','flow','motion','case-motion','galleries'].map(name=>'<script src="/'+name+'.js"></script>').join('')+'</body></html>';
}
