from pathlib import Path, PurePosixPath
import urllib.request
ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT/'frontend'/'lib'; LIB.mkdir(parents=True, exist_ok=True)
files = {
  'three.module.js': 'https://cdn.jsdelivr.net/npm/three@0.177.0/build/three.module.js',
  'GLTFLoader.js': 'https://cdn.jsdelivr.net/npm/three@0.177.0/examples/jsm/loaders/GLTFLoader.js',
  'three-vrm.module.min.js': 'https://cdn.jsdelivr.net/npm/three-vrm@2.0.6/lib/three-vrm.module.min.js'
}
for name, url in files.items():
  dest = LIB/name
  try:
    print('fetch', url); urllib.request.urlretrieve(url, dest)
  except Exception as e: print('warning:', e)
print('Done.')
