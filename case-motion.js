(() => {
  'use strict';
  if (!document.body.classList.contains('flow-page')) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const states = new Map();
  const selectors = [".chapter-title", ".king-photo-intro", "#poetry-photo-carousel,.poetry-digital-grid>figure", ".case-heading .eyebrow,.case-heading h1,.case-deck,.case-summary", ".chapter-copy>p,.chapter-copy>.editable-note,.lead-copy>span,.lead-copy>p,.lead-copy>a,.case-closing>span,.case-closing>h3,.case-closing>p", ".case-facts>div,.role-note,.selected-heading,.production-heading,.material-heading,.process-strip,.reading-chain", ".visual-principles>div,.work-chain>div,.workflow-grid>article,.project-result>div,.king-result>div", ".excerpt>span,.excerpt>h3,.excerpt>blockquote,.excerpt>p,.guide-info>span,.guide-info>h3,.guide-info>p,.opening-note>span,.opening-note>h2,.opening-note>p,.film-label>span,.film-label>h2,.film-label>p,.film-caption>span,.film-caption>h3,.film-caption>p,.demo-video>div>span,.demo-video>div>h3,.demo-video>div>p,.story-ending>span,.story-ending>p", ".decision-note,.guide-samples>article,.story-columns>div,.story-full>p,.spread-stage,.spread-description", ".coaster-group>.product-label", ".coaster-group>figure", ".product-group:not(.coaster-group)>.product-label>h3,.product-group:not(.coaster-group)>.product-label>p", ".physical-lead>figure,.case-opening>figure,.king-opening>figure", ".editorial-pair>figure,.guide-panel>.guide-preview", ".material-grid>figure,.film-thumbs>a,#suit-carousel", "#flow-carousel", ".physical-grid>figure,.paired-gallery>figure,.digital-grid>figure,.proposal-pairs>figure,.overview-grid>figure,.update-gallery>figure"];
  selectors.forEach(selector=>document.querySelectorAll(selector).forEach(element=>{
    if (states.has(element) || element.closest('dialog') || element.querySelector('video')) return;
    states.set(element,{element,progress:0,done:false});
    element.dataset.caseReveal='pending';
  }));
  const clamp=n=>Math.max(0,Math.min(1,n));
  const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
  function settle(state) {
    state.done=true;state.progress=1;
    state.element.style.removeProperty('opacity');
    state.element.dataset.caseReveal='done';
  }
  let frame=0;
  function update() {
    frame=0;
    const height=innerHeight;
    const nav=document.querySelector('.case-nav');
    const navBottom=nav?.getBoundingClientRect().bottom||0;
    const headerBottom=document.querySelector('header')?.getBoundingClientRect().bottom||0;
    const readingLine=Math.max(height*.58,headerBottom+24,Math.min(navBottom,headerBottom+70)+24);
    const startLine=Math.max(readingLine+60,height*.94);
    const focused=document.activeElement;
    states.forEach(state=>{
      if(state.done)return;
      const element=state.element;
      if(element.closest('details:not([open]),.hide')||!element.getClientRects().length)return;
      if(reduced.matches||element.contains(focused)||element.isContentEditable){settle(state);return;}
      const box=element.getBoundingClientRect();
      // Scroll distance alone controls opacity. The text never moves or gets clipped.
      const progress=Math.max(state.progress,clamp((startLine-box.top)/(startLine-readingLine)));
      state.progress=progress;
      if(progress>=1){settle(state);return;}
      element.style.opacity=String(smooth(progress));
      element.dataset.caseReveal=progress>0?'revealing':'pending';
    });
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(update);}
  addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);
  addEventListener('pageshow',schedule);addEventListener('portfolio-layout',schedule);
  document.addEventListener('focusin',schedule);
  document.querySelector('#flow-edit')?.addEventListener('click',()=>states.forEach(settle),{capture:true});
  document.querySelectorAll('details.collection').forEach(details=>details.addEventListener('toggle',schedule));
  reduced.addEventListener('change',()=>{if(reduced.matches)states.forEach(settle);else schedule();});
  if('ResizeObserver' in window)new ResizeObserver(schedule).observe(document.body);
  // Tab selection can reveal content without changing the document's total height.
  if('MutationObserver' in window)new MutationObserver(schedule).observe(document.querySelector('main'),{subtree:true,attributes:true,attributeFilter:['class','open']});
  schedule();

})();
