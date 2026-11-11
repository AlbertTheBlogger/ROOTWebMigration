"""Match original images to the web game's card and faction identifiers."""
import json
import shutil
from pathlib import Path
from build_autumn_web import matrix

ROOT=Path(__file__).resolve().parents[1]


def world_point(point, transform):
    result=[]
    for row in range(3):
        result.append(sum(transform[column*4+row]*point[column] for column in range(4)))
    return result


def run():
    records=json.loads((ROOT/'research/art/index.json').read_text(encoding='utf8'))
    assets={}
    for record in records:
        for asset in record['assets']:
            if 'file' not in asset:continue
            key=asset['name'].lower()
            if key not in assets or asset['type']=='Sprite':assets[key]=asset
    used={}
    def url(name,required=True):
        asset=assets.get(name.lower())
        if asset is None:
            if required:raise ValueError('Missing original art '+name)
            return None
        path='/'+asset['file']
        used[path]=dict(name=asset['name'],sha256=asset['sha256'])
        return path+'?v='+asset['sha256'][:12]
    cards={}
    catalog=json.loads((ROOT/'backend/data/full-card-catalog.json').read_text(encoding='utf8'))
    for card in catalog['cards']:
        suffix=next(s for s in ('Rabbit','Mouse','Fox','Bird') if card['type'].endswith(s))
        suit='bunny' if suffix=='Rabbit' else suffix.lower()
        name=card['type'][:-len(suffix)].lower()
        cards[card['type']]=url(f'T_crd_{suit}_{name}')
    leaders={name:url('T_crd_EyrieLeader_'+name) for name in ('despot','commander','charismatic','builder')}
    portraits={'cat':url('Avatar_MarquiseDeCat'),'bird':url('Avatar_EyrieDynasties_Despot')}
    portraits.update(alliance=url('Avatar_WoodlandAlliance'),vagabond=url('S_icon_Vaga_Head'))
    items={key:url('S_crd_iconLarge_'+name) for key,name in dict(bag='Sack',boot='Boot',crossbow='Crossbow',hammer='Hammer',sword='Sword',tea='TeaPot',coin='GoldStack').items()}
    symbols={key:url(name,False) for key,name in dict(cat='S_icon_Drawer_MarquiseWarrior',bird='S_icon_Drawer_EyrieWarrior',sawmill='S_icon_Sawmill',workshop='S_icon_Workshop',recruiter='S_icon_Recruiter',keep='S_icon_Keep',roost='S_icon_Roost',wood='S_icon_Marq_Wood',ruin='S_icon_Ruin').items()}
    suits={key:f'/assets/suits/{key}.webp' for key in ('fox','rabbit','mouse','wild')}
    for path in suits.values():
        used[path]={'name':'User-provided suit reference extraction'}
    from research_samples import properties
    strings=properties(ROOT/'research/assets/localization/zh_CN.txt')
    character_details={key:{'name':strings[f'root.vagabond.{key}']['value'],'ability':strings[f'root.vagabond.{key}.ability.title']['value'],'description':strings[f'root.vagabond.{key}.ability.text']['value'],'cost':'消耗一个未损坏且未耗竭的火把。'} for key in ('thief','tinker','ranger')}
    units={'cat':url('S_icon_Marq_HeadCount'),'bird':url('S_icon_Eyrie_WarriorCount')}
    units['alliance']=url('S_icon_Alli_HeadCount')
    symbols.update(alliance=url('S_icon_Alli_Head'),vagabond=url('S_icon_Vaga_Head'),sympathy=url('S_icon_Alli_Sympathy'))
    for suit,source in [('fox','Fox'),('mouse','Mouse'),('rabbit','Bunny')]:
        symbols['base-'+suit]=url('S_icon_Alli_Base'+source)
    items['torch']=url('S_crd_iconLarge_Torch')
    characters={key:url('T_crd_Vagabond_'+key.title()) for key in ['thief','tinker','ranger']}
    dominance={f'Dominance{source}':url(f'T_crd_{texture}_dominance') for source,texture in [('Fox','fox'),('Mouse','mouse'),('Rabbit','bunny'),('Bird','bird')]}
    scene=json.loads((ROOT/'research/art/autumn-web/scene.json').read_text(encoding='utf8'))
    # The original board quad maps this UV interval onto the play surface.
    board_node=next(node for node in scene['nodes'] if node['name']=='Board High')
    transform=board_node['matrix']
    vertices=[]
    for line in (ROOT/'research/art/autumn/msh_board_fall-96.obj').read_text(encoding='utf8').splitlines():
        if not line.startswith('v '):continue
        point=[*map(float,line.split()[1:]),1]
        vertices.append(world_point(point,transform))
    left,right=min(point[0] for point in vertices),max(point[0] for point in vertices)
    top,bottom=min(point[2] for point in vertices),max(point[2] for point in vertices)
    width=1200
    height=width*(bottom-top)/(right-left)
    image_height=height/(0.87587744-0.155755341)
    texture_name=Path(scene['materials']['7']['texture']).name
    texture_target=ROOT/'frontend/assets/board'/texture_name
    texture_target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(ROOT/'research/art/autumn-web'/texture_name,texture_target)
    texture_url='/assets/board/'+texture_name
    used[texture_url]={'name':texture_name}
    board={'texture':texture_url,'width':width,'height':height,
           'imageY':-image_height*(1-0.87587744),'imageHeight':image_height,
           'clearings':{str(area['id']):{'x':(area['position'][0]-left)/(right-left)*width,
                                       'y':(area['position'][2]-top)/(bottom-top)*height}
                        for area in scene['clearings']}}
    river_node=next(node for node in scene['nodes'] if node['name']=='msh_river_fall')
    river_vertices=[]
    river_faces=[]
    for line in (ROOT/'research/art/autumn/msh_river_fall-94.obj').read_text(encoding='utf8').splitlines():
        parts=line.split()
        if not parts:continue
        if parts[0]=='v':
            point=world_point([*map(float,parts[1:]),1],river_node['matrix'])
            river_vertices.append(((point[0]-left)/(right-left)*width,(point[2]-top)/(bottom-top)*height))
        elif parts[0]=='f':
            river_faces.append([int(vertex.split('/')[0])-1 for vertex in parts[1:]])
    river_paths=[]
    for face in river_faces:
        points=[river_vertices[index] for index in face]
        river_paths.append('M'+'L'.join(f'{x:.2f} {y:.2f}' for x,y in points)+'Z')
    board['riverPath']=''.join(river_paths)
    original_scene=json.loads((ROOT/'research/art/autumn/scene.json').read_text(encoding='utf8'))
    transforms={node['transformId']:node for node in original_scene['nodes']}
    forests={}
    for node in original_scene['nodes']:
        if not node['name'].startswith('P_Default_Forest'):continue
        suffix=node['name'].removeprefix('P_Default_Forest')
        if not suffix.isdigit():continue
        point=[0,0,0,1]
        while node:
            point=[*world_point(point,matrix(node).T.flatten().tolist()),1]
            node=transforms.get(node['parentTransformId'])
        position=[-point[0],point[1],point[2]]
        forests[suffix]={'position':position,'x':(position[0]-left)/(right-left)*width,'y':(position[2]-top)/(bottom-top)*height}
    board['forests']=forests
    manifest=dict(cards=cards,leaders=leaders,portraits=portraits,items=items,symbols=symbols,suits=suits,units=units,board=board,characters=characters,characterDetails=character_details,dominance=dominance,
                  illustrations=dict(hero=url('S_ill_Header_Registration'),cat=url('S_ill_MarquiseDeCat'),bird=url('S_ill_Eyrie')),
                  mapReference=url('S_ui_RulesAutumnMap'),files=sorted(used))
    (ROOT/'frontend/asset-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (ROOT/'research/art/applied-assets.json').write_text(json.dumps(used,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(dict(cards=len(cards),files=len(used),bytes=sum((ROOT/'frontend'/path.lstrip('/')).stat().st_size for path in used),symbols=symbols)))


if __name__=='__main__':run()
