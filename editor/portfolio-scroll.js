(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  window.createPortfolioScroller = (read, write, maximum) => {
    let frame=0, target=0, last=0;
    const cancel=()=>{cancelAnimationFrame(frame);frame=0;};
    const step=now=>{
      const current=read();
      target=Math.max(0,Math.min(maximum(),target));
      const delta=target-current;
      if(Math.abs(delta)<.8) {
        write(target);frame=0;return;
      }
      const elapsed=Math.min(40,Math.max(1,now-last));
      last=now;
      write(current+delta*(1-Math.exp(-elapsed/85)));
      frame=requestAnimationFrame(step);
    };
    return {
      cancel,
      to(value) {
        target=Math.max(0,Math.min(maximum(),value));
        if(reduced.matches) {cancel();write(target);return;}
        if(!frame) {last=performance.now();frame=requestAnimationFrame(step);}
      },
    };
  };
})();
