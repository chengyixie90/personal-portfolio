// Upgrade old saved documents without replacing their edits, settings or uploads.
// The marker persists with the document so later manual sorting/deletion is kept.
const CONTENT_REVISION = 1;
function currentContent(state) {
  if((state.contentRevision??0)>=CONTENT_REVISION)return state;
  const projects=[...state.projects];
  const addition=APP.seed.projects.find(project=>project.id==='liushun');
  if(addition&&!projects.some(project=>project.id===addition.id||project.slug===addition.slug))projects.push(structuredClone(addition));
  const ids=['liuxing','liushun','ads'];
  return {...state,contentRevision:CONTENT_REVISION,projects:[
    ...projects.filter(project=>!ids.includes(project.id)),
    ...ids.flatMap(id=>projects.filter(project=>project.id===id)),
  ]};
}
