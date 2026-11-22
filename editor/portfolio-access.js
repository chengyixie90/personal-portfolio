'use strict';
const form=document.querySelector('form');
const key=document.getElementById('key');
const confirmKey=document.getElementById('confirm');
const message=document.getElementById('message');
document.getElementById('show-key').addEventListener('click',event=>{
  const show=key.type==='password';
  key.type=show?'text':'password';
  if(confirmKey)confirmKey.type=key.type;
  event.currentTarget.textContent=show?'隐藏':'显示';
  event.currentTarget.setAttribute('aria-pressed',String(show));
});
form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(confirmKey&&confirmKey.value!==key.value){message.textContent='两次输入的密钥不一致。';confirmKey.focus();return;}
  const submit=form.querySelector('[type="submit"]');
  submit.disabled=true;message.textContent='正在确认…';
  try {
    const res=await fetch('/api/editor/auth',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({action:form.dataset.action,key:key.value,confirm:confirmKey?.value,oldKey:document.getElementById('old-key')?.value})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.message||'无法登录，请稍后再试。');
    form.reset();location.replace('/admin');
  }catch(error){message.textContent=error.message;submit.disabled=false;}
});
