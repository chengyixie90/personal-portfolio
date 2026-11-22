const FORMATS = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
  video: ['video/mp4', 'video/webm'],
  file: ['application/pdf'],
};
const BLOCKS = {
  text: '正文', image: '图片', split: '图文并排', grid: '图片组',
  gallery: '横向画廊', video: '视频', file: '文件下载', legacy: '原有章节',
};
const CATEGORIES = {content: '内容与叙事', tool: 'Vibe Coding', video: '短视频广告'};
const STYLES = {
  width: {normal:'标准宽度', wide:'通栏'},
  space: {normal:'标准留白', tight:'较紧', loose:'较宽松'},
  ratio: {auto:'原始比例', landscape:'横版 16:9', portrait:'竖版 9:16', square:'方形'},
};
const makeId = () => crypto.randomUUID();
const assetPath = (value) => typeof value === 'string' &&
  (/^\/media\/[a-f0-9-]{36}$/.test(value) ||
   (/^\/(?:assets|documents)\/[\p{L}\p{N}_%. /-]+(?:\?v=[a-z0-9]+)?$/u.test(value) &&
    !decodeURIComponent(value).split('/').some(s=>s === '.' || s === '..') &&
    !/%2f|%5c/i.test(value)));
function makeBlock(type) {
  const id = 'block-' + makeId();
  return {id, type, title:'', text:'', motion:'inherit', width:'normal', space:'normal', ratio:'auto',
    align:'image-left', items:[], src:'', poster:'', caption:'', alt:'', loop:false};
}
function makeProject() {
  const id = makeId();
  return {id, slug:'project-'+id.slice(0,8), title:'新项目', summary:'', category:'content',
    cover:'', state:'hidden', blocks:[makeBlock('text')]};
}
