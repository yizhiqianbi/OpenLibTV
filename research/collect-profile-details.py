import pathlib,json,urllib.request,urllib.parse,concurrent.futures
API=pathlib.Path('research/api');D=pathlib.Path('public/data')
def fetch(name,url,method='GET',body=None):
 try:
  req=urllib.request.Request(url,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.liblib.tv/','Origin':'https://www.liblib.tv','Content-Type':'application/json','x-language':'zh'})
  with urllib.request.urlopen(req,timeout=45) as res:r=json.loads(res.read())
  (API/(name+'.json')).write_text(json.dumps(r,ensure_ascii=False,indent=2));return name,r
 except Exception as e:return name,{'error':str(e)}
first=json.loads((D/'gallery.json').read_text())['items'];cases=[]
for x in first[:8]:
 u=x['ownerUuid'];cases.extend([('profile-extra-'+u,'https://api.liblib.tv/api/community/user/profile/detail','POST',{'userUuid':u}),('profile-person-'+u,'https://api2.liblib.art/api/www/user/getPersonInfo/'+u,'POST',{}),('profile-works-'+u,'https://api.liblib.tv/api/canvas/project/template/list','POST',{'page':1,'pageSize':40,'uuid':u,'status':None,'type':0}),('profile-tags-'+u,'https://api.liblib.tv/api/community/user/userTag','POST',{'uuid':u})])
for x in first:
 u=x['templateUuid'];cases.append(('gallery-detail-'+u,'https://api.liblib.tv/api/community/project/template/detail?projectTemplateUuid='+u+'&withRecommendList=true','GET',None))
recs=json.loads((D/'skills-recommended.json').read_text()).get('list',[])
for x in recs[:20]:
 u=x['templateUuid'];cases.append(('skill-detail-'+u,'https://api.liblib.tv/api/community/skill/template/detail?templateUuid='+u,'GET',None))
results={}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
 for name,r in ex.map(lambda c:fetch(*c),cases):results[name]=r;print(name,r.get('code',r.get('error')),flush=True)
profiles={}
for x in first[:8]:
 u=x['ownerUuid'];profiles[u]={'uuid':u,'name':x['nickname'],'avatar':x['avatar'],'person':results.get('profile-person-'+u,{}).get('data',{}),'extra':results.get('profile-extra-'+u,{}).get('data',{}),'works':results.get('profile-works-'+u,{}).get('data',{}),'tags':results.get('profile-tags-'+u,{}).get('data',{})}
amap=json.loads((D/'asset-map.json').read_text())
def local(v):
 if isinstance(v,str):return amap.get(v,v)
 if isinstance(v,list):return [local(x) for x in v]
 if isinstance(v,dict):return {k:local(x) for k,x in v.items()}
 return v
for n,obj in [('profiles.json',profiles),('gallery-details.json',{k.removeprefix('gallery-detail-'):v.get('data',{}) for k,v in results.items() if k.startswith('gallery-detail-')}),('skill-details.json',{k.removeprefix('skill-detail-'):v.get('data',{}) for k,v in results.items() if k.startswith('skill-detail-')})]:
 (D/n).write_text(json.dumps(local(obj),ensure_ascii=False,indent=2))
print('Profiles/details ready')
