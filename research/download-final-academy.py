import pathlib,json,urllib.request,hashlib
D=pathlib.Path('public/data');amap=json.loads((D/'asset-map.json').read_text());m={x['source']:x for x in json.loads(pathlib.Path('research/assets.json').read_text())};base='https://libtv-res.liblib.art/upload-images/976652348270470eba25b9d8ca891fda/'
urls=[base+x for x in ['26cfdb7f95eecc09b2abb83c3339460d14382f53.webp','eac65cfe5e27aa42e7742982eb3729b62fe9b7a5.webp','2a8ac513018926fb6dcfefcc9041d556ecc0038a.webp']];academy=json.loads((D/'academy-details.json').read_text());mc=next(iter(academy['masterclasses'].values()));mv=next(q['url'] for q in mc['qualities'] if q['label']=='480p');urls.append(mv)
for u in urls:
 ext='.mp4' if u.endswith('.mp4') else '.webp';path='/assets/'+hashlib.sha1(u.encode()).hexdigest()[:16]+ext;d={'source':u,'download':u,'local':path,'kind':'academy-final'}
 try:
  req=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.liblib.tv/'})
  with urllib.request.urlopen(req,timeout=50) as res:
   with pathlib.Path('public'+path).open('wb') as f:
    while True:
     b=res.read(131072)
     if not b:break
     f.write(b)
  d['bytes']=pathlib.Path('public'+path).stat().st_size;d['status']='downloaded';amap[u]=path
  if u==mv:mc['videoUrl']=path;mc['videoUrlExpireAt']=None;mc['localQuality']='480p'
 except Exception as e:d['status']='error';d['error']=str(e)
 m[u]=d;print(path,d['status'],d.get('bytes'),flush=True)
uis=json.loads((D/'ui-assets.json').read_text());uis.update({u:amap[u] for u in urls if u in amap});(D/'ui-assets.json').write_text(json.dumps(uis,ensure_ascii=False,indent=2));(D/'asset-map.json').write_text(json.dumps(amap,ensure_ascii=False,indent=2));pathlib.Path('research/assets.json').write_text(json.dumps(list(m.values()),ensure_ascii=False,indent=2))
for q in mc['qualities']:
 if q['url'] in amap:q['url']=amap[q['url']];q['expireAt']=None
(D/'academy-details.json').write_text(json.dumps(academy,ensure_ascii=False,indent=2))
