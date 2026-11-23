(() => {
  const filters=[...document.querySelectorAll('[data-filter]')];
  const languages=[...document.querySelectorAll('[data-guide]')];
  function applyURL(){
    const params=new URL(location.href).searchParams;
    const filter=params.get('category')||'all';
    const language=params.get('guide')||'cn';
    filters.find(b=>b.dataset.filter===filter)?.click();
    languages.find(b=>b.dataset.guide===language)?.click();
  }
  applyURL();
  function remember(key,value,defaultValue){
    const url=new URL(location.href);
    if(value===defaultValue)url.searchParams.delete(key);else url.searchParams.set(key,value);
    if(url.href!==location.href)history.pushState(null,'',url);
  }
  filters.forEach(b=>b.addEventListener('click',()=>remember('category',b.dataset.filter,'all')));
  languages.forEach(b=>b.addEventListener('click',()=>remember('guide',b.dataset.guide,'cn')));
  addEventListener('popstate',applyURL);
})();
