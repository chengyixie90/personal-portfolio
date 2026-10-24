(() => {
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 document.querySelectorAll('[data-gallery]').forEach(track=>{
  const selected=track.id==='flow-carousel',group=selected?track.closest('#visual'):track.closest('.gallery-group'),prev=group.querySelector(selected?'#flow-carousel-prev':'[data-gallery-prev]'),next=group.querySelector(selected?'#flow-carousel-next':'[data-gallery-next]'),count=group.querySelector(selected?'#flow-carousel-count':'[data-gallery-count]');
  const slides=[...track.children],loop=selected||track.id==='suit-carousel'||track.hasAttribute('data-gallery-loop'),pad=n=>String(n).padStart(2,'0');
  const step=()=>slides[0].getBoundingClientRect().width+parseFloat(getComputedStyle(track).columnGap);
  const mod=n=>(n%slides.length+slides.length)%slides.length;
  if(loop){
   function copy(slide,index){const clone=slide.cloneNode(true);clone.dataset.loopClone=String(index);clone.setAttribute('aria-hidden','true');clone.removeAttribute('data-case-reveal');clone.style.removeProperty('opacity');clone.querySelectorAll('button,a,[tabindex]').forEach(e=>e.tabIndex=-1);clone.querySelector('[data-image]').addEventListener('click',()=>slides[index].querySelector('[data-image]').click());return clone;}
   track.prepend(...slides.map(copy));track.append(...slides.map(copy));
  }
  let lastSize=0,ready=false,settleTimer;
  function normalize(){if(!loop||drag?.moved)return;const size=step(),span=slides.length*size;if(track.scrollLeft<span-1||track.scrollLeft>=span*2-1){const left=span+((track.scrollLeft-span)%span+span)%span;track.scrollTo({left,behavior:'instant'});}}
  track.addEventListener('scrollend',normalize);
  function refresh(){const size=step();if(!size)return;const raw=Math.round(track.scrollLeft/size),index=loop?mod(raw):raw,visible=Math.max(1,Math.floor((track.clientWidth+parseFloat(getComputedStyle(track).columnGap))/size+.01));const end=loop?mod(index+visible-1)+1:Math.min(slides.length,index+visible);count.textContent=visible===1?`${pad(index+1)} / ${pad(slides.length)}`:`${pad(index+1)} – ${pad(end)} / ${pad(slides.length)}`;prev.disabled=!loop&&track.scrollLeft<=2;next.disabled=!loop&&track.scrollLeft>=track.scrollWidth-track.clientWidth-2;}

  function move(direction){track.scrollBy({left:direction*step(),behavior:reduced.matches?'instant':'smooth'});}
  prev.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
  track.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey)return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();move(e.key==='ArrowRight'?1:-1);}});
  let raf=0;track.addEventListener('scroll',()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;refresh();clearTimeout(settleTimer);settleTimer=setTimeout(normalize,180);});},{passive:true});
  let drag=null,ignore=0;
  track.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0)drag={id:e.pointerId,x:e.clientX,left:track.scrollLeft,moved:false};});
  track.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const delta=e.clientX-drag.x;if(!drag.moved&&Math.abs(delta)>8){drag.moved=true;track.setPointerCapture(e.pointerId);track.classList.add('is-dragging');}if(drag.moved){e.preventDefault();track.scrollLeft=drag.left-delta;}});
  function release(e){if(!drag||e.pointerId!==drag.id)return;if(drag.moved)ignore=Date.now()+300;if(track.hasPointerCapture(drag.id))track.releasePointerCapture(drag.id);drag=null;track.classList.remove('is-dragging');normalize();refresh();}
  track.addEventListener('pointerup',release);track.addEventListener('pointercancel',release);
  track.addEventListener('dragstart',e=>e.preventDefault());track.addEventListener('click',e=>{if(Date.now()<ignore){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
  function resize(){const size=step();if(loop&&size){const index=ready?mod(Math.round(track.scrollLeft/(lastSize||size))):0;track.scrollTo({left:(slides.length+index)*size,behavior:'instant'});ready=true;lastSize=size;}refresh();}if('ResizeObserver' in window)new ResizeObserver(resize).observe(track);else addEventListener('resize',resize);resize();
 });
})();
