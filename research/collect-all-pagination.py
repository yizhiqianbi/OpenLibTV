import pathlib,json,urllib.request,urllib.parse,uuid,time,concurrent.futures,hashlib,re,gzip
D=pathlib.Path('public/data');R=pathlib.Path('research/api/pagination');R.mkdir(parents=True,exist_ok=True)
headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.liblib.tv/','Content-Type':'application/json','x-language':'zh','Accept-Encoding':'gzip','Connection':'close'}
tags=json.loads(pathlib.Path('research/api/api_community_tag_list.json').read_text())['data']['tagList']
def fetch(path,body):
 for attempt in range(3):
  try:
   request=urllib.request.Request('https://api.liblib.tv'+path,data=json.dumps(body).encode(),headers=headers)
   with urllib.request.urlopen(request,timeout=40) as response:
    data=response.read();data=gzip.decompress(data) if response.headers.get('Content-Encoding')=='gzip' else data
   result=json.loads(data)
   if result.get('code')!=0:raise RuntimeError(str(result.get('code'))+' '+str(result.get('msg')))
   return result
  except Exception:
   if attempt==2:raise
   time.sleep(attempt+1)
def stream(kind,tag=None):
 sid='skills' if kind=='skill' else 'gallery-'+str(tag['id'] if tag else 'default'); request_id=str(uuid.uuid4());items={};page=1;pages=[];error=None;stopped='hasMore=false'
 path='/api/community/'+('skill' if kind=='skill' else 'project')+'/template/feed/stream'
 while page<10000:
  body={'page':page,'pageSize':40,'requestId':request_id}
  if tag:body['tagId']=tag['id']
  try:r=fetch(path,body)
  except Exception as e:error=str(e);stopped='request-error';break
  (R/(sid+'-page-'+str(page)+'.json')).write_text(json.dumps(r,ensure_ascii=False))
  data=r['data'];lst=data.get('list',[]);new=0
  for item in lst:
   key=item.get('templateUuid') or item.get('skillUuid') or item.get('id')
   if key not in items:new+=1
   items[key]=item
  pages.append({'page':page,'count':len(lst),'newItems':new,'total':data.get('total'),'hasMore':data.get('hasMore')})
  print(sid,'page',page,'items',len(items),'hasMore',data.get('hasMore'),flush=True)
  if data.get('hasMore') is False:break
  if not lst:stopped='empty-list';break
  if page>1 and not new:stopped='repeated-page';break
  page+=1;time.sleep(.1)
 else:stopped='safety-page-limit'
 return {'kind':kind,'tag':tag,'items':list(items.values()),'pages':pages,'stopped':stopped,'error':error,'requestId':request_id}
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
 futures=[ex.submit(stream,'gallery',t) for t in tags]+[ex.submit(stream,'gallery'),ex.submit(stream,'skill')]
 for f in concurrent.futures.as_completed(futures):
  results.append(f.result());pathlib.Path('research/pagination-progress.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
# This task deliberately writes independent files, so it cannot overwrite the root's canvas merge.
amap=json.loads((D/'asset-map.json').read_text());urls=[]
def gather(v):
 if isinstance(v,str):urls.extend(re.findall(r'https?://[^\s"\'<>\\]+?\.(?:png|jpe?g|webp|svg|gif)(?:\?[^\s"\'<>\\]*)?',v))
 elif isinstance(v,list):
  for x in v:gather(x)
 elif isinstance(v,dict):
  for x in v.values():gather(x)
gather(results);extra=[]
def dl(u):
 parsed=urllib.parse.urlparse(u);ext=pathlib.Path(parsed.path).suffix.lower();remote=u
 if parsed.netloc in ['libtv-res.liblib.art','liblibai-online.liblib.cloud'] and ext not in ['.svg','.gif'] and not parsed.query:remote=u+'?x-oss-process=image/resize,w_512,m_lfit/format,webp';ext='.webp'
 local='/assets/'+hashlib.sha1(u.encode()).hexdigest()[:16]+ext;p=pathlib.Path('public'+local);d={'source':u,'download':remote,'local':local,'context':'complete-pagination'}
 for address in dict.fromkeys([remote,u]):
  try:
   if not p.exists():
    req=urllib.request.Request(address,headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.liblib.tv/'})
    with urllib.request.urlopen(req,timeout=35) as response:data=response.read(10_000_001)
    if len(data)>10_000_000:raise RuntimeError('imageover10MB')
    p.write_bytes(data)
   d.update(status='downloaded',bytes=p.stat().st_size);return d
  except Exception as e:d.update(status='error',error=str(e))
 return d
print('Pagination assets',len([u for u in set(urls) if u not in amap]),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
 for d in ex.map(dl,[u for u in dict.fromkeys(urls) if u not in amap]):
  extra.append(d)
  if d['status']=='downloaded':amap[d['source']]=d['local']
  else:print('Assetfailure',d['source'],d['error'],flush=True)
def local(v):
 if isinstance(v,str):return amap.get(v,v)
 if isinstance(v,list):return [local(x) for x in v]
 if isinstance(v,dict):return {k:local(x) for k,x in v.items()}
 return v
for r in results:
 if r['kind']=='gallery':
  for x in r['items']:x.update(id=x.get('templateUuid'),title=x.get('name'),isLiked=x.get('isLike',False))
(D/'gallery-categories-full.json').write_text(json.dumps(local([r for r in results if r['kind']=='gallery' and r['tag']]),ensure_ascii=False,indent=2))
(D/'gallery-default-full.json').write_text(json.dumps(local(next(r for r in results if r['kind']=='gallery' and not r['tag'])),ensure_ascii=False,indent=2))
(D/'skills-full.json').write_text(json.dumps(local(next(r for r in results if r['kind']=='skill')),ensure_ascii=False,indent=2))
pathlib.Path('research/pagination-assets.json').write_text(json.dumps(extra,ensure_ascii=False,indent=2));pathlib.Path('research/pagination-asset-map.json').write_text(json.dumps({x['source']:x['local'] for x in extra if x['status']=='downloaded'},ensure_ascii=False,indent=2));print('Completedpagination',[(r['kind'],r['tag']['id'] if r['tag'] else 'default',len(r['items']),r['stopped']) for r in results],flush=True)
