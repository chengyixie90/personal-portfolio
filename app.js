const projects=['FLOW TAROT / 浮落','《缥缈诗篇》','《国王剧场》','短视频广告项目'];
const fields=['从哪里开始','我负责的部分','从想法到作品','作品与素材','完成与继续'];
let editing=false,current=-1,detailEditing=false;
const storageKey='portfolio-draft-flow-v3';let saved={};

saved={...portfolioDefaults,...saved};
if(saved.about==="我关注文字如何建立叙事，也关注内容如何成为可以交付的作品。在米奥哈工作室的文案编辑实习中，我参与塔罗项目的说明书撰写、排版与上线对接；在个人项目 FLOW 中，我独立推进从主题构思、卡牌绘画到生产落地的全过程。")saved.about="关注文字如何建立叙事，也关注内容如何成为可以交付的作品。在米奥哈工作室的文案编辑实习中，参与塔罗项目的说明书撰写、排版与上线对接；在个人项目 FLOW 中，独立推进从主题构思、卡牌绘画到生产落地的全过程。";
if(typeof saved.intro==='string')saved.intro=saved.intro.replace(/^我是谢易宸[。．，,]?\s*/, '');
document.querySelectorAll('[data-edit]').forEach(el=>{if(saved[el.dataset.edit])el.textContent=saved[el.dataset.edit];});
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});(window.portfolioMotion?.swap||((el,fn)=>fn()))(document.querySelector('.grid'),()=>document.querySelectorAll('.grid>article').forEach(x=>x.classList.toggle('hide',b.dataset.filter!=='all'&&x.dataset.category!==b.dataset.filter)))});
