const HOME_SECTIONS = ['home-hero','about','contact'];
const HOME_TEXT_FIELDS = {
  intro:'首页简介', about:'关于我', aboutTitle:'关于我标题', aboutEnglish:'关于我英文标题', aboutMeta:'关于我序号',
  aboutName:'姓名', aboutRole:'个人标签', graduate:'毕业信息', portraitAlt:'照片描述',
  contactEyebrow:'联系区英文引言',contactHeading:'联系区标题',contactLabel:'联系区小标题',contactIntro:'联系区说明',resumeLabel:'简历链接文字',
};
const CONTACT_TYPES = {email:'邮箱',phone:'电话',wechat:'微信',link:'网站／社交链接',text:'其他文字'};
function homeRows(settings,defaults) {return settings.aboutRows??defaults.aboutRows;}
function homeContacts(settings,defaults) {
  if(settings.contacts)return settings.contacts;
  return defaults.contacts.map(item=>({...item,value:settings[item.type]??item.value}));
}
function contactURL(item) {
  if(item.type==='email'&&item.value)return 'mailto:'+item.value.trim();
  if(item.type==='phone'&&item.value)return 'tel:'+item.value.replace(/[^\d+*#,;]/g,'');
  if(item.type==='link'&&item.href) {
    try {const url=new URL(item.href);if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password)return url.href;}catch{}
  }
  return '';
}
