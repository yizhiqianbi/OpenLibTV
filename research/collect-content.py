import pathlib,json,urllib.request,urllib.parse,concurrent.futures,hashlib,re,uuid,time
API=pathlib.Path('research/api');API.mkdir(exist_ok=True)
def fetch(path,method='GET',data=None,name=None):
 name=name or path.replace('/','_').strip('_')
 out=API/(name+'.json')
 try:
  req=urllib.request.Request('https://api.liblib.tv'+path,data=json.dumps(data).encode() if data is not None else None,method=method,headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.liblib.tv/','Origin':'https://www.liblib.tv','Content-Type':'application/json','x-language':'zh'})
  with urllib.request.urlopen(req,timeout=40) as r:s=r.read().decode()
  out.write_text(s);r=json.loads(s)
  if r.get('code') not in [0,200]:print(name,'error',r.get('code'),r.get('msg',r.get('message')))
  return name,r
 except Exception as e:print(name,str(e));return name,{'error':str(e)}
cases=[]
# A representative deep snapshot of every public gallery category and 400 default feed entries.
tags=json.loads((API/'api_community_tag_list.json').read_text())['data']['tagList']
requestId=str(uuid.uuid4())
for page in range(1,11):cases.append(('/api/community/project/template/feed/stream','POST',{'page':page,'pageSize':40,'requestId':requestId},'gallery-page-'+str(page)))
for tag in tags:cases.append(('/api/community/project/template/feed/stream','POST',{'page':1,'pageSize':40,'tagId':tag['id'],'requestId':str(uuid.uuid4())},'gallery-category-'+str(tag['id'])))
for page in range(1,6):cases.append(('/api/community/skill/template/feed/stream','POST',{'page':page,'pageSize':40,'requestId':str(uuid.uuid4())},'skills-page-'+str(page)))
acts=json.loads((API/'api_community_activity_list.json').read_text())['data']['list']
for x in acts:
 cases.append(('/api/community/activity/detail','POST',{'activityId':x['activityId']},'activity-'+str(x['activityId'])))
 cases.append(('/api/community/activity/reward_project_template/list','POST',{'activityId':x['activityId'],'page':1,'pageSize':40},'activity-awards-'+str(x['activityId'])))
for x in json.loads((API/'api_course_v1_tutorials.json').read_text())['data']['list']:
 cases.append(('/api/course/v1/tutorials/'+x['tutorialUuid']+'/play','GET',None,'tutorial-'+x['tutorialUuid']))
for x in json.loads((API/'api_course_v1_academy_articles.json').read_text())['data']['list']:
 cases.append(('/api/course/v1/academy/articles/'+x['articleUuid'],'GET',None,'article-'+x['articleUuid']))
for x in json.loads((API/'api_course_v1_masterclass_home-cards.json').read_text())['data']['list']:
 cases.append(('/api/course/v1/masterclass/'+x['masterclassUuid']+'/play','GET',None,'masterclass-'+x['masterclassUuid']))
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
 for name,r in ex.map(lambda c:fetch(*c),cases):
  d=r.get('data');print(name, 'OK' if r.get('code')==0 else 'restricted',len(str(d)))
