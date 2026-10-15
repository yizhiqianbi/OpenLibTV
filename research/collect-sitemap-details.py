import pathlib,json,urllib.request,gzip,concurrent.futures,time
D=pathlib.Path('public/data');A=pathlib.Path('research/api');A.mkdir(exist_ok=True)
ids=json.loads((A/'sitemap-missing-detail-ids.json').read_text());old=json.loads((D/'gallery-details.json').read_text());retries=[k for k,v in old.items() if not v];ids=list(dict.fromkeys(retries+ids));dest=A/'sitemap-details';dest.mkdir(exist_ok=True)
def fetch(u):
 p=dest/(u+'.json')
 if p.exists():return u,json.loads(p.read_text())
 for attempt in range(3):
  try:
   url='https://api.liblib.tv/api/community/project/template/detail?projectTemplateUuid='+u+'&withRecommendList='+('true' if u in retries else 'false')
   req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Accept-Encoding':'gzip','x-language':'zh','Referer':'https://www.liblib.tv/','Connection':'close'})
   with urllib.request.urlopen(req,timeout=50) as r:
    chunks=[]
    while True:
     b=r.read(65536)
     if not b:break
     chunks.append(b)
    content=b''.join(chunks)
    if r.headers.get('Content-Encoding')=='gzip':content=gzip.decompress(content)
   result=json.loads(content)
   if result.get('code')==0:
    data=(result.get('data') or {});detail=data.get('detail',{});ss=detail.pop('snapshotData',None)
    if ss:
     try:
      sn=json.loads(ss);detail['snapshotSummary']={'nodes':len(sn.get('nodes',[])),'edges':len(sn.get('edges',[]))}
      if u in retries:
       sf=D/'canvas-snapshots';sf.mkdir(exist_ok=True);(sf/(u+'.json')).write_text(json.dumps(sn,ensure_ascii=False));detail['snapshotPath']='/data/canvas-snapshots/'+u+'.json'
     except:pass
   p.write_text(json.dumps(result,ensure_ascii=False,indent=2));return u,result
  except Exception as e:
   if attempt==2:return u,{'error':str(e)}
results={};print('Sitemap detail targets',len(ids),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
 for i,(u,r) in enumerate(ex.map(fetch,ids)):
  results[u]=r
  if i%50==49:print('Captured',i+1,'/',len(ids),flush=True)
# Map every source sitemap route to concrete metadata while preserving default feed order.
r=json.loads((D/'gallery-all.json').read_text());works={x['templateUuid']:x for x in r['allItems']};amap=json.loads((D/'asset-map.json').read_text());details=old
for u,x in results.items():
 data=(x.get('data') or {});d=data.get('detail',{})
 if d:
  works[u]={**d,'id':u,'title':d.get('name',''),'isLiked':bool(d.get('isLike')),'sourceSitemap':True};details[u]=data
r['allItems']=list(works.values())
def local(v):
 if isinstance(v,str):return amap.get(v,v)
 if isinstance(v,list):return [local(x) for x in v]
 if isinstance(v,dict):return {k:local(x) for k,x in v.items()}
 return v
(D/'gallery-all.json').write_text(json.dumps(local(r),ensure_ascii=False,indent=2));(D/'gallery-details.json').write_text(json.dumps(local(details),ensure_ascii=False,indent=2));(D/'sitemap-content.json').write_text(json.dumps(local({'items':[(x.get('data') or {}).get('detail',{}) for x in results.values() if (x.get('data') or {}).get('detail')],'failures':{u:x for u,x in results.items() if not (x.get('data') or {}).get('detail')}}),ensure_ascii=False,indent=2))
print('Captured sitemap successful',sum(bool((x.get('data') or {}).get('detail')) for x in results.values()),'total gallery unique',len(works),'failures',len([x for x in results.values() if not (x.get('data') or {}).get('detail')]),flush=True)
