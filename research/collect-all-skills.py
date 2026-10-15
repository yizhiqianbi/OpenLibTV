import pathlib,json,urllib.request,urllib.parse,uuid,time,concurrent.futures,hashlib,re,gzip
D=pathlib.Path('public/data');R=pathlib.Path('research/api/skills-full');R.mkdir(parents=True,exist_ok=True)
headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.liblib.tv/','Content-Type':'application/json','x-language':'zh','Accept-Encoding':'gzip','Connection':'close'}
tags=json.loads((D/'skills.json').read_text())['tags']
def fetch(path,body=None):
 for attempt in range(3):
  try:
   request=urllib.request.Request('https://api.liblib.tv'+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
   with urllib.request.urlopen(request,timeout=40) as response:
    parts=[]
    while True:
     b=response.read(65536)
     if not b:break
     parts.append(b)
    data=b''.join(parts);data=gzip.decompress(data) if response.headers.get('Content-Encoding')=='gzip' else data
   result=json.loads(data)
   if result.get('code')!=0:raise RuntimeError(str(result.get('code'))+' '+str(result.get('msg')))
   return result
  except Exception:
   if attempt==2:raise
   time.sleep(attempt+1)
def stream(tag):
 sid='skills-'+str(tag['id']);request_id=str(uuid.uuid4());items={};page=1;pages=[];error=None;stop='hasMore=false'
 while page<10000:
  body={'page':page,'pageSize':40,'requestId':request_id,'tagId':tag['id']}
  try:r=fetch('/api/community/skill/template/feed/stream',body)
  except Exception as e:error=str(e);stop='request-error';break
  (R/(sid+'-page-'+str(page)+'.json')).write_text(json.dumps(r,ensure_ascii=False));data=r['data'];lst=data.get('list',[]);new=0
  for item in lst:
   if item['templateUuid'] not in items:new+=1
   items[item['templateUuid']]=item
  pages.append({'page':page,'count':len(lst),'newItems':new,'total':data.get('total'),'hasMore':data.get('hasMore')});print(sid,'page',page,'items',len(items),'hasMore',data.get('hasMore'),flush=True)
  if data.get('hasMore') is False:break
  if not lst:stop='empty-list';break
  if page>1 and not new:stop='repeated-page';break
  page+=1;time.sleep(.1)
 return {'tag':tag,'items':list(items.values()),'pages':pages,'hasMore':False if stop=='hasMore=false' else True,'stopped':stop,'error':error,'total':pages[-1].get('total') if pages else None}
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
 for r in ex.map(stream,tags):results.append(r)
pathlib.Path('research/skills-pagination-progress.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
allitems={x['templateUuid']:x for r in json.loads(pathlib.Path('research/pagination-progress.json').read_text()) if r['kind']=='skill' for x in r['items']}
for r in results:
 for x in r['items']:allitems.setdefault(x['templateUuid'],x)
print('Skilldetailunion',len(allitems),flush=True)
def detail(pair):
 key,item=pair;p=R/('detail-'+key+'.json');legacy=pathlib.Path('research/api/skill-detail-'+key+'.json')
 try:
  if p.exists():j=json.loads(p.read_text())
  elif legacy.exists():j=json.loads(legacy.read_text())
  else:j=fetch('/api/community/skill/template/detail?templateUuid='+key);p.write_text(json.dumps(j,ensure_ascii=False))
  d=j.get('data',{})
  if not d.get('skill'):raise RuntimeError('no skill detail')
  return key,d,None
 except Exception as e:return key,{'skill':item,'detailError':str(e)},str(e)
details={};failures={}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
 for index,(key,d,error) in enumerate(ex.map(detail,allitems.items()),1):
  details[key]=d
  if error:failures[key]=error
  if index%100==0:print('Skilldetails',index,'/',len(allitems),'errors',len(failures),flush=True)
pathlib.Path('research/skill-details-full-remote.json').write_text(json.dumps(details,ensure_ascii=False,indent=2));pathlib.Path('research/skill-details-full-failures.json').write_text(json.dumps(failures,ensure_ascii=False,indent=2))
amap=json.loads((D/'asset-map.json').read_text())
p=pathlib.Path('research/pagination-asset-map.json')
if p.exists():amap.update(json.loads(p.read_text()))
urls=[]
def gather(v):
 if isinstance(v,str):urls.extend(re.findall(r'https?://[^\s"\'<>\\]+?\.(?:png|jpe?g|webp|svg|gif)(?:\?[^\s"\'<>\\]*)?',v))
 elif isinstance(v,list):
  for x in v:gather(x)
 elif isinstance(v,dict):
  for x in v.values():gather(x)
gather(details);gather(results);extra=[]
def dl(u):
 parsed=urllib.parse.urlparse(u);ext=pathlib.Path(parsed.path).suffix.lower();remote=u
 if parsed.netloc in ['libtv-res.liblib.art','liblibai-online.liblib.cloud'] and ext not in ['.svg','.gif'] and not parsed.query:remote=u+'?x-oss-process=image/resize,w_512,m_lfit/format,webp';ext='.webp'
 local='/assets/'+hashlib.sha1(u.encode()).hexdigest()[:16]+ext;p=pathlib.Path('public'+local);d={'source':u,'download':remote,'local':local,'context':'complete-skill-details'}
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
missing=[u for u in dict.fromkeys(urls) if u not in amap];print('Skilldetailsassets',len(missing),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
 for d in ex.map(dl,missing):
  extra.append(d)
  if d['status']=='downloaded':amap[d['source']]=d['local']
  else:print('Assetfailure',d['source'],d['error'],flush=True)
def local(v):
 if isinstance(v,str):
  if v in amap:return amap[v]
  if v.startswith('{') or '![' in v or '<img' in v:
   for u,p in amap.items():
    if u in v:v=v.replace(u,p)
  return v
 if isinstance(v,list):return [local(x) for x in v]
 if isinstance(v,dict):return {k:local(x) for k,x in v.items()}
 return v
(D/'skills-category-full.json').write_text(json.dumps(local(results),ensure_ascii=False,indent=2));r=next(x for x in results if x['tag']['id']==4008);(D/'skills-recommended-full.json').write_text(json.dumps(local({'list':r['items'],'total':len(r['items']),'hasMore':r['hasMore'],'pages':r['pages']}),ensure_ascii=False,indent=2));(D/'skill-details-full.json').write_text(json.dumps(local(details),ensure_ascii=False,indent=2));pathlib.Path('research/skills-full-assets.json').write_text(json.dumps(extra,ensure_ascii=False,indent=2));pathlib.Path('research/skills-full-asset-map.json').write_text(json.dumps({x['source']:x['local'] for x in extra if x['status']=='downloaded'},ensure_ascii=False,indent=2));print('Completedskills',len(allitems),'details',len(details),'failures',len(failures),'tags',[(r['tag']['id'],len(r['items'])) for r in results],flush=True)
