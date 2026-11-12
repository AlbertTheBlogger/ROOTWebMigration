"""Read original Unity AudioClips and export bounded web UI sounds.

Original audio and this research/export utility are outside the MIT file list.
"""
import argparse,hashlib,io,json,wave,warnings
from pathlib import Path
warnings.filterwarnings('ignore',category=DeprecationWarning)
import audioop
import UnityPy

ROOT=Path(__file__).resolve().parents[1]
SELECTED={'move':'unit-marq-run1','build':'building-workshop-summon','dice':'ui-battle-diceroll1','draw':'ui-card-whoosh1','score':'ui-vppointgained','turmoil':'ui-prompt-eyreturmoilleaderswitch','revolt':'ui-prompt-uprisingremovingpieces','battle':'ui-battle','aid':'ui-prompt-aid'}

def run(game):
 source=game.resolve(strict=True)/'Root_Data/resources.assets'
 env=UnityPy.load(str(source));out=ROOT/'frontend/assets/audio';out.mkdir(parents=True,exist_ok=True)
 evidence=[];clips={}
 for obj in env.objects:
  if obj.type.name!='AudioClip':continue
  data=obj.read()
  if data.m_Name not in SELECTED.values():continue
  kind=next(k for k,name in SELECTED.items() if name==data.m_Name)
  sample=next(iter(data.samples.values()))
  with wave.open(io.BytesIO(sample),'rb') as wav:
   assert wav.getsampwidth()==2 and wav.getnchannels() in (1,2)
   pcm=wav.readframes(wav.getnframes())
   if wav.getnchannels()==2:pcm=audioop.tomono(pcm,2,.5,.5)
   pcm,_=audioop.ratecv(pcm,2,1,wav.getframerate(),22050,None)
  buffer=io.BytesIO()
  with wave.open(buffer,'wb') as wav:
   wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(22050);wav.writeframes(pcm)
  content=buffer.getvalue();digest=hashlib.sha256(content).hexdigest();name=f'{kind}.{digest[:12]}.wav'
  (out/name).write_bytes(content);clips[kind]='/assets/audio/'+name
  evidence.append({'kind':kind,'originalName':data.m_Name,'source':'Root_Data/resources.assets','pathId':obj.path_id,'resource':{'source':data.m_Resource.m_Source,'offset':data.m_Resource.m_Offset,'size':data.m_Resource.m_Size},'originalExportSha256':hashlib.sha256(sample).hexdigest(),'webSha256':digest,'file':clips[kind],'bytes':len(content),'duration':len(pcm)/44100,'conversion':'PCM16 mono 22050Hz; no timing cuts'})
 assert set(clips)==set(SELECTED)
 (ROOT/'frontend/audio-manifest.json').write_bytes((json.dumps({'version':1,'clips':clips,'files':sorted(clips.values())},indent=2)+'\n').encode('utf-8'))
 (ROOT/'research/audio').mkdir(exist_ok=True)
 (ROOT/'research/audio/extracted.json').write_bytes(json.dumps({'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'resourceFileSha256':hashlib.sha256((source.parent/'resources.resource').read_bytes()).hexdigest(),'copyright':'Third-party audio excluded from MIT','clips':evidence},indent=2).encode('utf-8'))
 print(json.dumps({'clips':len(clips),'bytes':sum(r['bytes'] for r in evidence)}))

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('game',type=Path);run(parser.parse_args().game)
