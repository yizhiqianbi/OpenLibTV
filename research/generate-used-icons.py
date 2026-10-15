import pathlib,json,re
library=json.loads(pathlib.Path('public/assets/libtv.json').read_text());aliases={'terminal':'icon-console','trophy':'icon-trophy','bulb':'icon-bulb-filled','play-f':'icon-play-filled','star':'star-l','heart':'heart-l','mail':'mail-n','login':'nt-login','light-dark':'icon-theme-dark-mode'}
# These are the icon names passed by navigation, login, studio fields and state-dependent JSX.
dynamic={'home-shell','icon-sparkles-soft','studio-3d','icon-projects','academy','nt-tv-shows','trophy','chat','smartphone','mail','contact','ratio','clock','star','star-f','heart','heart-f','up-s','folder','artboard'}
names=set(dynamic)
for p in pathlib.Path('src').rglob('*.jsx'):
 if p.name=='CanvasPage.jsx':continue # This page uses Lucide component variables named Icon.
 s=p.read_text();names.update(re.findall(r'<Icon\b[^>]*?name=["\']([^"\']+)',s))
 for expr in re.findall(r'<Icon\b[^>]*?name=\{([^}]+)\}',s):names.update(re.findall(r'["\']([a-z][a-z0-9-]+)["\']',expr))
selected={aliases.get(n,n) for n in names};missing=selected-library['icons'].keys()
if missing:raise RuntimeError('Unknown used icons: '+str(missing))
subset={k:library[k] for k in ['width','height'] if k in library};subset['icons']={n:library['icons'][n] for n in sorted(selected)}
p=pathlib.Path('src/components/icons-used.json');p.write_text(json.dumps(subset,ensure_ascii=False,separators=(',',':')))
pathlib.Path('research/icons-used.json').write_text(json.dumps({'requestedNames':sorted(names),'resolvedNames':sorted(selected),'iconCount':len(selected),'bytes':p.stat().st_size,'sourceBytes':pathlib.Path('public/assets/libtv.json').stat().st_size},ensure_ascii=False,indent=2));print(len(selected),'icons',p.stat().st_size,'bytes')
