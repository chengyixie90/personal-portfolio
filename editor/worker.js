const LIMITS = {image:12*1024*1024, video:25*1024*1024, file:12*1024*1024};
const STATE_LIMIT = 350_000;
const NO_STORE = {'cache-control':'no-store','x-content-type-options':'nosniff'};
const json = (body,status=200) => Response.json(body,{status,headers:NO_STORE});
const html = (body,status=200) => new Response(body,{status,headers:{...NO_STORE,'content-type':'text/html; charset=utf-8'}});
const failed = (status,message) => json({message},status);
const isoDate = () => new Date().toISOString();
const cleanSlug = s => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length<=70 && !['admin','api','preview','media','assets','documents','index'].includes(s);
const short = (value,max) => typeof value==='string' && value.length<=max;
const isRecord = value => value && typeof value==='object' && !Array.isArray(value);
const hasOwn = (object,key) => Object.hasOwn(object,key);
const isMotion = value => value==='inherit' || value==='off';
const isAsset = value => {
  try { return value==='' || assetPath(value); }
  catch { return false; }
};

function validationError(state) {
  if(!isRecord(state) || !Array.isArray(state.projects) || !isRecord(state.settings) || state.projects.length>60)
    return '作品集数据格式有误，或项目超过 60 个。';
  if(state.contentRevision!==undefined&&(!Number.isSafeInteger(state.contentRevision)||state.contentRevision<0||state.contentRevision>CONTENT_REVISION))
    return '作品集内容版本有误，请重新加载。';
  const slugs=new Set(), ids=new Set();
  for(const p of state.projects) {
    if(!isRecord(p)||!short(p.id,100)||ids.has(p.id)||!short(p.slug,70)||!cleanSlug(p.slug)||slugs.has(p.slug)||
      !short(p.title,120)||!p.title.trim()||!short(p.summary,1500)||!hasOwn(CATEGORIES,p.category)||
      !isAsset(p.cover)||!['visible','hidden','archived'].includes(p.state)||!Array.isArray(p.blocks)||p.blocks.length>70||
      (p.legacy!==undefined && !hasOwn(APP.legacy,p.legacy)))
      return '项目名称、网址、分类或区块有误。项目网址须为不重复的英文字母、数字或连字符。';
    const reserved=APP.seed.projects.find(x=>x.slug===p.slug);
    if(reserved && reserved.id!==p.id)return '此网址已由现有项目使用。';
    if(reserved===undefined && APP.seed.projects.some(x=>x.id===p.id))return '现有项目的网址需保留。';
    slugs.add(p.slug);
    ids.add(p.id);
    const blockIds=new Set();
    for(const b of p.blocks) {
      if(!isRecord(b)||!short(b.id,100)||!/^[a-z][a-z0-9-]*$/.test(b.id)||blockIds.has(b.id)||
        !hasOwn(BLOCKS,b.type)||!isMotion(b.motion))return '区块类型或编号有误。';
      blockIds.add(b.id);
      if(b.type==='legacy') {
        const sections=APP.legacy[p.legacy]?.sections;
        if(!sections||!hasOwn(sections,b.source)||!isRecord(b.edits))return '原有章节无法识别。';
        for(const [key,value] of Object.entries(b.edits)) {
          const field=sections[b.source].fields.find(row=>row.id===key);
          if(!field||(field.kind==='text'?!short(value,10000):(!value||!isAsset(value))))return '原有章节含无效文字或文件。';
        }
        continue;
      }
      if(!short(b.title,150)||!short(b.text,16000)||!short(b.alt,300)||!short(b.caption,500)||!isAsset(b.src)||!isAsset(b.poster)||
        !hasOwn(STYLES.width,b.width)||!hasOwn(STYLES.space,b.space)||!hasOwn(STYLES.ratio,b.ratio)||
        !['image-left','image-right'].includes(b.align)||typeof b.loop!=='boolean'||!Array.isArray(b.items)||b.items.length>40||
        b.items.some(item=>!isRecord(item)||!item.src||!isAsset(item.src)||!short(item.alt,300)||!short(item.caption,500)))
        return '区块内容、排版或素材格式有误。';
    }
  }
  for(const [key,value] of Object.entries(state.settings)) {
    if(!hasOwn(APP.homeValues,key))return '首页设置无法保存。';
    if(key==='aboutRows'||key==='contacts') {
      if(!Array.isArray(value)||value.length>30)return '首页信息条目最多 30 条。';
      const rowIds=new Set();
      for(const row of value) {
        if(!isRecord(row)||!short(row.id,80)||!/^[a-z][a-z0-9-]*$/.test(row.id)||rowIds.has(row.id)||!short(row.label,120))
          return '首页信息条目的编号或标签有误。';
        rowIds.add(row.id);
        if(key==='aboutRows') {
          if(!short(row.text,4000))return '关于我信息每条最多 4000 个字符。';
        } else {
          if(!hasOwn(CONTACT_TYPES,row.type)||!short(row.value,1000)||!short(row.href,2000))return '联系方式格式有误。';
          if(row.type==='email'&&row.value&&!/^[^\s<>"@]+@[^\s<>"@]+\.[^\s<>"@]+$/.test(row.value.trim()))return '邮箱地址格式有误。';
          if(row.type==='link'&&row.href&&!contactURL(row))return '网站／社交链接须以 https:// 或 http:// 开头。';
        }
      }
      continue;
    }
    if(!short(value,10000))return '首页文字格式有误。';
    if(key==='email'&&value&&!/^[^\s<>"@]+@[^\s<>"@]+\.[^\s<>"@]+$/.test(value))return '邮箱地址格式有误。';
    if(['resume','portrait'].includes(key)&&!isAsset(value))return '首页图片或简历文件路径有误。';
  }
  return '';
}
function owner(request,env) {
  return Boolean(env.PORTFOLIO_OWNER_EMAIL && request.headers.get('oai-authenticated-user-id') &&
    request.headers.get('oai-authenticated-user-email')?.toLowerCase()===env.PORTFOLIO_OWNER_EMAIL.toLowerCase());
}
async function parsedBody(request) {
  const buffer=await request.arrayBuffer();
  if(buffer.byteLength>STATE_LIMIT)return null;
  try {return JSON.parse(new TextDecoder().decode(buffer));} catch {return null;}
}
async function latest(db) {
  const row=await db.prepare('SELECT revision,content,saved_at FROM portfolio_releases ORDER BY revision DESC LIMIT 1').first();
  return row?{revision:row.revision,state:currentContent(JSON.parse(row.content)),savedAt:row.saved_at}:{revision:0,state:APP.seed,savedAt:null};
}
async function draft(db) {
  const row=await db.prepare("SELECT revision,content,saved_at FROM portfolio_state WHERE slot='draft'").first();
  return row?{revision:row.revision,state:currentContent(JSON.parse(row.content)),savedAt:row.saved_at}:{revision:0,state:APP.seed,savedAt:null};
}
async function saveDraft(db,revision,state) {
  if(revision===0) {
    return db.prepare("INSERT OR IGNORE INTO portfolio_state(slot,revision,content,saved_at) VALUES ('draft',1,?,?)")
      .bind(JSON.stringify(state),isoDate()).run();
  }
  return db.prepare("UPDATE portfolio_state SET revision=revision+1,content=?,saved_at=? WHERE slot='draft' AND revision=?")
    .bind(JSON.stringify(state),isoDate(),revision).run();
}
const mediaURLs = state => new Set(JSON.stringify(state).match(/\/media\/[a-f0-9-]{36}(?=")/g) || []);
async function mediaPresent(db,state) {
  const ids=[...mediaURLs(state)].map(url=>url.split('/').at(-1));
  for(let i=0;i<ids.length;i+=50) {
    const slice=ids.slice(i,i+50);
    const row=await db.prepare('SELECT COUNT(*) AS total FROM portfolio_media WHERE id IN ('+slice.map(()=>'?').join(',')+')').bind(...slice).first();
    if(row.total!==slice.length)return false;
  }
  return true;
}
function fileSignature(bytes,mime) {
  const at=(offset,length)=>String.fromCharCode(...bytes.slice(offset,offset+length));
  if(mime==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(mime==='image/png')return bytes[0]===137&&at(1,7)==='PNG\r\n\x1a\n';
  if(mime==='image/webp')return at(0,4)==='RIFF'&&at(8,4)==='WEBP';
  if(mime==='image/gif')return /^GIF8[79]a$/.test(at(0,6));
  if(mime==='image/avif')return at(4,4)==='ftyp'&&/avif|avis/.test(at(8,24));
  if(mime==='video/mp4')return at(4,4)==='ftyp';
  if(mime==='video/webm')return bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163;
  if(mime==='application/pdf')return at(0,5)==='%PDF-';
  return false;
}
async function upload(request,env,url) {
  const mime=request.headers.get('content-type')?.split(';')[0];
  const kind=Object.keys(FORMATS).find(type=>FORMATS[type].includes(mime));
  const name=(url.searchParams.get('name') || '新素材').replace(/[\u0000-\u001f/\\]/g,'').slice(0,180) || '新素材';
  if(!kind)return failed(415,'支持常用图片、MP4、WebM 和 PDF。');
  const advertised=Number(request.headers.get('content-length'));
  if(advertised>LIMITS[kind])return failed(413,'文件超出上传大小限制。');
  const chunks=[];
  const reader=request.body?.getReader();
  if(!reader)return failed(400,'没有收到文件。');
  let length=0;
  for(;;) {
    const {done,value}=await reader.read();
    if(done)break;
    length+=value.byteLength;
    if(length>LIMITS[kind]) {
      await reader.cancel();
      return failed(413,'文件超出上传大小限制。');
    }
    chunks.push(value);
  }
  const data=new Blob(chunks,{type:mime});
  if(!fileSignature(new Uint8Array(await data.slice(0,32).arrayBuffer()),mime))return failed(415,'文件内容与选择的格式不符。');
  const id=makeId();
  await env.BUCKET.put(id,data,{httpMetadata:{contentType:mime}});
  try {
    await env.DB.prepare('INSERT INTO portfolio_media(id,name,mime,bytes,created_at) VALUES (?,?,?,?,?)').bind(id,name,mime,length,isoDate()).run();
  } catch(error) {
    await env.BUCKET.delete(id);
    throw error;
  }
  return json({id,name,mime,bytes:length,url:'/media/'+id},201);
}
async function serveMedia(request,env,id) {
  if(!/^[a-f0-9-]{36}$/.test(id))return new Response('Not found',{status:404});
  if(!await editorAccess(request,env)) {
    const {state}=await latest(env.DB);
    const visible={settings:state.settings,projects:state.projects.filter(p=>p.state==='visible')};
    if(!mediaURLs(visible).has('/media/'+id))return new Response('Not found',{status:404});
  }
  const meta=await env.DB.prepare('SELECT mime,bytes FROM portfolio_media WHERE id=?').bind(id).first();
  if(!meta)return new Response('Not found',{status:404});
  const header=request.headers.get('range');
  const base={...NO_STORE,'content-type':meta.mime,'accept-ranges':'bytes'};
  let start=0, end=meta.bytes-1;
  if(header) {
    const r=header.match(/^bytes=(\d*)-(\d*)$/);
    if(!r || (!r[1]&&!r[2]))return new Response(null,{status:416,headers:{...base,'content-range':'bytes */'+meta.bytes}});
    if(r[1]) {start=Number(r[1]);if(r[2])end=Math.min(end,Number(r[2]));}
    else start=Math.max(0,meta.bytes-Number(r[2]));
    if(start>end)return new Response(null,{status:416,headers:{...base,'content-range':'bytes */'+meta.bytes}});
    base['content-range']='bytes '+start+'-'+end+'/'+meta.bytes;
  }
  base['content-length']=String(end-start+1);
  if(request.method==='HEAD')return new Response(null,{status:header?206:200,headers:base});
  const asset=await env.BUCKET.get(id,header?{range:{offset:start,length:end-start+1}}:undefined);
  return asset?new Response(asset.body,{status:header?206:200,headers:base}):new Response('Not found',{status:404});
}

async function adminAPI(request,env,url) {
  if(!await editorAccess(request,env))return failed(403,'后台登录已失效，请重新输入密钥。');
  if(request.method!=='GET'&&request.headers.get('origin')!==url.origin)return failed(403,'请在本站后台进行操作。');
  const route=url.pathname.slice('/api/editor'.length);
  if(route==='/transfer'&&request.method==='GET') {
    const [d,live,releases,media]=await Promise.all([draft(env.DB),latest(env.DB),
      env.DB.prepare('SELECT revision,content,saved_at FROM portfolio_releases ORDER BY revision').all(),
      env.DB.prepare('SELECT id,name,mime,bytes,created_at FROM portfolio_media ORDER BY created_at').all()]);
    return new Response(JSON.stringify({format:'portfolio-transfer-v1',draft:d,live,releases:releases.results,media:media.results}),
      {headers:{...NO_STORE,'content-type':'application/json; charset=utf-8','content-disposition':'attachment; filename="portfolio-transfer.json"'}});
  }
  if(route==='/state'&&request.method==='GET') {
    const [d,live,releases,uploads]=await Promise.all([
      draft(env.DB),latest(env.DB),
      env.DB.prepare('SELECT revision,saved_at FROM portfolio_releases ORDER BY revision DESC LIMIT 30').all(),
      env.DB.prepare('SELECT id,name,mime,bytes,created_at FROM portfolio_media ORDER BY created_at DESC').all(),
    ]);
    const originals=Object.fromEntries(Object.entries(APP.legacy).map(([slug,p])=>[slug,Object.fromEntries(
      Object.entries(p.sections).map(([id,s])=>[id,{label:s.label,fields:s.fields}])
    )]));
    return json({draft:d,live:{revision:live.revision,savedAt:live.savedAt},releases:releases.results,uploads:uploads.results,
      originals,home:APP.homeValues,assets:APP.assets});
  }
  if(route==='/media'&&request.method==='POST') return upload(request,env,url);
  if(route==='/canvas'&&request.method==='POST') {
    const input=await parsedBody(request);
    if(!input)return failed(400,'预览内容超出限制。');
    const error=validationError(input.state);
    if(error)return failed(400,error);
    const project=input.projectId?input.state.projects.find(p=>p.id===input.projectId):null;
    if(input.projectId&&!project)return failed(404,'找不到该项目。');
    const markup=project?projectMarkup(input.state,project,true):homeMarkup(input.state,true);
    return html(preparePage(markup,project?urlFor(project):'/',input.animate?'animate':'edit'));
  }
  if(request.method==='PUT'&&route==='/draft') {
    const input=await parsedBody(request);
    if(!input||!Number.isSafeInteger(input.revision)||input.revision<0)return failed(400,'草稿数据无效或过大。');
    const error=validationError(input.state);
    if(error)return failed(400,error);
    if(!await mediaPresent(env.DB,input.state))return failed(400,'草稿引用了素材库中不存在的文件。');
    const result=await saveDraft(env.DB,input.revision,input.state);
    return result.meta.changes===1?json({revision:input.revision+1}):failed(409,'另一个窗口已修改草稿。请先备份当前内容，再重新加载。');
  }
  if(request.method==='POST'&&(route==='/publish'||route==='/restore')) {
    const input=await parsedBody(request);
    if(!input||!Number.isSafeInteger(input.revision)||!Number.isSafeInteger(input.liveRevision))return failed(400,'版本号有误。');
    const d=await draft(env.DB);
    if(d.revision!==input.revision)return failed(409,'草稿已经在别处更新，请重新加载。');
    if(route==='/restore') {
      const row=input.liveRevision===0?{content:JSON.stringify(APP.seed)}:
        await env.DB.prepare('SELECT content FROM portfolio_releases WHERE revision=?').bind(input.liveRevision).first();
      if(!row)return failed(404,'找不到该版本。');
      const state=JSON.parse(row.content);
      // Restoring a historical list is deliberate; do not reinsert additions later.
      state.contentRevision=CONTENT_REVISION;
      const result=await saveDraft(env.DB,input.revision,state);
      return result.meta.changes===1?json({state,revision:input.revision+1}):failed(409,'草稿已经在别处更新。');
    }
    if(!await mediaPresent(env.DB,d.state))return failed(400,'发布内容中有文件缺失。');
    const published=d.state.projects.filter(p=>p.state==='visible');
    for(const project of published)for(const block of project.blocks) {
      if(['image','video','file','split'].includes(block.type)&&!block.src)return failed(400,'「'+project.title+'」有区块缺少文件，请补充或删除该区块。');
      if(['grid','gallery'].includes(block.type)&&!block.items.length)return failed(400,'「'+project.title+'」有画廊或图片组没有图片。');
    }
    const stamp=isoDate();
    const result=await env.DB.prepare(`INSERT INTO portfolio_releases(revision,content,saved_at)
      SELECT ?,?,?
      WHERE COALESCE((SELECT MAX(revision) FROM portfolio_releases),0)=?
      AND COALESCE((SELECT revision FROM portfolio_state WHERE slot='draft'),0)=?`)
      .bind(input.liveRevision+1,JSON.stringify(d.state),stamp,input.liveRevision,input.revision).run();
    return result.meta.changes===1?json({revision:input.liveRevision+1,savedAt:stamp}):failed(409,'发布版本或草稿已更新，请重新加载。');
  }
  return failed(404,'找不到该操作。');
}
function pageRoute(pathname) {
  if(pathname==='/'||pathname==='/index.html')return {home:true};
  const m=pathname.match(/^\/([a-z0-9-]+)(?:\.html|\/index\.html|\/)?$/);
  return m&&cleanSlug(m[1])?{slug:m[1]}:null;
}
function getPage(data,route,preview=false) {
  if(route.home)return homeMarkup(data);
  const project=data.projects.find(p=>p.slug===route.slug&&(preview||p.state==='visible'));
  return project?projectMarkup(data,project):null;
}
function preparePage(markup,pathname,canvas=false) {
  if(canvas==='edit')markup=markup.replace(/<script\s+src="\/?(?:case-motion|motion-init|motion)\.js(?:\?[^"]*)?"\s*><\/script>/g,'');
  const page=markup.replace(/<head>/i,'<head><base href="/">')
    .replace(/(href=["'])(#[^"']*)(["'])/g, (_,before,hash,after)=>before+E(pathname)+hash+after)
    .replace(/case-motion\.js(?:\?v=[\w-]+)?/g,'case-motion.js?v=portfolio-editor');
  if(!canvas)return page.replace(/(<footer\b[^>]*>)([\s\S]*?)(?=<a\b|<\/footer>)/i,
    (_,opening,credit)=>opening+'<a class="portfolio-admin-entry" href="/admin" aria-label="进入作品集后台" style="color:inherit;text-decoration:none">'+credit+'</a>');
  return page.replace('</head>','<link rel="stylesheet" href="/portfolio-canvas.css"><script defer src="/portfolio-scroll.js"></script><script defer src="/portfolio-canvas.js"></script></head>');
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    const pathname=url.pathname;
    try {
      if(pathname==='/api/editor/auth')return await accessAPI(request,env,url);
      if(pathname==='/admin'||pathname==='/admin/') {
        if(!['GET','HEAD'].includes(request.method))return failed(405,'请在后台页面操作。');
        const config=await keyConfig(env);
        const recovering=url.searchParams.get('recover')==='1';
        if(recovering||!config) {
          const mode=owner(request,env)?(config?'reset':'setup'):'identity';
          return html(accessPage(mode));
        }
        if(!await editorAccess(request,env))return html(accessPage('login'));
        if(url.searchParams.get('change')==='1')return html(accessPage('change'));
        return html(ADMIN_HTML);
      }
      if(pathname.startsWith('/api/editor/'))return await adminAPI(request,env,url);
      if(pathname.startsWith('/media/')&&['GET','HEAD'].includes(request.method))return await serveMedia(request,env,pathname.slice(7));
      const isPreview=pathname.startsWith('/preview/');
      if(isPreview && !await editorAccess(request,env))return failed(403,'请先输入后台密钥，再查看草稿。');
      const route=pageRoute(isPreview?pathname.slice('/preview'.length):pathname);
      if(route&&['GET','HEAD'].includes(request.method)) {
        // The original pages use relative URLs. Serve each alias from the same root.
        const dto=isPreview?await draft(env.DB):await latest(env.DB);
        const markup=getPage(dto.state,route,isPreview);
        if(markup) {
          return html(request.method==='HEAD'?null:preparePage(markup,pathname));
        }
        if(isPreview||pathname.endsWith('.html')||APP.seed.projects.some(p=>p.slug===route.slug))
          return html('<meta charset="utf-8"><title>项目暂不可用</title><p>这个项目暂不可用。</p><a href="/">返回作品集</a>',404);
      }
      return env.ASSETS?env.ASSETS.fetch(request):new Response('Not found',{status:404});
    } catch(error) {
      console.error('portfolio request failed',pathname,error.message);
      return failed(500,'操作没有完成，请稍后重试。');
    }
  }
};
