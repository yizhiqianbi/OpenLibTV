import pathlib,re,json,html,urllib.request,urllib.parse,hashlib,concurrent.futures,time
ROOT=pathlib.Path('.'); OUT=ROOT/'public/assets'; OUT.mkdir(parents=True,exist_ok=True); DATA=ROOT/'public/data'; DATA.mkdir(exist_ok=True)
r=json.loads((ROOT/'research/source/flight-rows.json').read_text())
def clean(v):
 if isinstance(v,list):return [clean(x) for x in v]
 if isinstance(v,dict):return {k:clean(x) for k,x in v.items() if x!='$undefined'}
 return None if v=='$undefined' else v
jsons={'gallery.json':r['5f'],'home.json':r['26'][2][3],'models.json':r['5d'][3]['schema'],'locale-zh.json':r['4d'][3]['children'][1][3]['locale']}
for name,obj in jsons.items():(DATA/name).write_text(json.dumps(clean(obj),ensure_ascii=False,indent=2))
urls=[]
def walk(v):
 if isinstance(v,str) and v.startswith('http'):urls.append(v)
 elif isinstance(v,list):
  for x in v:walk(x)
 elif isinstance(v,dict):
  for x in v.values():walk(x)
walk(r)
imgurls=[x for x in list(dict.fromkeys(urls)) if re.search(r'\.(png|jpe?g|webp|svg|gif)(\?|$)',x,re.I)]
# Consistent responsive renditions: covers at 900px, avatars at 120px, feature cards full quality.
items=[]
for u in imgurls:
 if '/img/' in u or '/avatar/' in u:w=120
 elif '/upload-images/' in u:w=1200
 else:w=900
 remote=u if '.webp' in u else u+'?x-oss-process=image/resize,w_'+str(w)+',m_lfit/format,webp'
 fn=hashlib.sha1(u.encode()).hexdigest()[:16]+'.webp';items.append({'source':u,'download':remote,'local':'/assets/'+fn,'file':OUT/fn})
for u in ['https://www.liblib.tv/icons/libtv.json?v=cd7c04f1','https://www.liblib.tv/favicon.ico','https://www.liblib.tv/pwa/libtv/apple-touch-icon-180.png','https://www.liblib.tv/manifest.json']:
 fn=urllib.parse.urlparse(u).path.rsplit('/',1)[1];items.append({'source':u,'download':u,'local':'/assets/'+fn,'file':OUT/fn})
for f in ['Inter-latin-variable.woff2','Pretendard-variable.woff2','HuoshanQinghe-cli-title.woff2','Volcano-title-subset.woff','HuoshanQinghe-3dbox-title.v2.woff2','HuoshanQinghe-newuser-wall-title.woff2']:
 u='https://www.liblib.tv/assets/fonts/'+f;items.append({'source':u,'download':u,'local':'/assets/'+f,'file':OUT/f})
for u in urls:
 if u.endswith('.webm') and '/0cabfbb' in u:
  fn=hashlib.sha1(u.encode()).hexdigest()[:16]+'.webm';items.append({'source':u,'download':u,'local':'/assets/'+fn,'file':OUT/fn})
def get(d):
 try:
  if not d['file'].exists():
   req=urllib.request.Request(d['download'],headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.liblib.tv/'})
   with urllib.request.urlopen(req,timeout=45) as res:
    if int(res.headers.get('Content-Length',0))>20_000_000:raise RuntimeError('asset above 20 MB limit')
    content=res.read(20_000_001)
    if len(content)>20_000_000:raise RuntimeError('asset above 20 MB limit')
   d['file'].write_bytes(content)
  d['bytes']=d['file'].stat().st_size;d['status']='downloaded'
 except Exception as e:d['status']='error';d['error']=str(e)
 d.pop('file');return d
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
 result=list(ex.map(get,items))
(ROOT/'research/assets.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
map={d['source']:d['local'] for d in result if d['status']=='downloaded'}
(DATA/'asset-map.json').write_text(json.dumps(map,ensure_ascii=False,indent=2))
def localize(v):
 if isinstance(v,str):return map.get(v,v)
 if isinstance(v,list):return [localize(x) for x in v]
 if isinstance(v,dict):return {k:localize(x) for k,x in v.items()}
 return v
for name,obj in jsons.items():(DATA/name).write_text(json.dumps(localize(clean(obj)),ensure_ascii=False,indent=2))
print(json.dumps({'assets':len(result),'downloaded':len(map),'errors':[d for d in result if d['status']=='error'],'bytes':sum(d.get('bytes',0) for d in result)},ensure_ascii=False,indent=2))
