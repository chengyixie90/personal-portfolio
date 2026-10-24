// Keep the reader's attention on one soundtrack at a time.
const films=document.querySelectorAll('video');films.forEach(video=>video.addEventListener('play',()=>films.forEach(other=>{if(other!==video)other.pause()})));
