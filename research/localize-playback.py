import pathlib,json,urllib.request,hashlib,concurrent.futures,re
D=pathlib.Path('public/data');r=json.loads((D/'academy-details.json').read_text());amap=json.loads((D/'asset-map.json').read_text());m={x['source']:x for x in json.loads(pathlib.Path('research/assets.json').read_text())};targets=[]
for group in ['tutorials','masterclasses']:
 for key,x in r[group].items():targets.append((group,key,x))
def request(url):return urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.liblib.tv/'})
def media(t):
 group,key,x=t
 for q in x.get('qualities',[{'url':x['videoUrl']}])[:3]:
  u=q['url'];fn=hashlib.sha1(u.encode()).hexdigest()[:16]+'.mp4';d={'source':u,'download':u,'local':'/assets/'+fn,'kind':'academy-'+group,'quality':q.get('label')}
  try:
   with urllib.request.urlopen(request(u),timeout=40) as resp:
    length=int(resp.headers.get('Content-Length',0))
    if length>15_000_000:d['status']='remote-only';d['bytes']=length;continue
    content=resp.read(15_000_001)
    if len(content)>15_000_000:d['status']='remote-only';d['bytes']=len(content);continue
   pathlib.Path('public'+d['local']).write_bytes(content);d['bytes']=len(content);d['status']='downloaded';return group,key,d
  except Exception as e:d['status']='error';d['error']=str(e)
 return group,key,d
print('Localizing tutorial playback',len(targets),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
 for group,key,d in ex.map(media,targets):
  m[d['source']]=d;print(group,key,d['status'],d.get('bytes'),flush=True)
  if d['status']=='downloaded':
   amap[d['source']]=d['local'];x=r[group][key];x['videoUrl']=d['local'];x['videoUrlExpireAt']=None;x['localQuality']=d['quality']
# These two official product demos have bounded 11MB / 25MB payloads.
for u in ['https://liblibai-web-static.liblib.cloud/liblibtv_online/static/_next/static/media/showcase-1.3-taa85feiwyr.mp4','https://liblibai-web-static.liblib.cloud/liblibtv_online/static/_next/static/media/showcase-3.3d5c4xt2-79i2.mp4']:
 fn=hashlib.sha1(u.encode()).hexdigest()[:16]+'.mp4';d={'source':u,'download':u,'local':'/assets/'+fn}
 try:
  with urllib.request.urlopen(request(u),timeout=45) as resp:
   b=resp.read(30_000_001)
   if len(b)>30_000_000:raise RuntimeError('above30MB')
  pathlib.Path('public'+d['local']).write_bytes(b);d['status']='downloaded';d['bytes']=len(b);amap[u]=d['local']
 except Exception as e:d['status']='error';d['error']=str(e)
 m[u]=d;print('Plugin',d['status'],d.get('bytes'),flush=True)
# Local sidebar banners.
shell=json.loads((D/'shell-config.json').read_text())
for x in shell['sidebarBanners']:
 u=x['pic'];fn=hashlib.sha1(u.encode()).hexdigest()[:16]+'.webp';d={'source':u,'download':u,'local':'/assets/'+fn}
 try:
  with urllib.request.urlopen(request(u),timeout=30) as resp:b=resp.read(10_000_001)
  pathlib.Path('public'+d['local']).write_bytes(b);d['status']='downloaded';d['bytes']=len(b);amap[u]=d['local'];x['pic']=d['local']
 except Exception as e:d['status']='error';d['error']=str(e)
 m[u]=d
def local(v):
 if isinstance(v,str):return amap.get(v,v)
 if isinstance(v,list):return [local(x) for x in v]
 if isinstance(v,dict):return {k:local(x) for k,x in v.items()}
 return v
(D/'academy-details.json').write_text(json.dumps(local(r),ensure_ascii=False,indent=2));(D/'shell-config.json').write_text(json.dumps(local(shell),ensure_ascii=False,indent=2))
(D/'asset-map.json').write_text(json.dumps(amap,ensure_ascii=False,indent=2));pathlib.Path('research/assets.json').write_text(json.dumps(list(m.values()),ensure_ascii=False,indent=2))
uis=json.loads((D/'ui-assets.json').read_text());uis.update({u:p for u,p in amap.items() if u.endswith('.mp4') or u.endswith('.webm')});(D/'ui-assets.json').write_text(json.dumps(uis,ensure_ascii=False,indent=2))
print('Playback done',flush=True)
