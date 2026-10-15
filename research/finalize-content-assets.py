import pathlib,json,re,urllib.request,urllib.parse,hashlib,concurrent.futures
D=pathlib.Path('public/data');A=pathlib.Path('research/assets.json');amap=json.loads((D/'asset-map.json').read_text());manifest={x['source']:x for x in json.loads(A.read_text())}
# Keep the reviewable gallery metadata small and preserve each exact published creation canvas independently.
r=json.loads((D/'gallery-details.json').read_text());folder=D/'canvas-snapshots';folder.mkdir(exist_ok=True)
for k,v in r.items():
 x=v.get('detail',{});ss=x.pop('snapshotData',None)
 if ss:
  try:obj=json.loads(ss);(folder/(k+'.json')).write_text(json.dumps(obj,ensure_ascii=False));x['snapshotPath']='/data/canvas-snapshots/'+k+'.json'
  except:pass
(D/'gallery-details.json').write_text(json.dumps(r,ensure_ascii=False,indent=2))
# Additional recommendation, profile, source canvas and member catalog images.
urls=[]
for n in ['skills-recommended.json','profiles.json','skill-details.json','canvas-example.json','gallery-details.json','remote-configs.json','gallery-all.json','sitemap-content.json','shell-config.json','member.json','gallery-categories.json','activities.json']:
 p=D/n
 for u in re.findall(r'https?://[^\s"\'`<>\)\]\}\\]+?\.(?:png|jpe?g|webp|svg|gif)(?:\?[^\s"\'`<>\)\]\}\\]+)?',p.read_text(),re.I):urls.append(u)
for x in manifest.values():
 if x.get('status')=='error' and not x['source'].endswith('.mp4'):urls.append(x['source'])
items=[]
for u in dict.fromkeys(urls):
 if u in amap:continue
 pu=urllib.parse.urlparse(u);ext=pathlib.Path(pu.path).suffix.lower();remote=u
 if pu.netloc in ['libtv-res.liblib.art','liblibai-online.liblib.cloud'] and ext not in ['.svg','.gif'] and not pu.query:
  remote=u+'?x-oss-process=image/resize,w_'+str(120 if any(x in u for x in ['/img/','/avatar/']) else 900)+',m_lfit/format,webp';ext='.webp'
 fn=hashlib.sha1(u.encode()).hexdigest()[:16]+ext;items.append({'source':u,'download':remote,'local':'/assets/'+fn})
def dl(d):
 for remote in dict.fromkeys([d['download'],d['source']]):
  try:
   p=pathlib.Path('public'+d['local']);req=urllib.request.Request(remote,headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.liblib.tv/'})
   with urllib.request.urlopen(req,timeout=30) as res:
    b=res.read(10_000_001)
    if len(b)>10_000_000:raise RuntimeError('over10MB')
   p.write_bytes(b);d['bytes']=len(b);d['status']='downloaded';d['download']=remote;d.pop('error',None);return d
  except Exception as e:d['status']='error';d['error']=str(e)
 return d
print('Final additional assets',len(items),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
 for d in ex.map(dl,items):
  manifest[d['source']]=d
  if d['status']=='downloaded':amap[d['source']]=d['local']
  else:print('Failed',d['source'],d['error'],flush=True)
def local(v):
 if isinstance(v,str):
  if v in amap:return amap[v]
  if '![' in v or '<img' in v or (v.startswith('{') and v.endswith('}')):
   for u,p in amap.items():
    if u in v:v=v.replace(u,p)
  return v
 if isinstance(v,list):return [local(x) for x in v]
 if isinstance(v,dict):return {k:local(x) for k,x in v.items()}
 return v
for p in D.glob('*.json'):
 if p.name=='asset-map.json':continue
 try:obj=json.loads(p.read_text());p.write_text(json.dumps(local(obj),ensure_ascii=False,indent=2))
 except:pass
for p in folder.glob('*.json'):
 obj=json.loads(p.read_text());p.write_text(json.dumps(local(obj),ensure_ascii=False))
(D/'asset-map.json').write_text(json.dumps(amap,ensure_ascii=False,indent=2));A.write_text(json.dumps(list(manifest.values()),ensure_ascii=False,indent=2))
print('Assets localized',len(amap),'additional',len(items),'metadata gallery bytes',(D/'gallery-details.json').stat().st_size,flush=True)
