import assert from 'node:assert/strict';
import {createPersistence} from '../editor/vercel-store.mjs';
import {createPortfolioHandler} from '../api/site.js';
const blobs=new Map();let seq=0;
class BlobAlreadyExistsError extends Error{}class BlobPreconditionFailedError extends Error{}
const backend={async get(path){const b=blobs.get(path);return b?{statusCode:200,stream:new Blob([b.bytes]).stream(),blob:{etag:b.etag,size:b.bytes.length}}:null;},
async put(path,data,options){const prev=blobs.get(path);if(prev&&!options.allowOverwrite)throw new BlobAlreadyExistsError('already exists');if(options.ifMatch&&options.ifMatch!==prev?.etag)throw new BlobPreconditionFailedError('precondition');const bytes=Buffer.isBuffer(data)?data:Buffer.from(await new Response(data).arrayBuffer());blobs.set(path,{bytes,etag:String(++seq)});return {etag:String(seq)};},
async del(paths){for(const path of [paths].flat())blobs.delete(path);}};
const persistence=createPersistence(backend);
const protectedApp=createPortfolioHandler({persistence,environment:{VERCEL_ENV:'preview',PORTFOLIO_PREVIEW_SETUP:'1'}});
const publicApp=createPortfolioHandler({persistence,environment:{VERCEL_ENV:'production'}});
const key=crypto.randomUUID()+crypto.randomUUID();let cookie='';
const req=(path,method='GET',data,extra={})=>new Request('https://portfolio.test'+path,{method,headers:{origin:'https://portfolio.test',cookie,...extra},...(data?{body:typeof data==='object'&&!Buffer.isBuffer(data)?JSON.stringify(data):data}:{})});
let response=await publicApp(req('/api/editor/auth','POST',{action:'setup',key,confirm:key},{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'vercel-owner@portfolio.invalid'}));
assert.equal(response.status,403,'public requests cannot spoof owner headers');
response=await protectedApp(req('/api/editor/auth','POST',{action:'setup',key,confirm:key}));assert.equal(response.status,200);cookie=response.headers.get('set-cookie').split(';')[0];
let state=await (await publicApp(req('/api/editor/state'))).json();assert.equal(state.uploadChunkBytes,3*1024*1024);
assert.equal(state.draft.state.projects.length,6);
state.draft.state.settings.about='Vercel 持久保存验收';
assert.equal((await publicApp(req('/api/editor/draft','PUT',{revision:0,state:state.draft.state}))).status,200);
const reloadedApp=createPortfolioHandler({persistence:createPersistence(backend),environment:{VERCEL_ENV:'production'}});
assert.equal((await (await reloadedApp(req('/api/editor/state'))).json()).draft.state.settings.about,'Vercel 持久保存验收');
// Concurrent snapshots cannot overwrite one another.
const a=await persistence.open(),b=await persistence.open();await a.DB.prepare("UPDATE portfolio_state SET revision=revision+1 WHERE slot='draft'").run();await b.DB.prepare("UPDATE portfolio_state SET revision=revision+1 WHERE slot='draft'").run();await a.commit();await assert.rejects(()=>b.commit(),BlobPreconditionFailedError);a.close();b.close();
const id=crypto.randomUUID();const bytes=Buffer.alloc(4*1024*1024);bytes.set(Buffer.from([137,80,78,71,13,10,26,10]));
const size=3*1024*1024;
for(let i=0;i<2;i++){response=await publicApp(req('/api/editor/uploads/chunk?id='+id+'&total=2&index='+i,'POST',bytes.subarray(i*size,Math.min(bytes.length,(i+1)*size))));assert.equal(response.status,200);}
response=await publicApp(req('/api/editor/uploads/finish?id='+id+'&total=2&name=large.png&mime=image%2Fpng','POST',{}));assert.equal(response.status,201);const media=await response.json();assert.equal((await publicApp(req(media.url))).status,200);
response=await publicApp(req(media.url,'GET',null,{cookie:''}));assert.equal(response.status,404,'draft upload is private');
const d=await (await publicApp(req('/api/editor/state'))).json();d.draft.state.settings.portrait=media.url;
assert.equal((await publicApp(req('/api/editor/draft','PUT',{revision:d.draft.revision,state:d.draft.state}))).status,200);
assert.equal((await publicApp(req('/api/editor/publish','POST',{revision:d.draft.revision+1,liveRevision:0}))).status,200);
assert.equal((await publicApp(req(media.url,'GET',null,{cookie:'',range:'bytes=0-127'}))).status,206);
assert.ok((await (await publicApp(req('/'))).text()).includes('Vercel 持久保存验收'));
assert.equal([...blobs.keys()].filter(k=>k.startsWith('portfolio/chunks/')).length,0);
assert.equal((await publicApp(req('/api/editor/auth','POST',{action:'logout'}))).status,200);
assert.equal((await publicApp(req('/api/editor/state'))).status,403);
console.log('PASS: private persistent storage, fresh-process reload, conditional writes, protected setup, spoof denial, chunk upload, draft media isolation, publish, byte ranges and logout.');
