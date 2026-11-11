"""Inventory and export selected original Unity art into the web workspace."""
import argparse
import gc
import hashlib
import json
from pathlib import Path
import re

import UnityPy
from PIL import Image

PATTERNS=['cards_assets*','cardprefabs_assets*','frontend_assets*','landing_assets*','playmat_assets*','playmatbackground_assets*','marquise_assets*','eyrie_assets*','recruiter_assets*','sawmill_assets*','workshop_assets*','sharedicons_assets*','sharedtextures_assets*','defaultlocalgroup_assets*']
PATTERNS += ['alliance_assets*','vagabond_assets*','vagabonditemui_assets*','vagabondcharacter_assets*']


def run(game, export):
    root=Path(__file__).resolve().parents[1]
    source_root=game/'Root_Data/StreamingAssets/aa/StandaloneWindows64'
    output=root/'research/art'
    output.mkdir(parents=True,exist_ok=True)
    index_path=output/'index.json'
    previous={record['source']:record for record in json.loads(index_path.read_text(encoding='utf8'))} if index_path.exists() else {}
    files=sorted({p for pattern in PATTERNS for p in source_root.glob(pattern)})
    report=[]
    for path in files:
        source_name=path.relative_to(game).as_posix()
        source_hash=hashlib.sha256(path.read_bytes()).hexdigest()
        env=UnityPy.load(str(path))
        objects=list(env.objects)
        dependencies=[]
        if path.name=='defaultlocalgroup_assets_all.bundle':
            dependency=source_root/'sharedicons_assets_all.bundle'
            env.load_file(str(dependency))
            dependencies.append({'source':dependency.relative_to(game).as_posix(),'sha256':hashlib.sha256(dependency.read_bytes()).hexdigest()})
        assets=[]
        for obj in objects:
            if obj.type.name not in ('Texture2D','Sprite'):continue
            try:
                data=obj.read()
                name=data.m_Name
                item={'id':obj.path_id,'type':obj.type.name,'name':name}
                if obj.type.name=='Texture2D':item.update(width=data.m_Width,height=data.m_Height)
                old_record=previous.get(source_name,{})
                if old_record.get('sha256')==source_hash and old_record.get('dependencies',[])==dependencies:
                    old_asset=next((asset for asset in old_record.get('assets',[]) if asset.get('id')==obj.path_id and asset.get('type')==obj.type.name),{})
                    if old_asset.get('file') and (root/'frontend'/old_asset['file']).exists():
                        item.update({key:old_asset[key] for key in ['file','width','height','sha256']})
                if export and re.search(export,name,re.I):
                    safe=re.sub(r'[^a-zA-Z0-9_.-]+','_',name)
                    target=root/'frontend/assets/original'/path.stem/f'{safe}-{obj.path_id}.webp'
                    target.parent.mkdir(parents=True,exist_ok=True)
                    old=previous.get(source_name,{})
                    if target.exists() and old.get('sha256')==source_hash and old.get('dependencies',[])==dependencies:
                        img=Image.open(target)
                    else:
                        img=data.image
                        img.save(target,'WEBP',quality=90,method=6)
                    item.update(file=target.relative_to(root/'frontend').as_posix(),width=img.width,height=img.height,sha256=hashlib.sha256(target.read_bytes()).hexdigest())
                assets.append(item)
            except Exception as error:
                assets.append({'id':obj.path_id,'type':obj.type.name,'error':str(error)[:200]})
        report.append({'source':source_name,'sha256':source_hash,'dependencies':dependencies,'assets':assets})
        print(path.name,len(assets),sum('file' in item for item in assets),flush=True)
        (output/'index.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        del env
        gc.collect()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('game',type=Path)
    parser.add_argument('--export')
    args=parser.parse_args()
    run(args.game,args.export)
