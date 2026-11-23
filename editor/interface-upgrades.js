// Apply shared interface safeguards to both legacy pages and newly created projects.
function upgradeInterface(markup) {
  const theme=markup.includes('king-page')?'#faf8ee':markup.includes('poetry-page')?'#f6f1e7':'#f7f9f7';
  markup=markup.replace('</head>','<meta name="theme-color" content="'+theme+'"><link rel="stylesheet" href="/interface-upgrades.css"><script defer src="/interface-upgrades.js"></script></head>');
  markup=markup.replace(/<body\b[^>]*>/,m=>m+'<a class="skip-link" href="#main-content">跳至主要内容</a>')
    .replace(/<main\b([^>]*)>/,'<main$1 id="main-content" tabindex="-1">');
  return markup.replace(/<img\b[^>]*>/g,tag=>{
    const src=tag.match(/\bsrc="([^"]+)"/)?.[1];
    const path=src?'/'+src.replace(/^\//,'').split('?')[0]:'';
    const size=IMAGE_DIMENSIONS[path];
    if(size){
      if(!/\bwidth=/.test(tag))tag=tag.replace(/\s*\/?>$/,' width="'+size[0]+'"$&');
      if(!/\bheight=/.test(tag))tag=tag.replace(/\s*\/?>$/,' height="'+size[1]+'"$&');
    }
    if(/data-critical-image/.test(tag))tag=tag.replace(/\sloading="[^"]*"/,'').replace(/\s*\/?>$/,' loading="eager" fetchpriority="high"$&');
    return tag;
  });
}
