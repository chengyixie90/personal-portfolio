import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../',import.meta.url));
const editor = join(root,'editor');
const source = join(root,'public');
const dist = join(root,'dist');
const client = join(dist,'client');
const server = join(dist,'server');
const read = part => readFileSync(join(editor,part),'utf8');
const bundle = JSON.parse(read('site-model.json'));
const reserved = new Set(bundle.seed.projects.map(project=>project.slug));

rmSync(client,{recursive:true,force:true});
mkdirSync(client,{recursive:true});
for(const name of readdirSync(source)) {
  if(name.startsWith('.') || extname(name)==='.html' || reserved.has(name))continue;
  cpSync(join(source,name),join(client,name),{
    recursive:true,
    filter:path=>!path.endsWith('/.DS_Store'),
  });
}
for(const name of [
  'portfolio-blocks.css','portfolio-admin.css','portfolio-admin.js','portfolio-rules.js',
  'portfolio-canvas.js','portfolio-canvas.css','portfolio-scroll.js',
  'portfolio-access.css','portfolio-access.js',
  'portfolio-home.js','portfolio-home.css',
])cpSync(join(editor,name),join(client,name));

const implementation = [
  'const APP = '+JSON.stringify(bundle)+';',
  'const ADMIN_HTML = '+JSON.stringify(read('admin.html'))+';',
  read('portfolio-rules.js'),
  read('portfolio-home.js'),
  read('content-update.js'),
  read('render.js'),
  read('access.js'),
  read('worker.js'),
].join('\n');
mkdirSync(server,{recursive:true});
writeFileSync(join(server,'index.js'),implementation);
writeFileSync(join(server,'wrangler.json'),JSON.stringify({
  name:'portfolio-editor',main:'index.js',compatibility_date:'2026-09-01',
  assets:{directory:'../client',binding:'ASSETS',run_worker_first:true},
},null,2)+'\n');
console.log('Built the portfolio renderer and browser assets.');
