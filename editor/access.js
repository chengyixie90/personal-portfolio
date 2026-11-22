const SESSION_SECONDS = 8 * 60 * 60;
const KEY_ITERATIONS = 100_000;
const hex = bytes => [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
const randomHex = length => hex(crypto.getRandomValues(new Uint8Array(length)));
const utf8 = value => new TextEncoder().encode(value);
const hashToken = async value => hex(await crypto.subtle.digest('SHA-256',utf8(value)));
const keyConfig = env => env.DB.prepare("SELECT salt,digest,key_version FROM portfolio_editor_auth WHERE slot='owner'").first();
const cookieName = request => new URL(request.url).protocol==='https:'?'__Host-portfolio_editor':'portfolio_editor_local';
function sessionToken(request) {
  const value=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName(request)+'='))?.split('=')[1];
  return /^[a-f0-9]{64}$/.test(value||'')?value:null;
}
function sessionCookie(request,token,seconds=SESSION_SECONDS) {
  return cookieName(request)+'='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+seconds+
    (new URL(request.url).protocol==='https:'?'; Secure':'');
}
async function keyDigest(key,salt) {
  const material=await crypto.subtle.importKey('raw',utf8(key),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:utf8(salt),iterations:KEY_ITERATIONS},material,256));
}
function equalDigest(a,b) {
  let diff=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}
async function editorAccess(request,env) {
  const token=sessionToken(request);
  if(!token)return false;
  const row=await env.DB.prepare(`SELECT s.expires_at FROM portfolio_editor_sessions s
    JOIN portfolio_editor_auth a ON a.slot='owner' AND a.key_version=s.key_version
    WHERE s.token_hash=? AND s.expires_at>?`).bind(await hashToken(token),Date.now()).first();
  return Boolean(row);
}
async function issueSession(request,env,config) {
  const token=randomHex(32),now=Date.now();
  await env.DB.prepare('DELETE FROM portfolio_editor_sessions WHERE expires_at<=?').bind(now).run();
  const result=await env.DB.prepare(`INSERT INTO portfolio_editor_sessions(token_hash,key_version,expires_at)
    SELECT ?,?,? FROM portfolio_editor_auth WHERE slot='owner' AND key_version=? AND digest=?`)
    .bind(await hashToken(token),config.key_version,now+SESSION_SECONDS*1000,config.key_version,config.digest).run();
  if(result.meta.changes!==1)return failed(409,'密钥已在另一个窗口更新，请重新登录。');
  return Response.json({ok:true},{headers:{...NO_STORE,'set-cookie':sessionCookie(request,token)}});
}
async function allowKeyAttempt(request,env) {
  const windowMs=15*60*1000,now=Date.now(),window=Math.floor(now/windowMs);
  // CF-Connecting-IP is set by the hosting edge, not a forwarded client value.
  const ip=request.headers.get('cf-connecting-ip')||'unknown';
  const buckets=[['global:'+window,100],['ip:'+await hashToken(ip)+':'+window,10]];
  await env.DB.prepare('DELETE FROM portfolio_editor_attempts WHERE expires_at<=?').bind(now).run();
  for(const [bucket,limit] of buckets) {
    const row=await env.DB.prepare(`INSERT INTO portfolio_editor_attempts(bucket,attempts,expires_at) VALUES (?,1,?)
      ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts`)
      .bind(bucket,(window+1)*windowMs).first();
    if(row.attempts>limit)return false;
  }
  return true;
}
async function accessAPI(request,env,url) {
  if(request.method!=='POST')return failed(405,'请在登录页面操作。');
  if(request.headers.get('origin')!==url.origin)return failed(403,'请在本站登录。');
  const reader=request.body?.getReader();
  if(!reader)return failed(400,'没有收到登录信息。');
  const chunks=[];let size=0;
  for(;;) {
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;
    if(size>4096){await reader.cancel();return failed(413,'登录信息过长。');}
    chunks.push(value);
  }
  let input;
  try{input=JSON.parse(await new Blob(chunks).text());}catch{return failed(400,'登录信息无效。');}
  if(!input||typeof input!=='object')return failed(400,'登录信息无效。');
  if(input.action==='logout') {
    const token=sessionToken(request);
    if(token)await env.DB.prepare('DELETE FROM portfolio_editor_sessions WHERE token_hash=?').bind(await hashToken(token)).run();
    return Response.json({ok:true},{headers:{...NO_STORE,'set-cookie':sessionCookie(request,'',0)}});
  }
  const config=await keyConfig(env);
  if(input.action==='setup'||input.action==='reset'||input.action==='change') {
    // Existing hosting identity is retained as the recovery/bootstrap boundary.
    if(input.action==='change') {
      if(!config||!await editorAccess(request,env))return failed(403,'请先登录后台。');
      if(!await allowKeyAttempt(request,env))return failed(429,'尝试次数过多，请 15 分钟后再试。');
      if(typeof input.oldKey!=='string'||input.oldKey.length>256||!equalDigest(await keyDigest(input.oldKey,config.salt),config.digest))
        return failed(401,'当前密钥不正确。');
    } else if(!owner(request,env))return failed(403,'请先使用网站所有者账号确认身份。');
    if(input.action==='setup'&&config)return failed(409,'密钥已设置，请返回登录。');
    if(input.action==='reset'&&!config)return failed(409,'请先设置密钥。');
    if(typeof input.key!=='string'||input.key.length<12||input.key.length>256||!input.key.trim())
      return failed(400,'请设置 12–256 个字符的密钥。');
    if(input.key!==input.confirm)return failed(400,'两次输入的密钥不一致。');
    const salt=randomHex(16),digest=await keyDigest(input.key,salt);
    const next={salt,digest,key_version:(config?.key_version||0)+1};
    const result=config?await env.DB.prepare(`UPDATE portfolio_editor_auth SET salt=?,digest=?,key_version=key_version+1,changed_at=?
      WHERE slot='owner' AND key_version=?`).bind(salt,digest,isoDate(),config.key_version).run():
      await env.DB.prepare("INSERT OR IGNORE INTO portfolio_editor_auth(slot,salt,digest,key_version,changed_at) VALUES ('owner',?,?,1,?)")
        .bind(salt,digest,isoDate()).run();
    if(result.meta.changes!==1)return failed(409,'密钥已在另一个窗口设置，请重新登录。');
    await env.DB.prepare('DELETE FROM portfolio_editor_sessions').run();
    return issueSession(request,env,next);
  }
  if(input.action!=='login')return failed(400,'登录操作无效。');
  if(!await allowKeyAttempt(request,env))return failed(429,'尝试次数过多，请 15 分钟后再试。');
  if(typeof input.key!=='string'||input.key.length>256)return failed(400,'密钥格式有误。');
  // Use a dummy derivation when setup is incomplete to avoid a fast key probe.
  const digest=await keyDigest(input.key,config?.salt||'unconfigured-portfolio-key');
  if(!config||!equalDigest(digest,config.digest))return failed(401,'密钥不正确，请重新输入。');
  return issueSession(request,env,config);
}
function accessPage(mode) {
  const setup=mode==='setup',change=mode==='change',reset=mode==='reset'||change,identity=mode==='identity';
  const title=setup?'设置后台密钥':change?'修改后台密钥':reset?'重新设置密钥':identity?'确认网站所有者':'进入作品集后台';
  const message=setup?'首次进入，请设置一份只有你知道的密钥。':reset?'设置新密钥后，其他设备上的后台登录会同时失效。':
    identity?'首次设置或重设密钥，需要用网站所有者的 ChatGPT 账号确认身份。':'输入密钥，继续编辑你的作品集。';
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="robots" content="noindex,nofollow"><title>'+title+'</title><link rel="stylesheet" href="/portfolio-access.css">'+
    (identity?'':'<script src="/portfolio-access.js" defer></script>')+'</head><body><header><a class="brand" href="/">谢易宸 <span>PORTFOLIO</span></a></header>'+
    '<main><p class="eyebrow">PERSONAL WORKSPACE</p><h1>'+title+'</h1><p class="intro">'+message+'</p>'+
    (identity?'<a class="primary" target="_top" href="/signin-with-chatgpt?return_to=%2Fadmin%3Frecover%3D1">确认所有者身份</a>':
      '<form data-action="'+(setup?'setup':change?'change':reset?'reset':'login')+'">'+
      (change?'<label for="old-key">当前密钥</label><input id="old-key" name="old-key" type="password" autocomplete="current-password" maxlength="256" required>':'')+
      '<label for="key">'+(setup||reset?'新密钥':'后台密钥')+'</label>'+
      '<div class="key-field"><input id="key" name="key" type="password" autocomplete="'+(setup||reset?'new-password':'current-password')+'" '+(setup||reset?'minlength="12" ':'')+'maxlength="256" required><button type="button" id="show-key" aria-controls="key" aria-pressed="false">显示</button></div>'+
      (setup||reset?'<label for="confirm">再次输入密钥</label><input id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="256" required><p class="hint">至少 12 个字符。建议使用随机密钥，并保存到密码管理器。</p>':'')+
      '<p id="message" role="status" aria-live="polite"></p><button class="primary" type="submit">'+(setup?'设置并进入后台':reset?'更新并进入后台':'进入后台')+'</button></form>')+
    '<div class="links"><a href="/">返回作品集</a>'+(!setup&&!identity?'<a href="'+(reset?'/admin':'/admin?recover=1')+'">'+(reset?'返回登录':'忘记密钥？')+'</a>':'')+'</div>'+
    '</main><footer>谢易宸 · 个人作品集</footer></body></html>';
}
