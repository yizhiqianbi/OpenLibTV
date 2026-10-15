import pathlib,json,re,urllib.request,urllib.parse,hashlib,concurrent.futures
root=pathlib.Path('.');data=root/'public/data';configs={}
for p in pathlib.Path('research/source/api').glob('config-*.json'):
 try:
  j=json.loads(p.read_text());d=j.get('data');c=json.loads(d['linkUrl']);configs[str(d.get('id',p.stem.replace('config-','')))]=c
 except:pass
for p in pathlib.Path('research/source/api').glob('config-type-*.json'):
 j=json.loads(p.read_text())
 for d in j.get('data',{}).get('list',[]):
  try:configs[str(d['id'])]=json.loads(d['linkUrl'])
  except:pass
urls=[]
def urlscan(v):
 if isinstance(v,str):
  urls.extend(re.findall(r'https?://[^\s"\'<>\\]+?\.(?:png|jpe?g|webp|svg|gif)(?:\?[^\s"\'<>\\]*)?',v))
 elif isinstance(v,list):
  for a in v:urlscan(a)
 elif isinstance(v,dict):
  for a in v.values():urlscan(a)
urlscan(configs)
amap=json.loads((data/'asset-map.json').read_text());manifest=json.loads(pathlib.Path('research/assets.json').read_text());ui=json.loads((data/'ui-assets.json').read_text())
new=[]
def dl(u):
 fn=hashlib.sha1(u.encode()).hexdigest()[:16]+pathlib.Path(urllib.parse.urlparse(u).path).suffix;local='/assets/'+fn;p=pathlib.Path('public'+local)
 d={'source':u,'download':u,'local':local,'context':'commercial remoteconfig'}
 try:
  if not p.exists():
   req=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.liblib.tv/'})
   with urllib.request.urlopen(req,timeout=45) as r:p.write_bytes(r.read())
  d.update(status='downloaded',bytes=p.stat().st_size)
 except Exception as e:d.update(status='error',error=str(e))
 return d
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
 for d in ex.map(dl,[u for u in dict.fromkeys(urls) if u not in amap]):
  print(d['local'],d['status'],d.get('bytes'),flush=True);new.append(d)
  if d['status']=='downloaded':amap[d['source']]=d['local'];ui[d['source']]=d['local']
md={d['source']:d for d in manifest};md.update({d['source']:d for d in new});manifest=list(md.values())
def localize(v):
 if isinstance(v,str):
  if v in amap:return amap[v]
  for u,l in amap.items():
   if u in v:v=v.replace(u,l)
  return v
 if isinstance(v,list):return [localize(x) for x in v]
 if isinstance(v,dict):return {k:localize(x) for k,x in v.items()}
 return v
configs=localize(configs)
(data/'remote-configs.json').write_text(json.dumps(configs,ensure_ascii=False,indent=2))
shell=json.loads((data/'shell-config.json').read_text());shell['promotion']=configs.get('328');shell['holidayPromo']=configs['86']['holidayPromo'];shell['guide']=configs['31'];shell['enterpriseContact']=configs['215']['enterpriseContact']
(data/'shell-config.json').write_text(json.dumps(shell,ensure_ascii=False,indent=2))
member=json.loads((data/'member.json').read_text());member['faqs']=[{**x,'question':x['title'],'answer':x['content']} for x in configs['86']['qaaConfig']];member['teamFaqs']=[{**x,'question':x['title'],'answer':x['content']} for x in configs['86']['qaaConfigTeam']];member['commercialConfig']=configs['86'];member['regionalCommercialEquity']=configs['157'];member['growth']=configs['294'];member['membershipLevels']=configs.get('210',{}).get('membershipLevels',[]);member['teamMembershipLevels']=configs.get('211',{}).get('membershipLevels',[]);member['newUserMembershipLevels']=configs.get('327',{}).get('membershipLevels',[]);member['costTable']=configs.get('210',{}).get('costTable');member['benefitIcons']=configs.get('210',{}).get('iconMap',{});member['teamBenefitIcons']=configs.get('211',{}).get('iconMap',{});member['personalPromotion']=configs.get('250');member['teamPromotion']=configs.get('251')
(data/'member.json').write_text(json.dumps(member,ensure_ascii=False,indent=2))
(data/'asset-map.json').write_text(json.dumps(amap,ensure_ascii=False,indent=2));(data/'ui-assets.json').write_text(json.dumps(ui,ensure_ascii=False,indent=2));pathlib.Path('research/assets.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
inv=json.loads(pathlib.Path('research/content-inventory.json').read_text());inv['downloadedAssetCount']=sum(x['status']=='downloaded' for x in manifest);inv['assetBytes']=sum(x.get('bytes',0) for x in manifest if x['status']=='downloaded');inv['remoteOnlyMedia']=[x for x in manifest if x['status']=='remote-only'];inv['memberFaqs']=len(member['faqs']);inv['remoteConfigCount']=len(configs)
pathlib.Path('research/content-inventory.json').write_text(json.dumps(inv,ensure_ascii=False,indent=2))
