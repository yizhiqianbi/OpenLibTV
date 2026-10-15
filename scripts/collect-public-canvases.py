"""Read public project metadata and canvas snapshots; never mutate LibTV."""
import concurrent.futures
import gzip
import json
import pathlib
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'public/data'
DEST = DATA / 'canvas-snapshots'
DEST.mkdir(exist_ok=True)
mapping = json.loads((DATA / 'asset-map.json').read_text())
existing = json.loads((DATA / 'gallery-details.json').read_text())
gallery = json.loads((DATA / 'gallery-all.json').read_text())
pagination=ROOT / 'research/pagination-progress.json'
extra=[x for group in json.loads(pagination.read_text()) if group.get('kind')=='gallery' for x in group.get('items',[])] if pagination.exists() else []
targets = list(dict.fromkeys(x['templateUuid'] for x in gallery['allItems']+extra if x.get('snapshotId')))

def localize(value):
    if isinstance(value, str):
        return mapping.get(value, value)
    if isinstance(value, list):
        return [localize(x) for x in value]
    if isinstance(value, dict):
        return {k: localize(v) for k, v in value.items()}
    return value

def capture(uuid):
    if ((DEST / (uuid + '.json')).exists() or (DEST / (uuid + '.json.gz')).exists()) and existing.get(uuid, {}).get('detail'):
        return uuid, existing[uuid], None
    url = 'https://api.liblib.tv/api/community/project/template/detail?projectTemplateUuid=' + uuid + '&withRecommendList=false'
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'gzip',
                'x-language': 'zh', 'Referer': 'https://www.liblib.tv/',
            })
            with urllib.request.urlopen(request, timeout=45) as response:
                content = response.read()
                if response.headers.get('Content-Encoding') == 'gzip':
                    content = gzip.decompress(content)
            result = json.loads(content)
            if result.get('code') != 0:
                return uuid, None, {'code': result.get('code'), 'message': result.get('msg') or result.get('message')}
            data = result.get('data') or {}
            detail = data.get('detail') or {}
            raw = detail.pop('snapshotData', None)
            if raw:
                snapshot = json.loads(raw) if isinstance(raw, str) else raw
                (DEST / (uuid + '.json.gz')).write_bytes(gzip.compress(json.dumps(localize(snapshot), ensure_ascii=False).encode()))
                detail['snapshotPath'] = '/data/canvas-snapshots/' + uuid + '.json.gz'
                detail['snapshotSummary'] = {'nodes': len(snapshot.get('nodes', [])), 'edges': len(snapshot.get('edges', []))}
            if not detail:
                return uuid, None, {'message': 'Public detail absent'}
            return uuid, localize(data), None
        except Exception as error:
            if attempt == 2:
                return uuid, None, {'message': str(error)}
            time.sleep(attempt + 1)

errors = {}
captured = {}
print('Reading public canvases:', len(targets), flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for index, (uuid, data, error) in enumerate(pool.map(capture, targets), 1):
        if data:
            captured[uuid] = data
        if error:
            errors[uuid] = error
        if index % 50 == 0:
            print('Captured', index, '/', len(targets), flush=True)

# Merge against the current file, so preexisting recommendation lists survive.
current = json.loads((DATA / 'gallery-details.json').read_text())
for uuid, data in captured.items():
    before = current.get(uuid) or {}
    current[uuid] = {**before, **data, 'recommendList': before.get('recommendList') or data.get('recommendList') or []}
individual=DATA / 'gallery-details';individual.mkdir(exist_ok=True)
for uuid,record in current.items():
    if (DEST / (uuid+'.json.gz')).exists():
        record['detail']['snapshotPath']='/data/canvas-snapshots/'+uuid+'.json.gz'
    (individual / (uuid+'.json')).write_text(json.dumps(record,ensure_ascii=False))
(DATA / 'gallery-details.json').write_text(json.dumps(current, ensure_ascii=False, indent=2))
manifest = {'capturedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'targets': len(targets),
            'details': len(current), 'snapshots': len(list(DEST.glob('*.json*'))), 'unavailable': errors}
(ROOT / 'research/canvas-capture.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
print(json.dumps({k: v for k, v in manifest.items() if k != 'unavailable'}, ensure_ascii=False), 'unavailable', len(errors), flush=True)
