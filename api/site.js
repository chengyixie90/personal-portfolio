import {readFileSync} from 'node:fs';
import {extname,resolve,sep} from 'node:path';
import {createHash,timingSafeEqual} from 'node:crypto';
import {createPersistence,isWriteConflict} from '../editor/vercel-store.mjs';
import worker from '../dist/server/index.js';
const MIME={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.pdf':'application/pdf','.mp4':'video/mp4','.webm':'video/webm','.svg':'image/svg+xml','.woff2':'font/woff2'};
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const CHUNK=3*1024*1024,MAX=25*1024*1024;
const hash=value=>createHash('sha256').update(value).digest('hex');
const tokenMatch=(a,b)=>!!a&&!!b&&timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
function assetService(root){const assets=resolve(root,'dist/client');return {async fetch(request){try{const path=resolve(assets,'.'+decodeURIComponent(new URL(request.url).pathname));if(!path.startsWith(assets+sep))return new Response('Not found',{status:404});const data=readFileSync(path);return new Response(request.method==='HEAD'?null:data,{headers:{'content-type':MIME[extname(path)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}};}
export function createPortfolioHandler({persistence=createPersistence(),root=process.cwd(),environment=process.env}={}){
 return async function handle(request){
  const url=new URL(request.url),body=request.body?Buffer.from(await request.arrayBuffer()):null;
  const headers=new Headers(request.headers);
  // Never trust browser-supplied platform identity headers on Vercel.
  for(const name of [...headers.keys()])if(name.startsWith('oai-authenticated-'))headers.delete(name);
  headers.delete('cf-connecting-ip');
  // Vercel overwrites this header at the edge; do not use client X-Forwarded-For.
  const edgeIP=headers.get('x-vercel-forwarded-for');if(edgeIP)headers.set('cf-connecting-ip',edgeIP.split(',')[0].trim());
  const ownerEmail='vercel-owner@portfolio.invalid';
  // Bootstrap/recovery only on Vercel's authenticated Preview deployment.
  if(environment.VERCEL_ENV==='preview'&&environment.PORTFOLIO_PREVIEW_SETUP==='1'){
   headers.set('oai-authenticated-user-id','protected-vercel-owner');headers.set('oai-authenticated-user-email',ownerEmail);
  }
  for(let attempt=0;attempt<4;attempt++){
   const store=await persistence.open(environment.PORTFOLIO_MIGRATION_DATA);
   const env={DB:store.DB,BUCKET:store.BUCKET,PORTFOLIO_OWNER_EMAIL:ownerEmail,ASSETS:assetService(root)};
   const req=()=>new Request(url,{method:request.method,headers,...(body?{body}:{} )});
   let cleanup=[];
   try{
    const migration=url.pathname.startsWith('/api/editor/migration/');
    const chunked=url.pathname.startsWith('/api/editor/uploads/');
    let response;
    if(migration||chunked){
     if(request.method!=='POST')return json({message:'请使用后台上传。'},405);
     if(migration){
      if(!tokenMatch(headers.get('x-portfolio-migration'),environment.PORTFOLIO_MIGRATION_TOKEN))return json({message:'没有迁移权限。'},403);
      if(await store.DB.prepare('SELECT id FROM portfolio_migration WHERE id=1').first())return json({message:'迁移已经完成。'},409);
     }else{
      if(headers.get('origin')!==url.origin)return json({message:'请在本站后台上传。'},403);
      const auth=await worker.fetch(new Request(new URL('/api/editor/state',url),{headers}),env);if(auth.status!==200)return json({message:'请先登录后台。'},403);
     }
     const stage=url.pathname.split('/').at(-1);
     const id=url.searchParams.get('id')||'',total=Number(url.searchParams.get('total'));
     if(stage==='complete'&&migration){
      const rows=await store.DB.prepare('SELECT id,bytes FROM portfolio_media').all();
      for(const meta of rows.results){const item=await persistence.read('portfolio/media/'+meta.id);if(!item||item.bytes.length!==meta.bytes)return json({message:'迁移文件尚未完整。'},409);}
      await store.DB.prepare('INSERT INTO portfolio_migration(id,completed_at) VALUES (1,?)').bind(new Date().toISOString()).run();response=json({ok:true});
     }else{
      if(!/^[a-f0-9-]{36}$/.test(id)||!Number.isInteger(total)||total<1||total>9)return json({message:'上传编号无效。'},400);
      const prefix='portfolio/chunks/'+id+'/';
      if(stage==='chunk'){
       const index=Number(url.searchParams.get('index'));
       if(!Number.isInteger(index)||index<0||index>=total||!body?.length||body.length>CHUNK)return json({message:'上传分片无效。'},400);
       const path=prefix+index;
       const previous=await persistence.read(path);
       if(previous){if(hash(previous.bytes)!==hash(body))return json({message:'分片已在其他窗口更改。'},409);}
       else await persistence.put(path,body,{allowOverwrite:false,contentType:'application/octet-stream'});
       response=json({ok:true,index});
      }else if(stage==='finish'){
       const parts=[];let length=0;
       for(let i=0;i<total;i++){const item=await persistence.read(prefix+i);if(!item)return json({message:'部分图片或视频尚未上传完成，请重试。'},409);parts.push(item.bytes);length+=item.bytes.length;if(length>MAX)return json({message:'文件超过 25 MB。'},413);}
       const data=Buffer.concat(parts);
       if(migration){
        const meta=await store.DB.prepare('SELECT id,mime,bytes FROM portfolio_media WHERE id=?').bind(id).first();
        if(!meta||meta.bytes!==length||hash(data)!==url.searchParams.get('sha256'))return json({message:'迁移文件校验不符。'},400);
        if(!await persistence.read('portfolio/media/'+id))await store.BUCKET.put(id,new Blob([data]),{httpMetadata:{contentType:meta.mime}});
        response=json({ok:true});
       }else{
        const target=new URL('/api/editor/media',url);target.searchParams.set('name',url.searchParams.get('name')||'新素材');
        const uploadHeaders=new Headers(headers);uploadHeaders.set('content-type',url.searchParams.get('mime')||'application/octet-stream');uploadHeaders.delete('content-length');
        response=await worker.fetch(new Request(target,{method:'POST',headers:uploadHeaders,body:data}),env);
       }
       if(response.ok)cleanup=Array.from({length:total},(_,i)=>prefix+i);
      }else return json({message:'没有此上传操作。'},404);
     }
    }else response=await worker.fetch(req(),env);
    if(response.status>=500){await store.rollbackMedia();return response;}
    await store.commit();
    if(cleanup.length)await persistence.remove(cleanup).catch(()=>{});
    if(url.pathname==='/api/editor/state'&&response.ok){const data=await response.json();data.uploadChunkBytes=CHUNK;return json(data);}
    if(url.pathname==='/admin'&&response.headers.get('content-type')?.includes('text/html')&&environment.VERCEL_ENV!=='preview'){
     let html=await response.text();
     if(environment.PORTFOLIO_RECOVERY_URL){html=html.replace('网站所有者的 ChatGPT 账号','网站所有者的 Vercel 账号').replace('/signin-with-chatgpt?return_to=%2Fadmin%3Frecover%3D1',environment.PORTFOLIO_RECOVERY_URL);}
     return new Response(html,{status:response.status,headers:response.headers});
    }
    return response;
   }catch(error){await store.rollbackMedia();if(isWriteConflict(error)&&attempt<3)continue;console.error('portfolio storage request failed',error.name);return json({message:isWriteConflict(error)?'另一个窗口正在保存，请稍后重试。':'保存或读取没有完成，请稍后重试。'},isWriteConflict(error)?409:503);}
   finally{store.close();}
  }
 };
}
const app=createPortfolioHandler();
export default async function site(req,res){
 try{
  const host=req.headers.host,url=new URL(req.url,'https://'+host);
  const routed=url.searchParams.get('__portfolio_path');if(routed!==null){url.pathname='/'+routed;url.searchParams.delete('__portfolio_path');}
  const chunks=[];let length=0;
  for await(const chunk of req){length+=chunk.length;if(length>CHUNK+512*1024){res.writeHead(413,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({message:'请通过后台分片上传大文件。'}));return;}chunks.push(chunk);}
  const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
  const result=await app(new Request(url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})}));
  const replyHeaders=Object.fromEntries(result.headers);if(result.headers.getSetCookie?.().length)replyHeaders['set-cookie']=result.headers.getSetCookie();
  res.writeHead(result.status,replyHeaders);res.end(result.body?Buffer.from(await result.arrayBuffer()):undefined);
 }catch(error){console.error('portfolio handler failed',error.name);res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({message:'网站暂时无法读取，请稍后重试。'}));}
}
