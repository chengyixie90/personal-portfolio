"""Refresh the original-page data used by the Node-based deployment build."""
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
EDITOR = ROOT / 'editor'
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

class Element:
    def __init__(self, tag, attrs, start, inner):
        self.tag, self.attrs, self.start, self.inner = tag, dict(attrs), start, inner
        self.end = self.close = inner
        self.children = []

    def descendants(self):
        for child in self.children:
            yield child
            yield from child.descendants()

    def classes(self):
        return self.attrs.get('class', '').split()

class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.lines = [0] + [m.end() for m in re.finditer('\n', source)]
        self.root = Element('', [], 0, 0)
        self.stack = [self.root]
        self.feed(source)
        self.close()

    def position(self):
        line, column = self.getpos()
        return self.lines[line - 1] + column

    def add_element(self, tag, attrs, self_closing=False):
        start = self.position()
        node = Element(tag, attrs, start, start + len(self.get_starttag_text()))
        self.stack[-1].children.append(node)
        if not self_closing and tag not in VOID:
            self.stack.append(node)

    def handle_starttag(self, tag, attrs):
        self.add_element(tag, attrs)

    def handle_startendtag(self, tag, attrs):
        self.add_element(tag, attrs, True)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            node = self.stack[i]
            if node.tag == tag:
                node.close = self.position()
                node.end = self.source.index('>', node.close) + 1
                del self.stack[i:]
                return

    def raw(self, node):
        return self.source[node.start:node.end]

    def plain(self, node):
        value = re.sub(r'<br\s*/?>', '\n', self.source[node.inner:node.close], flags=re.I)
        return unescape(re.sub(r'<[^>]+>', '', value)).strip()

def replace_ranges(source, edits):
    for start, end, value in sorted(edits, reverse=True):
        source = source[:start] + value + source[end:]
    return source

def one(nodes, predicate):
    return next(n for n in nodes if predicate(n))

def inject_css(head, gallery=False):
    galleries = '<link rel="stylesheet" href="/galleries.css">' if gallery and 'galleries.css' not in head else ''
    return head.replace('</head>', galleries + '<link rel="stylesheet" href="/portfolio-blocks.css"></head>')

defaults = json.loads((PUBLIC / 'content.js').read_text().split('=', 1)[1].strip().rstrip(';'))
configs = [
    ('poetry', '缥缈诗篇', 'content', 'assets/poetry-cover.webp'),
    ('flow', 'FLOW TAROT / 浮落', 'content', 'assets/flow.webp'),
    ('king', '国王剧场', 'content', 'assets/king-cover.webp'),
    ('liuxing', '流形 · 原创塔罗与记录', 'tool', 'assets/liuxing-home-hd.png'),
    ('liushun', '留瞬 · 个人卡牌收藏', 'tool', 'assets/liushun-home.jpg'),
    ('ads', '短视频广告项目', 'video', 'assets/ad30-poster.webp'),
]
home = Page((PUBLIC / 'index.html').read_text())
nodes = list(home.root.descendants())
grid = one(nodes, lambda n: 'grid' in n.classes())
work = one(nodes, lambda n: n.attrs.get('id') == 'work')
count = one(nodes, lambda n: n.tag == 'sup')
work_count = one(one(work.children, lambda n: 'section-head' in n.classes()).children, lambda n: n.tag == 'span')
intro = one(nodes, lambda n: n.attrs.get('data-edit') == 'intro')
about = one(nodes, lambda n: n.attrs.get('data-edit') == 'about')
resume = one(nodes, lambda n: n.tag == 'a' and n.attrs.get('href','').startswith('documents/'))
email = one(nodes, lambda n: n.tag == 'a' and n.attrs.get('href','').startswith('mailto:'))
phone = one(nodes, lambda n: n.tag == 'p' and home.plain(n).startswith('电话：'))
about_section = one(nodes, lambda n: n.attrs.get('id') == 'about')
contact_section = one(nodes, lambda n: n.attrs.get('id') == 'contact')
about_nodes = list(about_section.descendants())
contact_nodes = list(contact_section.descendants())
about_heading = one(about_nodes, lambda n: n.tag == 'h2')
about_english = one(about_heading.children, lambda n: n.tag == 'em')
about_head = one(about_section.children, lambda n: 'section-head' in n.classes())
signature = one(about_nodes, lambda n: 'portrait-signature' in n.classes())
photo = one(about_nodes, lambda n: n.tag == 'img')
about_rows = [n for n in about_nodes if 'about-row' in n.classes()]
contact_intro = one(contact_nodes, lambda n: 'contact-intro' in n.classes())
home_template = inject_css(replace_ranges(home.source, [
    (grid.inner, grid.close, '%%CARDS%%'), (count.inner, count.close, '%%COUNT%%'),
    (work_count.inner, work_count.close, '%%RANGE%%'),
    (intro.start,intro.end,'%%HOME-intro%%'),
    (about_section.start,about_section.end,'%%ABOUT%%'),
    (contact_section.start,contact_section.end,'%%CONTACT%%'),
]))
home_fields = {'intro':home.raw(intro)}
home_values = {'intro':home.plain(intro),'about':home.plain(about),'email':email.attrs['href'][7:],'phone':home.plain(phone)[3:].strip(),'resume':'/'+resume.attrs['href']}
home_values.update({
    'portrait':'/'+photo.attrs['src'], 'portraitAlt':photo.attrs.get('alt','个人照片'),
    'aboutTitle':unescape(re.sub(r'<[^>]+>','',home.source[about_heading.inner:about_english.start])).strip(),
    'aboutEnglish':home.plain(about_english),
    'aboutMeta':home.plain(one(about_head.children, lambda n:n.tag=='span')),
    'aboutName':home.plain(one(signature.children, lambda n:n.tag=='strong')),
    'aboutRole':home.plain(one(signature.children, lambda n:n.tag=='p')),
    'graduate':home.plain(one(about_nodes, lambda n:'about-graduate' in n.classes())),
    'aboutRows':[{'id':'about-info-'+str(i+1),'label':home.plain(one(row.children,lambda n:n.tag=='span')),
                  'text':home.plain(one(row.children,lambda n:n.tag=='p'))} for i,row in enumerate(about_rows)],
    'contactEyebrow':home.plain(one(contact_section.children,lambda n:'eyebrow' in n.classes())),
    'contactHeading':'\n'.join(home.plain(n) for n in contact_nodes if 'contact-line' in n.classes()),
    'contactLabel':home.plain(one(contact_intro.children,lambda n:n.tag=='span')),
    'contactIntro':home.plain(one(contact_intro.children,lambda n:n.tag=='p')),
    'resumeLabel':home.plain(resume).replace('↗','').strip(),
    'contacts':[{'id':'contact-email','type':'email','label':'','value':home_values['email'],'href':''},
                {'id':'contact-phone','type':'phone','label':'电话','value':home_values['phone'],'href':''}],
})

legacy = {}
projects = []
for slug, title, category, image in configs:
    card = one(grid.children, lambda n: n.tag == 'article' and any(x.attrs.get('href')==slug+'.html' for x in n.children))
    card_anchor = card.children[0]
    summary = home.plain(card_anchor.children[-1])
    page = Page((PUBLIC / (slug+'.html')).read_text())
    main = one(page.root.descendants(), lambda n:n.tag=='main')
    sections = [n for n in main.children if n.tag=='section']
    nav = one(main.children,lambda n:n.tag=='nav')
    stored = {}
    for section in sections:
        id_ = section.attrs['id']
        descendants = list(section.descendants())
        heading = one(descendants,lambda n:n.tag in ('h1','h2'))
        label = page.plain(heading).replace('\n',' ')
        range_edits = []
        fields = []
        for node in descendants:
            if node.tag not in ('h1','h2','h3','h4','p','dd','blockquote','figcaption','img','source'):
                continue
            is_media=node.tag in ('img','source')
            if is_media:
                # Keep the original clickable image/lightbox and player controls when replacing media.
                source = node.attrs.get('src','')
                if not source.startswith(('assets/','documents/')):continue
                fields.append({'id':str(len(fields)),'label':node.attrs.get('alt') or source,'value':'/'+source,'kind':'image' if node.tag=='img' else 'video'})
                raw=page.raw(node)
                pattern=r'(\bsrc\s*=\s*)(["\x27])[^"\x27]+\2'
                range_edits.append((node.start-section.start,node.end-section.start,re.sub(pattern,lambda m:m[1]+m[2]+'%%ASSET-'+fields[-1]['id']+'%%'+m[2],raw,count=1)))
                continue
            if any(c.tag not in ('br', 'span', 'strong', 'em', 'i', 'b', 'small', 'sup') for c in node.descendants()):continue
            value=page.plain(node) or defaults.get(node.attrs.get('data-key'),'')
            if not value or len(value)>10000:continue
            fields.append({'id':str(len(fields)),'label':f'{node.tag.upper()} · {value[:32]}','value':value,'kind':'text','heading':node is heading})
            range_edits.append((node.start-section.start,node.end-section.start,'%%FIELD-'+fields[-1]['id']+'%%'))
        field_nodes = [page.source[section.start+a:section.start+b] for a,b,v in range_edits if v.startswith('%%FIELD-')]
        originals = dict(zip([f['id'] for f in fields if f['kind']=='text'], field_nodes))
        stored[id_]={'template':replace_ranges(page.raw(section),range_edits),'label':label,'fields':fields,'originals':originals}
    prefix=inject_css(page.source[:sections[0].start], gallery=True)
    tail=page.source[sections[-1].end:]
    if 'galleries.js' not in tail:
        tail=tail.replace('</body>','<script src="/galleries.js"></script></body>')
    legacy[slug]={'prefix':prefix,'tail':tail,'nav':page.raw(nav),'sections':stored,'card':home.raw(card)}
    projects.append({'id':slug,'slug':slug,'legacy':slug,'state':'visible','title':title,'summary':summary,'category':category,'cover':'/'+image,
                     'blocks':[{'id':k,'type':'legacy','source':k,'motion':'inherit','edits':{}} for k in stored]})

seed={'projects':projects,'settings':{},'contentRevision':1}
asset_extensions={'.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.mp4':'video/mp4','.webm':'video/webm','.pdf':'application/pdf'}
assets=[]
from urllib.parse import quote
for folder in ['assets','documents']:
    for file in sorted((PUBLIC/folder).rglob('*')):
        if file.is_file() and file.suffix.lower() in asset_extensions:
            assets.append({'name':file.name,'url':'/'+quote(file.relative_to(PUBLIC).as_posix()),'mime':asset_extensions[file.suffix.lower()]})
bundle={'assets':assets,'legacy':legacy,'homeTemplate':home_template,'homeFields':home_fields,'homeValues':home_values,'seed':seed}
(EDITOR/'site-model.json').write_text(json.dumps(bundle,ensure_ascii=False,separators=(',',':'))+'\n')
print(f'Compiled {len(projects)} original projects and {sum(len(p["blocks"]) for p in projects)} original sections.')
