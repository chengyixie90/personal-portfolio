(() => {
  'use strict';
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const running = new Set();
  const ease = 'cubic-bezier(.22,1,.36,1)';
  function animate(element, frames, options) {
    if (preference.matches || !element?.animate) return null;
    const animation = element.animate(frames, options);
    running.add(animation);
    animation.finished.catch(() => {}).finally(() => running.delete(animation));
    return animation;
  }
  function enter(element, delay = 0, small = false) {
    if (!element || element.closest('details:not([open])') || element.contains(document.activeElement)) return;
    animate(element, [{opacity:0, transform:small?'scale(.99)':'translateY(14px)'}, {opacity:1, transform:'none'}],
      {duration:small?380:520, delay, easing:ease, fill:'backwards'});
  }
  // Content is visible by default; no hidden CSS classes or permanent inline transforms.
  // Re-enter only after leaving the viewport, never hide a paragraph being read.
  const targets = document.body.classList.contains('flow-page') ? [] : [...document.querySelectorAll('.section-head')];
  if ('IntersectionObserver' in window) {
    const seen = new WeakSet();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !seen.has(entry.target)) {
          seen.add(entry.target);
          enter(entry.target, 0, entry.target.matches('.hero-art'));
        } else if (!entry.isIntersecting) seen.delete(entry.target);
      });
    }, {threshold:0,rootMargin:'0px 0px -15% 0px'});
    targets.forEach(target => observer.observe(target));
  }
  const swaps = new WeakMap();
  function swap(element, update) {
    if (!element || preference.matches || !element.animate) { update(); return; }
    const previous = swaps.get(element);
    previous?.animation?.cancel();
    const state = {};
    swaps.set(element, state);
    state.animation = animate(element, [{opacity:1},{opacity:0}], {duration:100, easing:'ease-out', fill:'forwards'});
    state.animation.finished.then(() => {
      if (swaps.get(element) !== state) return;
      update();
      window.dispatchEvent(new Event('portfolio-layout'));
      state.animation.cancel();
      state.animation = animate(element, [{opacity:0, transform:'translateY(6px)'},{opacity:1, transform:'none'}], {duration:260,easing:ease});
    }).catch(() => {
      if (swaps.get(element) === state && preference.matches) { update(); swaps.delete(element); }
    });
  }
  window.portfolioMotion = {swap, enter};

  const root = document.documentElement;
  // One introductory sequence per document load. Restore original nodes before editing.
  function introduceHero() {
    const copy = document.querySelector('.hero-copy');
    const art = document.querySelector('.hero-art');
    if (!copy || !root.classList.contains('hero-intro-pending') || preference.matches) {
      root.classList.remove('hero-intro-pending'); return;
    }
    const pieces = [copy.querySelector('.hero-kicker'),copy.querySelector('h1'),copy.querySelector('[data-edit="intro"]'),copy.querySelector('.text-link')];
    const restores = [];
    const animations = [];
    let end = 0;
    pieces.forEach((element, group) => {
      if (!element) return;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const texts = [];
      while(walker.nextNode()) texts.push(walker.currentNode);
      let index = 0;
      texts.forEach(node => {
        const original = node.textContent;
        const fragment = document.createElement('span'); fragment.className='char-run';
        const masks = [];
        for (const char of Array.from(original)) {
          if (/\s/.test(char)) { fragment.append(document.createTextNode(char)); continue; }
          const mask = document.createElement('span'); mask.className='char-mask';
          const glyph = document.createElement('span'); glyph.className='char-glyph';glyph.textContent=char;
          mask.append(glyph);fragment.append(mask);masks.push(mask);
          const delay = [0,120,400,610][group] + index++ * (group===1?26:9);
          const animation = animate(glyph,[{transform:'translateY(115%)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:660,delay,easing:ease,fill:'backwards'});
          if(animation)animations.push(animation);
          end = Math.max(end,delay+660);
        }
        node.replaceWith(fragment);
        restores.push(() => { if(fragment.isConnected) fragment.replaceWith(document.createTextNode(original)); });
      });
    });
    // The image starts when the text sequence is almost complete.
    animate(art,[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:850,delay:Math.max(0,end-260),easing:ease,fill:'backwards'});
    root.classList.remove('hero-intro-pending');
    let restored=false;
    const restore = () => {if(restored)return;restored=true;animations.forEach(a=>a.cancel());restores.forEach(fn=>fn());};
    Promise.allSettled(animations.map(a=>a.finished)).then(restore);
    document.querySelector('#edit')?.addEventListener('click',restore,{capture:true,once:true});
  }
  introduceHero();

  // The project cards remain ordinary links: no overlay or navigation delay.
  const clamp = n => Math.max(0, Math.min(1,n));
  const smooth = n => {const t=clamp(n);return t*t*(3-2*t);};
  const header = document.querySelector('header');
  const hero = document.querySelector('.hero-layout');
  const heroParts = hero ? [hero.querySelector('.hero-copy'),hero.querySelector('.hero-art')] : [];
  const variants = [[-54,16,1],[54,16,1],[0,38,.985],[-42,24,1]];
  // Measure the stationary article, move its child; scrolling cannot feed back into geometry.
  const scenes = [...document.querySelectorAll('.grid>article')].map((anchor,i)=>({anchor,element:anchor.querySelector('.project'),variant:variants[i%variants.length]}));
  document.querySelectorAll('.about-grid>div').forEach((element,i)=>scenes.push({anchor:element,element,variant:[i?28:-28,0,1]}));
  const contact = document.querySelector('#contact');
  const contactText = [];
  const contactDecor = [];
  if (contact) {
    const definitions = [
      ['.eyebrow',0,.3],['.contact-line',.1,.56],
      ['.contact-intro>span',.28,.65],['.contact-intro>p',.34,.76],
      ['.contact-details>a',.43,.88],['.contact-details>p',.5,.94],['.resume-block>a',.55,1]
    ];
    definitions.forEach(([selector,start,end])=>{
      contact.querySelectorAll(selector).forEach((element,i)=>{
        const ink=document.createElement('span');ink.className='contact-mask-ink';
        while(element.firstChild)ink.append(element.firstChild);
        element.append(ink);element.classList.add('contact-mask');
        contactText.push({element,ink,start:Math.min(.7,start+i*.08),end:Math.min(1,end+i*.08)});
      });
    });
    [['.contact-arrow',.3,.82,-22,22],['.contact-orbit',.08,1,40,0],['.contact-dot',.24,.9,0,26]].forEach(([selector,start,end,x,y])=>{
      const element=contact.querySelector(selector);if(element)contactDecor.push({element,start,end,x,y});
    });
  }
  let frame=0;
  function updateScroll() {
    frame=0;
    const height=innerHeight;
    const headerHeight=header?.getBoundingClientRect().height||0;
    const pageEnd=Math.max(0,document.documentElement.scrollHeight-height);
    const focused=document.activeElement;
    if(hero){
      const layout=hero.getBoundingClientRect();
      heroParts.forEach((element,i)=>{
        if(!element)return;
        const box=innerWidth<=650?element.getBoundingClientRect():layout;
        const t=preference.matches||element.contains(focused)?0:smooth((headerHeight+20-box.top)/(Math.min(box.height,height)*.74));
        const distance=Math.min(220,innerWidth*.28);
        element.style.translate=`${(i?1:-1)*distance*t}px 0`;
        element.style.opacity=String(1-t);
      });
    }
    scenes.forEach(({anchor,element,variant:[x,y,scale]})=>{
      if(!element||!anchor.getClientRects().length)return;
      const rect=anchor.getBoundingClientRect();
      // About columns move horizontally only, so the top measurement stays stable.
      const top=rect.top+scrollY;
      const start=top-height*.88;
      const end=Math.max(start+1,Math.min(top-headerHeight-height*.16,pageEnd));
      const t=preference.matches||element.contains(focused)?1:smooth((scrollY-start)/(end-start));
      element.style.opacity=String(t);
      element.style.translate=`${x*(1-t)}px ${y*(1-t)}px`;
      element.style.scale=String(scale+(1-scale)*t);
    });
    if(contact){
      const top=contact.getBoundingClientRect().top+scrollY;
      const start=top-height*.72;
      const end=Math.max(start+1,Math.min(top-headerHeight-30,pageEnd));
      const progress=preference.matches?1:clamp((scrollY-start)/(end-start));
      contactText.forEach(({element,ink,start,end})=>{
        const t=preference.matches||element.contains(focused)?1:smooth((progress-start)/(end-start));
        ink.style.transform=`translateY(${110*(1-t)}%)`;
        ink.style.opacity=String(t);
      });
      contactDecor.forEach(({element,start,end,x,y})=>{
        const t=preference.matches?1:smooth((progress-start)/(end-start));
        element.style.opacity=String(t);element.style.transform=`translate(${x*(1-t)}px,${y*(1-t)}px)`;
      });
      contact.style.setProperty('--contact-line-progress',String(smooth(progress)));
    }
  }
  function scheduleScroll(){if(!frame)frame=requestAnimationFrame(updateScroll);}
  addEventListener('scroll',scheduleScroll,{passive:true});addEventListener('resize',scheduleScroll);
  addEventListener('portfolio-layout',scheduleScroll);addEventListener('pageshow',scheduleScroll);
  document.addEventListener('focusin',scheduleScroll);preference.addEventListener('change',scheduleScroll);
  if('ResizeObserver' in window){const resize=new ResizeObserver(scheduleScroll);resize.observe(document.body);}
  scheduleScroll();

  const disclosures = new WeakMap();
  document.querySelectorAll('details.collection').forEach(details => {
    const summary = details.querySelector(':scope>summary');
    if (!summary) return;
    summary.addEventListener('click', event => {
      if (preference.matches || !details.animate) return;
      event.preventDefault();
      const previous = disclosures.get(details);
      const opening = previous ? !previous.opening : !details.open;
      const start = details.getBoundingClientRect().height;
      previous?.animation.cancel();
      details.open = true;
      const styles = getComputedStyle(details);
      const end = opening ? details.getBoundingClientRect().height : summary.getBoundingClientRect().height + parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom) + parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
      const overflow = previous ? previous.overflow : details.style.overflow;
      details.style.overflow = 'hidden';
      const animation = animate(details, [{height:`${start}px`},{height:`${end}px`}], {duration:300,easing:ease});
      const state = {animation,opening,overflow};
      disclosures.set(details,state);
      animation.finished.then(() => {
        if (disclosures.get(details) !== state) return;
        details.open = opening;
        details.style.overflow = overflow;
        disclosures.delete(details);
      }).catch(() => {
        if (disclosures.get(details) !== state) return;
        details.open = opening;
        details.style.overflow = overflow;
        disclosures.delete(details);
      });
    });
  });
  preference.addEventListener('change', () => { if (preference.matches) running.forEach(animation => animation.cancel()); });
})();
