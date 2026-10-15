import pathlib,json,re,urllib.request,urllib.parse,hashlib,concurrent.futures
D=pathlib.Path('public/data');amap=json.loads((D/'asset-map.json').read_text());urls=[]
files=[D/'chat-shares.json',D/'skill-details.json']
for p in files:
 if p.exists():urls.extend(re.findall(r'https?://[^\s"\'<>\\]+?\.(?:png|jpe?g|webp|svg|gif|mp4|webm)(?:\?[^\s"\'<>\\]*)?',p.read_text()))
urls += ['https://liblibai-web-static.liblib.cloud/liblibtv_online/static/_next/static/media/chatgpt.2sorx693dva_x.png','https://liblibai-web-static.liblib.cloud/liblibtv_online/static/_next/static/media/codex.2ihityca9dmfk.png']
items=[]
def dl(u):
 parsed=urllib.parse.urlparse(u);ext=pathlib.Path(parsed.path).suffix.lower();local='/assets/'+hashlib.sha1(u.encode()).hexdigest()[:16]+ext;remote=u;p=pathlib.Path('public'+local);d={'source':u,'download':remote,'local':local,'context':'public-chat-share'}
 try:
  if not p.exists():
   req=urllib.request.Request(remote,headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.liblib.tv/'})
   with urllib.request.urlopen(req,timeout=40) as response:
    size=int(response.headers.get('Content-Length',0))
    if size>10_000_000:d.update(status='remote-only',bytes=size);return d
    data=response.read(10_000_001)
    if len(data)>10_000_000:d.update(status='remote-only',bytes=len(data));return d
   p.write_bytes(data)
  d.update(status='downloaded',bytes=p.stat().st_size)
 except Exception as e:d.update(status='error',error=str(e))
 return d
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
 for d in ex.map(dl,[u for u in dict.fromkeys(urls) if u not in amap]):
  items.append(d)
  if d['status']=='downloaded':amap[d['source']]=d['local']
  print(d['local'],d['status'],d.get('bytes'),flush=True)
def local(v):
 if isinstance(v,str):
  if v in amap:return amap[v]
  if v.startswith('{') or '![' in v:
   for u,p in amap.items():
    if u in v:v=v.replace(u,p)
  return v
 if isinstance(v,list):return [local(x) for x in v]
 if isinstance(v,dict):return {k:local(x) for k,x in v.items()}
 return v
for p in files:
 if p.exists():p.write_text(json.dumps(local(json.loads(p.read_text())),ensure_ascii=False,indent=2))
pathlib.Path('research/chat-share-assets.json').write_text(json.dumps(items,ensure_ascii=False,indent=2));pathlib.Path('research/chat-share-asset-map.json').write_text(json.dumps({x['source']:x['local'] for x in items if x['status']=='downloaded'},ensure_ascii=False,indent=2));print('CHAT completed',len(items),flush=True)
