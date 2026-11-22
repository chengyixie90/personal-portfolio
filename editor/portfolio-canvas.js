(() => {
  if(window.parent===window)return;
  const origin=location.origin==='null'?new URL(document.baseURI).origin:location.origin;
  const root=document.documentElement;
  const send=(type,payload={})=>parent.postMessage({channel:'portfolio-canvas',type,...payload},origin);
  let mode='edit';
  const pageScroll=createPortfolioScroller(
    ()=>scrollY,
    y=>scrollTo({top:y,behavior:'instant'}),
    ()=>Math.max(0,document.documentElement.scrollHeight-innerHeight)
  );
  function setMode(value) {
    mode=value;
    root.dataset.canvasMode=value;
    for(const el of document.querySelectorAll('[data-canvas-text]')) {
      if(value==='edit') {
        el.setAttribute('contenteditable','plaintext-only');
        el.setAttribute('role','textbox');
        el.setAttribute('aria-label',el.tagName.startsWith('H')?'页面标题':'页面文字');
        el.dataset.canvasPlaceholder=el.classList.contains('contact-item-label')?'':el.tagName.startsWith('H')?'点击添加标题':'点击输入文字';
      } else {
        el.removeAttribute('contenteditable');
        el.removeAttribute('role');
        el.removeAttribute('aria-label');
      }
    }
  }
  function section(target) {
    return target.closest('[data-canvas-block]')?.dataset.canvasBlock ?? null;
  }
  function select(value,scroll) {
    document.querySelector('[data-canvas-selected]')?.removeAttribute('data-canvas-selected');
    if(!value)return;
    const block=document.getElementById(value);
    if(!block?.hasAttribute('data-canvas-block'))return;
    block.setAttribute('data-canvas-selected','');
    if(scroll)pageScroll.to(scrollY+block.getBoundingClientRect().top-readingLine());
  }
  function fieldValue(el,key) {
    const text=el.innerText.replace(/\r\n?/g,'\n').replace(/\n+$/,'');
    return key==='phone'?text.replace(/^电话[：:]\s*/,''):
      key==='email'?text.replace(/\s*↗$/,'').trim():text;
  }
  document.addEventListener('focusin',event=>{
    const el=event.target.closest?.('[data-canvas-text]');
    if(mode==='edit'&&el)send('select',{id:section(el),field:el.dataset.canvasText});
  });
  document.addEventListener('input',event=>{
    const el=event.target.closest?.('[data-canvas-text]');
    if(mode==='edit'&&el)send('text',{id:section(el),field:el.dataset.canvasText,value:fieldValue(el,el.dataset.canvasText)});
  });
  document.addEventListener('click',event=>{
    const target=event.target;
    if(!(target instanceof Element))return;
    const anchor=target.closest('a');
    if(anchor && ['edit','animate'].includes(mode)) {
      event.preventDefault();
      if(mode==='edit')target.closest('[data-canvas-text]')?.focus({preventScroll:true});
      if(mode==='animate') {
        const id=anchor.hash.slice(1);
        if(id)document.getElementById(id)?.scrollIntoView({block:'start'});
        return;
      }
    }
    if(mode!=='edit')return;
    const asset=target.closest('[data-canvas-asset]') ||
      (target.closest('video')?.querySelector('source[data-canvas-asset]'));
    if(asset) {
      event.preventDefault();
      event.stopImmediatePropagation();
      send('asset',{id:section(asset),field:asset.dataset.canvasAsset});
      return;
    }
    const block=section(target);
    if(block)send('select',{id:block});
  },true);
  function readingLine() { return Math.min(innerHeight*.3,220); }
  function sectionAtReadingLine() {
    const line=readingLine();
    const blocks=[...document.querySelectorAll('[data-canvas-block]')];
    const node=blocks.find(block=>block.getBoundingClientRect().bottom>line);
    if(!node)return {};
    const rect=node.getBoundingClientRect();
    return {id:node.dataset.canvasBlock,progress:Math.min(1,Math.max(0,(line-rect.top)/Math.max(1,rect.height)))};
  }
  for(const name of ['wheel','touchmove','pointerdown'])addEventListener(name,()=>{pageScroll.cancel();send('driver');},{passive:true});
  addEventListener('keydown',event=>{
    if(mode==='edit'&&['Enter',' '].includes(event.key)&&event.target.matches('[data-canvas-asset]')) {
      event.preventDefault();send('asset',{id:section(event.target),field:event.target.dataset.canvasAsset});return;
    }
    if(['PageDown','PageUp','Home','End','ArrowDown','ArrowUp',' '].includes(event.key))send('driver');
  });
  let scrollFrame=0;
  addEventListener('scroll',()=>{
    if(scrollFrame)return;
    scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;send('scroll',{y:window.scrollY,...sectionAtReadingLine()});});
  },{passive:true});
  addEventListener('message',event=>{
    const m=event.data;
    if(event.origin!==origin||event.source!==parent||m?.channel!=='portfolio-editor')return;
    if(m.type==='initialize') {
      setMode(m.mode);
      if(m.y)window.scrollTo({top:m.y,behavior:'instant'});
      select(m.id,Boolean(m.jump));
    }
    if(m.type==='patch-text' && typeof m.value==='string') {
      const block=document.getElementById(m.id);
      const node=[...(block?.querySelectorAll('[data-canvas-text]')||[])].find(el=>el.dataset.canvasText===m.field);
      if(node)node.innerText=m.value;
    }
    if(m.type==='mode')setMode(m.mode);
    if(m.type==='view-projects') {
      const work=document.getElementById('work');
      if(work)pageScroll.to(scrollY+work.getBoundingClientRect().top-120);
    }
    if(m.type==='select')select(m.id,m.jump);
    if(m.type==='sync-scroll' && mode==='edit') {
      const node=document.getElementById(m.id);
      if(!node?.hasAttribute('data-canvas-block'))return;
      const rect=node.getBoundingClientRect();
      const top=scrollY+rect.top+Math.min(1,Math.max(0,m.progress||0))*rect.height-readingLine();
      pageScroll.to(top);
      select(m.id,false);
    }
  });
  setMode('edit');
  send('ready');
})();
