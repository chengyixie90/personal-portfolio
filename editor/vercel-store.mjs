import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import * as cloud from '@vercel/blob';
const DB_PATH='portfolio/database.sqlite';
export function createPersistence(backend=cloud,root=process.cwd()) {
 const read=async path=>{const result=await backend.get(path,{access:'private',useCache:false});return result?.statusCode===200?{bytes:Buffer.from(await new Response(result.stream).arrayBuffer()),etag:result.blob.etag,size:result.blob.size}:null;};
 const put=(path,body,options={})=>backend.put(path,body,{access:'private',addRandomSuffix:false,...options});
 async function open(seed=process.env.PORTFOLIO_MIGRATION_DATA) {
  const previous=await read(DB_PATH),file=join('/tmp','portfolio-'+randomUUID()+'.sqlite');
  if(previous)writeFileSync(file,previous.bytes);
  const sqlite=new DatabaseSync(file);let dirty=false;
  if(!sqlite.prepare("SELECT name FROM sqlite_schema WHERE name='portfolio_state'").get()){
   for(const name of ['0000_portfolio_editor.sql','0001_editor_access.sql'])sqlite.exec(readFileSync(join(root,'drizzle',name),'utf8'));
   dirty=true;
  }
  if(seed&&!sqlite.prepare('SELECT 1 FROM portfolio_state LIMIT 1').get()&&!sqlite.prepare('SELECT 1 FROM portfolio_releases LIMIT 1').get()){
   dirty=true;
    const data=JSON.parse(gunzipSync(Buffer.from(seed,'base64')).toString());
    if(data.format!=='portfolio-transfer-v1')throw Error('Invalid migration format');
    if(data.draft?.state)sqlite.prepare("INSERT INTO portfolio_state(slot,revision,content,saved_at) VALUES ('draft',?,?,?)").run(data.draft.revision||1,JSON.stringify(data.draft.state),data.draft.savedAt||new Date().toISOString());
    for(const row of data.releases||[])sqlite.prepare('INSERT INTO portfolio_releases(revision,content,saved_at) VALUES (?,?,?)').run(row.revision,row.content,row.saved_at);
    // The source may have a code-level content update not yet persisted in its release row.
    if(data.live?.state){const rev=data.live.revision||0;const raw=JSON.stringify(data.live.state);const stamp=data.live.savedAt||new Date().toISOString();
     if(rev>0)sqlite.prepare('INSERT INTO portfolio_releases(revision,content,saved_at) VALUES (?,?,?) ON CONFLICT(revision) DO UPDATE SET content=excluded.content').run(rev,raw,stamp);
     else sqlite.prepare('INSERT INTO portfolio_releases(revision,content,saved_at) VALUES (1,?,?)').run(raw,stamp);
    }
    for(const row of data.media||[])sqlite.prepare('INSERT INTO portfolio_media(id,name,mime,bytes,created_at) VALUES (?,?,?,?,?)').run(row.id,row.name,row.mime,row.bytes,row.created_at);
  }
  if(!sqlite.prepare("SELECT name FROM sqlite_schema WHERE name='portfolio_migration'").get()){sqlite.exec('CREATE TABLE portfolio_migration (id INTEGER PRIMARY KEY, completed_at TEXT NOT NULL)');dirty=true;}
  const DB={prepare(query){const statement=sqlite.prepare(query);const values=(...args)=>({
   first:async()=>{if(!/^\s*SELECT\b/i.test(query))dirty=true;return statement.get(...args)??null;},
   all:async()=>({results:statement.all(...args)}),
   run:async()=>{dirty=true;return {meta:{changes:Number(statement.run(...args).changes)}};},
  });return {...values(),bind:values};}};
  const created=[];
  const BUCKET={
   async put(id,data,options){const body=Buffer.from(await data.arrayBuffer());await put('portfolio/media/'+id,body,{allowOverwrite:false,contentType:options?.httpMetadata?.contentType||'application/octet-stream'});created.push(id);},
   async get(id,options){const item=await read('portfolio/media/'+id);if(!item)return null;const r=options?.range;return {body:r?item.bytes.subarray(r.offset,r.offset+r.length):item.bytes};},
   async delete(id){await backend.del('portfolio/media/'+id);},
  };
  return {DB,BUCKET,sqlite,
   async commit(){if(dirty)await put(DB_PATH,readFileSync(file),{allowOverwrite:!!previous,...(previous?{ifMatch:previous.etag}:{}),contentType:'application/vnd.sqlite3'});},
   async rollbackMedia(){for(const id of created)await backend.del('portfolio/media/'+id).catch(()=>{});},
   close(){sqlite.close();rmSync(file,{force:true});},
  };
 }
 return {open,read,put,remove:paths=>backend.del(paths)};
}
export function isWriteConflict(error){return ['BlobPreconditionFailedError','BlobAlreadyExistsError'].includes(error?.constructor?.name)||/precondition|already exists/i.test(error?.message||'');}
