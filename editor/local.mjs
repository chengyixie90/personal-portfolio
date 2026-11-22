import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {existsSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {basename, extname, resolve, sep} from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import worker from '../dist/server/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = resolve(root, 'dist/client');
const testing = process.env.PORTFOLIO_LOCAL_TEST === '1';
const local = resolve(root,'.editor-local');
if(!testing)mkdirSync(resolve(local,'media'),{recursive:true});
const sqlite = new DatabaseSync(testing?':memory:':resolve(local,'portfolio.sqlite'));
if(!sqlite.prepare("SELECT name FROM sqlite_schema WHERE name='portfolio_state'").get()) {
  sqlite.exec(readFileSync(resolve(root,'drizzle/0000_portfolio_editor.sql'),'utf8'));
}
if(!sqlite.prepare("SELECT name FROM sqlite_schema WHERE name='portfolio_editor_auth'").get()) {
  sqlite.exec(readFileSync(resolve(root,'drizzle/0001_editor_access.sql'),'utf8'));
}
const db = {
  prepare(query) {
    const statement=sqlite.prepare(query);
    const withValues=(...values)=>({
      first:async()=>statement.get(...values)??null,
      all:async()=>({results:statement.all(...values)}),
      run:async()=>({meta:{changes:Number(statement.run(...values).changes)}}),
    });
    return {...withValues(),bind:withValues};
  },
};
const memory=new Map();
const bucket = {
  async put(key,data) {
    const bytes=Buffer.from(await data.arrayBuffer());
    if(testing)memory.set(key,bytes);
    else writeFileSync(resolve(local,'media',basename(key)),bytes);
  },
  async get(key,options) {
    const file=resolve(local,'media',basename(key));
    const data=testing?memory.get(key):existsSync(file)?readFileSync(file):null;
    if(!data)return null;
    const range=options?.range;
    return {body:range?data.subarray(range.offset,range.offset+range.length):data};
  },
  async delete(key) {
    if(testing)memory.delete(key);
    else rmSync(resolve(local,'media',basename(key)),{force:true});
  },
};
const MIME={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8',
  '.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.pdf':'application/pdf',
  '.mp4':'video/mp4','.webm':'video/webm','.svg':'image/svg+xml'};
const env = {DB:db, BUCKET:bucket, PORTFOLIO_OWNER_EMAIL:'owner@example.test', ASSETS:{
  async fetch(request) {
    const path=resolve(assets,'.'+decodeURIComponent(new URL(request.url).pathname));
    if(!path.startsWith(assets+sep))return new Response('Not found',{status:404});
    try {
      const bytes=readFileSync(path);
      return new Response(request.method==='HEAD'?null:bytes,{headers:{'content-type':MIME[extname(path)]||'application/octet-stream'}});
    } catch {return new Response('Not found',{status:404});}
  },
}};
const port=parseInt(process.env.PORTFOLIO_EDITOR_PORT ?? '8766',10);
const server=http.createServer(async(req,res)=>{
  const headers=new Headers(req.headers);
  if(!testing||!headers.has('x-editor-test-guest')) {
    headers.set('oai-authenticated-user-id','local-owner');
    headers.set('oai-authenticated-user-email',env.PORTFOLIO_OWNER_EMAIL);
  } else {
    headers.delete('oai-authenticated-user-id');
    headers.delete('oai-authenticated-user-email');
  }
  try {
    const request=new Request('http://127.0.0.1:'+port+req.url,{method:req.method,headers,
      ...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'})});
    const result=await worker.fetch(request,env);
    res.writeHead(result.status,Object.fromEntries(result.headers));
    if(result.body)Readable.fromWeb(result.body).pipe(res);
    else res.end();
  } catch(error) {
    console.error(error);
    res.writeHead(500).end();
  }
});
server.listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port+'/admin'));
