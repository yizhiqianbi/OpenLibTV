import pathlib,json,re,html,urllib.request,urllib.parse,hashlib,concurrent.futures,datetime
API=pathlib.Path('research/api');OUT=pathlib.Path('public/assets');DATA=pathlib.Path('public/data')
def read(p):
 try:return json.loads(p.read_text()).get('data',{})
 except:return {}
def load(name):return read(API/(name+'.json'))
def rawload(name):return read(pathlib.Path('research/source/api')/(name+'.json'))
def norm(x):return {**x,'id':x.get('templateUuid'), 'title':x.get('name',''), 'isLiked':x.get('isLike',False)}
allworks={}
feed=[]
for page in range(1,11):
 for x in load('gallery-page-'+str(page)).get('list',[]):
  n=norm(x)
  if n['id'] not in allworks:feed.append(n)
  allworks[n['id']]=n
categories=[]
for tag in load('api_community_tag_list').get('tagList',[]):
 works=[norm(x) for x in load('gallery-category-'+str(tag['id'])).get('list',[])]
 categories.append({**tag,'items':works})
 for x in works:allworks[x['id']]=x
skills={}
for page in range(1,6):
 for x in load('skills-page-'+str(page)).get('list',[]):skills[x['templateUuid']]=x
for x in rawload('_api_community_skill_template_feed_stream').get('list',[]):skills.setdefault(x['templateUuid'],x)
acts=[]
for x in load('api_community_activity_list').get('list',[]):
 detail=load('activity-'+str(x['activityId']));awards=load('activity-awards-'+str(x['activityId'])).get('rewardList',[])
 acts.append({**x,**detail,'awardWorks':awards})
 for w in awards:
  if w.get('templateUuid'):allworks[w['templateUuid']]=norm(w)
academy={'tutorials':load('api_course_v1_tutorials').get('list',[]),'articles':load('api_course_v1_academy_articles').get('list',[]),'masterclasses':load('api_course_v1_masterclass_home-cards').get('list',[]),'courses':load('api_course_v1_plaza').get('list',[])}
details={'tutorials':{p.stem.removeprefix('tutorial-'):read(p) for p in API.glob('tutorial-*.json')},'articles':{p.stem.removeprefix('article-'):read(p) for p in API.glob('article-*.json')},'masterclasses':{p.stem.removeprefix('masterclass-'):read(p) for p in API.glob('masterclass-*.json')}}
contents={'gallery-all.json':{'items':feed,'allItems':list(allworks.values()),'hasMore':True},'gallery-categories.json':categories,'skills.json':{'items':list(skills.values()),'tags':rawload('_api_community_skill_tag_list').get('tagList',[])},'activities.json':{'items':acts},'academy.json':academy,'academy-details.json':details,'features.json':rawload('_api_feature-news_list'),'versions.json':rawload('_api_feature-news_version_list')}
for name,obj in contents.items():(DATA/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2))
print('Content files prepared: gallery',len(feed),'all gallery incl categories/awards',len(allworks),'skills',len(skills),'activities',len(acts),flush=True)
# Gather all remote image URLs, including URLs embedded in markdown descriptions and original static chunks.
urls=[];contexts={}
def gather(x,context):
 if isinstance(x,str):
  for u in re.findall(r'https?://[^\s"\'`<>\)\]\}]+?\.(?:png|jpe?g|webp|svg|gif)(?:\?[^\s"\'`<>\)\]\}]+)?',x,re.I):urls.append(u);contexts.setdefault(u,[]).append(context)
 elif isinstance(x,list):
  for v in x:gather(v,context)
 elif isinstance(x,dict):
  for k,v in x.items():gather(v,context+'.'+k)
for name,obj in contents.items():gather(obj,name)
for p in pathlib.Path('research/source').glob('*.js'):
 s=p.read_text();gather(s,'static:'+p.name)
# Local paths declared in static chunks: material images, brand graphics, director styles, plugin helper images.
for p in pathlib.Path('research/source').glob('*.js'):
 for path in re.findall(r'["\'](/assets/[^"\']+?\.(?:png|jpe?g|webp|svg|gif))["\']',p.read_text(),re.I):
  u='https://www.liblib.tv'+path;urls.append(u);contexts.setdefault(u,[]).append('static-local:'+p.name)
# Full original JSON icons have already been saved separately.
existing=json.loads(pathlib.Path('research/assets.json').read_text()); amap=json.loads((DATA/'asset-map.json').read_text());known={x['source']:x for x in existing}
items=[]
for u in dict.fromkeys(urls):
 u=html.unescape(u)
 if u in amap or u.endswith('www.webm'):continue
 pu=urllib.parse.urlparse(u);ext=pathlib.Path(pu.path).suffix.lower()
 if ext not in ['.png','.jpg','.jpeg','.webp','.svg','.gif']:continue
 remote=u
 if pu.netloc in ['libtv-res.liblib.art','liblibai-online.liblib.cloud'] and ext not in ['.svg','.gif'] and not pu.query:
  w=120 if any(x in u for x in ['/img/','/avatar/']) or any('avatar' in x.lower() for x in contexts.get(u,[])) else 900
  remote=u+'?x-oss-process=image/resize,w_'+str(w)+',m_lfit/format,webp';ext='.webp'
 fn=hashlib.sha1(u.encode()).hexdigest()[:16]+ext
 items.append({'source':u,'download':remote,'local':'/assets/'+fn,'contexts':list(dict.fromkeys(contexts.get(u,[])))[:15]})
print('Supplementary image assets',len(items),flush=True)
def dl(d):
 try:
  p=pathlib.Path('public'+d['local'])
  if not p.exists():
   req=urllib.request.Request(d['download'],headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.liblib.tv/'})
   with urllib.request.urlopen(req,timeout=40) as res:
    if int(res.headers.get('Content-Length',0))>15_000_000:raise RuntimeError('over 15MB')
    content=res.read(15_000_001)
    if len(content)>15_000_000:raise RuntimeError('over 15MB')
   p.write_bytes(content)
  d['bytes']=p.stat().st_size;d['status']='downloaded'
 except Exception as e:d['status']='error';d['error']=str(e)
 return d
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=14) as ex:
 for i,d in enumerate(ex.map(dl,items)):
  results.append(d)
  if i%100==99:print('Downloaded',i+1,'/',len(items),flush=True)
for d in results:
 if d['status']=='downloaded':amap[d['source']]=d['local']
 known[d['source']]=d
(DATA/'asset-map.json').write_text(json.dumps(amap,ensure_ascii=False,indent=2));pathlib.Path('research/assets.json').write_text(json.dumps(list(known.values()),ensure_ascii=False,indent=2))
def local(v):
 if isinstance(v,str):
  if v in amap:return amap[v]
  if '![' in v or '<img' in v:
   for remote,path in amap.items():
    if remote in v:v=v.replace(remote,path)
  return v
 if isinstance(v,list):return [local(x) for x in v]
 if isinstance(v,dict):return {k:local(x) for k,x in v.items()}
 return v
for name,obj in contents.items():(DATA/name).write_text(json.dumps(local(obj),ensure_ascii=False,indent=2))
staticmap={u:amap[u] for u in urls if u in amap and any(c.startswith('static') for c in contexts.get(u,[]))}
(DATA/'ui-assets.json').write_text(json.dumps(staticmap,ensure_ascii=False,indent=2))
print('Complete',len(results),'errors',len([x for x in results if x['status']=='error']),'total asset bytes',sum(x.get('bytes',0) for x in known.values()),flush=True)
pathlib.Path('research/content-inventory.json').write_text(json.dumps({'capturedAt':'2026-10-10','source':'https://www.liblib.tv','galleryDefault':len(feed),'galleryUnique':len(allworks),'galleryCategories':len(categories),'skills':len(skills),'activities':len(acts),'tutorials':len(academy['tutorials']),'articles':len(academy['articles']),'masterclasses':len(academy['masterclasses']),'assetCount':len(known),'imageFailures':[x for x in results if x['status']=='error']},ensure_ascii=False,indent=2))
