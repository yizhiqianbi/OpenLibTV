import pathlib,json,re,urllib.request,urllib.parse,hashlib,concurrent.futures
out=pathlib.Path('public/assets');data=pathlib.Path('public/data');configs={}
for p in pathlib.Path('research/source/api').glob('config-*.json'):
 try:r=json.loads(p.read_text())['data'];configs[p.stem.removeprefix('config-')]=json.loads(r['linkUrl'])
 except:pass
(data/'remote-configs.json').write_text(json.dumps(configs,ensure_ascii=False,indent=2))
for n in ['member-model-cards','member-packages']:
 p=pathlib.Path('research/source/api',n+'.json')
 if p.exists():(data/(n+'.json')).write_text(p.read_text())
urls=[]
for p in [pathlib.Path('research/source/api/_api_feature-news_list.json'),pathlib.Path('research/source/api/_api_feature-news_version_list.json')]:
 urls.extend(re.findall(r'https?://[^\s"\\]+?\.(?:mp4|webm)',p.read_text()))
for p in pathlib.Path('research/source/api').glob('config-*.json'):
 urls.extend(re.findall(r'https?://[^\s"\\]+?\.(?:png|jpe?g|webp|svg|gif|mp4|webm)(?:\?[^\s"\\]*)?',p.read_text()))
for p in pathlib.Path('research/source').glob('*.js'):
 urls.extend(re.findall(r'https?://[^\s"\'`]+?\.(?:mp4|webm)',p.read_text()))
items=[]
for u in dict.fromkeys(urls):
 if u in ['https://www.webm']:continue
 ext=pathlib.Path(urllib.parse.urlparse(u).path).suffix
 fn=hashlib.sha1(u.encode()).hexdigest()[:16]+ext
 items.append({'source':u,'download':u,'local':'/assets/'+fn})
for path in ['/assets/blender/hero-title.png','/assets/blender/hero-preview-poster.webp','/assets/blender/libtv-logo.svg']:
 items.append({'source':'https://www.liblib.tv'+path,'download':'https://www.liblib.tv'+path,'local':path})
def dl(d):
 try:
  p=pathlib.Path('public'+d['local']);p.parent.mkdir(exist_ok=True,parents=True)
  if not p.exists():
   req=urllib.request.Request(d['download'],headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.liblib.tv/'})
   with urllib.request.urlopen(req,timeout=45) as r:
    n=int(r.headers.get('Content-Length',0))
    if n>10_000_000:d['status']='remote-only';d['bytes']=n;return d
    b=r.read(10_000_001)
    if len(b)>10_000_000:d['status']='remote-only';d['bytes']=len(b);return d
   p.write_bytes(b)
  d['bytes']=p.stat().st_size;d['status']='downloaded'
 except Exception as e:d['error']=str(e);d['status']='error'
 return d
result=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
 for d in ex.map(dl,items):result.append(d);print(d['local'],d['status'],d.get('bytes',''),flush=True)
pathlib.Path('research/ui-media-assets.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
amap={x['source']:x['local'] for x in result if x['status']=='downloaded'}
def local(v):
 if isinstance(v,str):return amap.get(v,v)
 if isinstance(v,list):return [local(x) for x in v]
 if isinstance(v,dict):return {k:local(x) for k,x in v.items()}
 return v
(data/'remote-configs.json').write_text(json.dumps(local(configs),ensure_ascii=False,indent=2))
print('Media complete',len(result),'downloaded',len(amap),flush=True)
