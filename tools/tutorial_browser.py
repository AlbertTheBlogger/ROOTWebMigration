# Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
"""Walk every tutorial chapter through the normal browser controls."""
import json,os,shutil,socket,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from four_browser import click_action
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'audit'/os.environ.get('TUTORIAL_AUDIT_DIR','tutorial-browser')

def plan(room):
 g=room['game'];meta=room['tutorial'];me=next(p for p in g['players'] if p['id']==room['ownerId'])
 if g.get('choice'):
  q=g['choice'];return {'type':'choice','choiceId':q['choiceId'],'optionId':q['options'][0]['id']}
 if 'craft' in meta['actionTypes'] and g['craftOptions']:return {'type':'craft','card':g['craftOptions'][0]['card']}
 if g['phase']=='decree-add':return {'type':'decree-add','card':me['hand'][0]['id'],'column':'recruit'} if 'decree-add' in meta['actionTypes'] else {'type':'decree-ready'}
 if g['phase']=='craft':return {'type':'craft-done'}
 if 'lizard-craft-done' in meta['actionTypes']:return {'type':'lizard-craft-done'}
 if 'birdsong-end' in meta['actionTypes']:return {'type':'birdsong-end'}
 if g['phase']=='leader':return {'type':'leader','leader':g['leaders'][0]}
 if g['phase']=='revolt' and 'revolt-done' in meta['actionTypes']:return {'type':'revolt-done'}
 if g['phase']=='spread' and 'spread-done' in meta['actionTypes']:return {'type':'spread-done'}
 if g['phase']=='refresh' and 'refresh-done' in meta['actionTypes']:return {'type':'refresh-done'}
 if 'extra' in meta['actionTypes']:return {'type':'extra','card':next(c['id'] for c in me['hand'] if c['suit']=='wild')}
 if 'discard' in meta['actionTypes']:return {'type':'discard','card':next(c['id'] for c in me['hand'] if meta['stepId']!='liz-discard' or c['suit']=='rabbit')}
 if g['factionActions']:return g['factionActions'][0]['action']
 if g['mapActions']:return g['mapActions'][0]
 if 'end' in meta['actionTypes']:return {'type':'end'}
 raise AssertionError(('no action',meta['stepId'],g['phase']))

def basics_action(page,room,action):
 """Use the map itself for the first journey; no movement dropdown shortcuts."""
 kind=action['type']
 if kind=='choice':
  expect(page.locator('.tutorial-dialogue')).to_have_attribute('data-guide-stage','choice')
  click_action(page,room['game'],action);return
 assert kind in ('move','battle')
 if kind=='move':
  expect(page.locator('.tutorial-dialogue')).to_have_attribute('data-guide-stage','source')
  # The destination is visible but is not yet an eligible source.
  wrong=page.locator(f'.map [data-action=clearing][data-id="{action["to"]}"]').bounding_box()
  page.mouse.click(wrong['x']+wrong['width']/2,wrong['y']+wrong['height']/2)
  expect(page.locator('.tutorial-dialogue')).to_have_attribute('data-guide-stage','source')
  source=page.locator(f'.map [data-action=clearing][data-id="{action["from"]}"]')
  if room['tutorial']['stepId']=='march':source.focus();page.keyboard.press('Enter')
  else:source.click()
  expect(page.locator('.tutorial-dialogue')).to_have_attribute('data-guide-stage','destination')
  assert page.locator('.map .guide-route').count()==1
  page.locator(f'.map [data-action=clearing][data-id="{action["to"]}"]').click()
 else:page.locator(f'.map [data-action=clearing][data-id="{action["clearing"]}"]').click()
 expect(page.locator('.tutorial-dialogue')).to_have_attribute('data-guide-stage','confirm')
 if kind=='move':assert page.locator('.map-context [name=count]').input_value()=='1'
 if kind=='move' and room['tutorial']['stepId']=='move':
  page.locator('.map-context .map-cancel').click()
  expect(page.locator('.tutorial-dialogue')).to_have_attribute('data-guide-stage','source')
  page.locator(f'.map [data-action=clearing][data-id="{action["from"]}"]').click()
  page.locator(f'.map [data-action=clearing][data-id="{action["to"]}"]').click()
 page.locator('.map-card').scroll_into_view_if_needed()
 page.screenshot(path=str(OUTPUT/f'basics-{room["tutorial"]["stepId"]}-confirm.png'))
 confirm=page.locator(f'.map-context form#{kind} button[type=submit],.map-context form#{kind} button:not([type])')
 assert confirm.evaluate("e=>{const r=e.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e.contains(hit)}"),'Map confirmation covered'
 confirm.click()

def run():
 OUTPUT.mkdir(parents=True,exist_ok=True)
 with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
 with tempfile.TemporaryDirectory(prefix='tutorial-ui-') as folder:
  env={**os.environ,'DB_PATH':str(Path(folder)/'qa.sqlite')};env.pop('APP_ORIGIN',None)
  script="import {createApp} from './backend/server.mjs';const app=createApp({rateLimit:false});"+f"app.server.listen({port},'127.0.0.1');"
  log=(OUTPUT/'server.log').open('w',encoding='utf-8');process=subprocess.Popen([shutil.which('node'),'--input-type=module','-e',script],cwd=ROOT,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
  base=f'http://127.0.0.1:{port}';trace=[]
  try:
   for _ in range(100):
    try:urllib.request.urlopen(base+'/api/health',timeout=1).close();break
    except OSError:time.sleep(.1)
   with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True);page=browser.new_page(viewport={'width':int(os.environ.get('TUTORIAL_WIDTH','1912')),'height':int(os.environ.get('TUTORIAL_HEIGHT','948'))});errors=[]
    motion_audit=os.environ.get('TUTORIAL_MOTION_AUDIT')=='1';motion_events=[];audio_starts=[];playbacks=[]
    if motion_audit:
     page.expose_function('recordMotion',lambda kind:motion_events.append(kind))
     page.expose_function('recordAudioStart',lambda:audio_starts.append(True))
     page.expose_function('recordPlayback',lambda sample:playbacks.append(sample))
     page.add_init_script("""(()=>{
      const seen=new WeakSet();
      new MutationObserver(records=>{for(const record of records){
       for(const el of record.addedNodes){if(el.nodeType===1&&el.matches('.presentation-layer')&&!seen.has(el)){
        seen.add(el);window.recordMotion(el.dataset.kind);
        const started=performance.now(),full=document.documentElement.dataset.motion==='full'&&!matchMedia('(prefers-reduced-motion: reduce)').matches,stages=new Set();
        const banner=el.querySelector('.presentation-announcement'),r=banner.getBoundingClientRect(),fixed=getComputedStyle(banner).position==='fixed';
        const sample=()=>{if(!el.isConnected){if(full&&el.dataset.completed==='true')window.recordPlayback({kind:el.dataset.kind,milliseconds:performance.now()-started,fixed,width:r.width,height:r.height,stages:[...stages]});return;}
         if(el.dataset.turmoilStage)stages.add(el.dataset.turmoilStage);requestAnimationFrame(sample);};requestAnimationFrame(sample);
       }}
       if(record.type==='attributes'&&record.attributeName==='data-camera-moving'&&record.target.dataset.cameraMoving==='true'){
        const map=record.target,first=map.getAttribute('viewBox');requestAnimationFrame(()=>requestAnimationFrame(()=>{if(map.isConnected&&map.getAttribute('viewBox')!==first)window.recordMotion('camera');}));
       }
      }}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-camera-moving']});
      if(window.AudioBufferSourceNode){const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){window.recordAudioStart();return start.apply(this,args);};}
     })();""")
    page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base)
    page.get_by_role('button',name='注册账号',exact=True).click();page.locator('#auth [name=username]').fill('tutorial_browser');page.locator('#auth [name=password]').fill('tutorial-browser-password');page.locator('#auth button').click();expect(page.locator('#create')).to_be_visible()
    page.get_by_role('button',name='新手教程',exact=True).click();expect(page.locator('.tutorial-lesson')).to_have_count(6)
    catalog=page.evaluate("()=>fetch('/api/tutorials').then(r=>r.json()).then(r=>r.lessons)")
    selected=os.environ.get('TUTORIAL_LESSONS','').split(',') if os.environ.get('TUTORIAL_LESSONS') else [lesson['id'] for lesson in catalog]
    assert all(any(l['id']==id for l in catalog) for id in selected)
    page.screenshot(path=str(OUTPUT/'catalog.png'),full_page=True)
    for lesson in selected:
     retried=False
     chapter_trace_start=len(trace)
     basics_checks=set()
     page.locator(f'[data-action=tutorial-start][data-lesson={lesson}]').click();expect(page.locator('.tutorial-coach')).to_be_visible()
     if motion_audit and lesson==selected[0]:
      page.locator('[data-action=preferences]').click();expect(page.locator('.experience-dialog')).to_be_visible()
      page.locator('.experience-dialog [name=volume]').fill('0.15')
      page.locator('[data-sound-preview]').click();page.wait_for_timeout(350)
      assert audio_starts,'WebAudio playback did not start after an explicit gesture'
      page.locator('.experience-dialog [name=sound]').uncheck();page.wait_for_timeout(100);before=len(audio_starts)
      page.locator('[data-sound-preview]').click();page.wait_for_timeout(150);assert len(audio_starts)==before,'Muted preview played audio'
      page.locator('.experience-dialog [name=motion]').select_option('reduced');page.locator('[data-close-experience]').click()
      page.reload();expect(page.locator('.tutorial-coach')).to_be_visible();page.locator('[data-action=preferences]').click()
      expect(page.locator('.experience-dialog [name=sound]')).not_to_be_checked();expect(page.locator('.experience-dialog [name=motion]')).to_have_value('reduced')
      page.locator('.experience-dialog [name=sound]').check();page.locator('.experience-dialog [name=motion]').select_option('off');page.locator('[data-close-experience]').click()
      if lesson=='basics':
       page.locator('[data-action=tutorial-guide-next]').click();trace.append({'lesson':lesson,'step':'overview','action':'guide-next','motionOff':True})
       expect(page.locator('.guide-line')).to_contain_text('雄心勃勃');expect(page.locator('svg.map')).to_have_attribute('data-camera-moving','false')
      page.locator('[data-action=preferences]').click();page.locator('.experience-dialog [name=motion]').select_option('full');page.locator('[data-close-experience]').click()
     expect(page.locator('.scoreboard .victory-track progress')).to_have_count(4)
     expect(page.locator('.own-resources .victory-track progress')).to_have_count(1)
     if lesson=='cats':expect(page.locator('.own-resources .building-track')).to_have_count(3)
     if lesson in ['eyrie','alliance','vagabond']:
      expect(page.locator('.own-resources .scoring-spaces > span')).to_have_count({'eyrie':8,'alliance':10,'vagabond':3}[lesson])
     def view():return page.evaluate("id=>fetch('/api/tutorials/'+id).then(r=>r.json()).then(r=>r.room)",lesson)
     for count in range(150):
      room=view();meta=room['tutorial']
      if meta['completed']:break
      if lesson=='basics' and meta['stepId']=='overview' and meta['guide']['cursor']==1 and 'back' not in basics_checks:
       trace.append({'lesson':lesson,'step':meta['stepId'],'action':'guide-back'});page.locator('[data-action=tutorial-guide-back]').click()
       expect(page.locator('.guide-line')).to_contain_text('欢迎来到')
       assert view()['tutorial']['guide']['cursor']==0
       page.reload();expect(page.locator('.guide-line')).to_contain_text('欢迎来到');basics_checks.add('back');continue
      if lesson=='basics' and meta['stepId']=='move' and meta['guide']['mode']=='result' and 'retry' not in basics_checks:
       trace.append({'lesson':lesson,'step':meta['stepId'],'action':'retry-step'});page.locator('[data-action=tutorial-retry]').click()
       expect(page.locator('.tutorial-dialogue')).to_have_attribute('data-guide-mode','dialogue')
       reset=view();assert reset['game']['board'][0]['warriors']['cat']==3 and reset['game']['board'][3]['warriors']['cat']==0
       page.reload();expect(page.locator('.tutorial-dialogue')).to_have_attribute('data-guide-mode','dialogue');basics_checks.add('retry');continue
      if lesson=='lizard' and meta['stepId']=='liz-sacrifice' and meta['count']==1 and not retried:
       trace.append({'lesson':lesson,'step':meta['stepId'],'action':'retry-step'})
       page.locator('[data-action=tutorial-retry]').click()
       page.wait_for_function("v=>fetch('/api/tutorials/'+v.lesson).then(r=>r.json()).then(r=>r.room.version>v.version)",arg={'lesson':lesson,'version':room['version']},timeout=10000)
       reset=view();assert reset['tutorial']['count']==0 and reset['game']['lizard']['acolytes']==0
       page.reload();expect(page.locator('.tutorial-coach')).to_be_visible();assert view()['version']==reset['version'];retried=True;continue
      if count==2:
       page.reload();expect(page.locator('.tutorial-coach')).to_be_visible();assert view()['version']==room['version']
      if meta.get('guide',{} ) and meta['guide']['canAdvance']:
       trace.append({'lesson':lesson,'step':meta['stepId'],'action':'guide-next'});page.locator('[data-action=tutorial-guide-next]').click()
      elif meta['ready']:
       trace.append({'lesson':lesson,'step':meta['stepId'],'action':'next'});page.locator('[data-action=tutorial-next]').click()
      else:
       action=plan(room);trace.append({'lesson':lesson,'step':meta['stepId'],'action':action})
       if lesson=='basics':basics_action(page,room,action)
       else:click_action(page,room['game'],action)
      page.wait_for_function("v=>fetch('/api/tutorials/'+v.lesson).then(r=>r.json()).then(r=>r.room.version>v.version)",arg={'lesson':lesson,'version':room['version']},timeout=10000)
      if motion_audit and lesson=='eyrie' and meta['stepId']=='bird-turmoil' and not meta['ready']:
       for stage in ['0','1','2']:
        page.wait_for_function("s=>document.querySelector('.presentation-layer[data-kind=turmoil]')?.dataset.turmoilStage===s",arg=stage,timeout=15000)
        page.screenshot(path=str(OUTPUT/f'turmoil-stage-{stage}.png'))
      if lesson=='basics':
       assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
       assert page.locator('.map-card > .tutorial-dialogue').count()==1
       assert page.locator('.right-sidebar .tutorial-coach').count()==0
       if meta['stepId'] in ['overview','move','battle','defenseless','basic-finish'] and (not meta.get('guide') or meta['guide']['cursor']==0):
        page.locator('.map-card').scroll_into_view_if_needed()
        page.screenshot(path=str(OUTPUT/f'basics-{meta["stepId"]}-{meta["guide"]["mode"]}.png'))
      if not meta['ready'] and meta['stepId'] in ['move','cat-build','bird-add','wa-revolt','vg-quest','liz-recruit','liz-crusade','liz-hated']:page.screenshot(path=str(OUTPUT/(meta['stepId']+'.png')))
     assert view()['tutorial']['completed'],lesson
     if lesson=='lizard':assert retried
     if lesson=='basics':assert basics_checks=={'back','retry'}
     print(json.dumps({'lesson':lesson,'commands':len(trace)-chapter_trace_start,'completed':True}),flush=True)
     page.locator('.tutorial-coach [data-action=tutorials]').first.click();expect(page.locator('.tutorial-lesson')).to_have_count(6)
    assert all('已完成' in page.locator('.tutorial-lesson[data-lesson='+id+']').inner_text() for id in selected)
    page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(OUTPUT/'mobile-catalog.png'),full_page=True)
    page.locator('[data-action=tutorial-start][data-lesson=basics]').click();expect(page.locator('.tutorial-coach')).to_be_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(OUTPUT/'mobile-game.png'),full_page=True)
    assert not errors,errors
    if motion_audit:
     expected={'move','dice','score','camera'} if selected==['basics'] else {'move','build','dice','draw','score','turmoil','revolt','camera'}
     assert expected.issubset(set(motion_events)),(expected,set(motion_events))
    report={'passed':True,'chapters':len(selected),'nodes':sum(l['stepCount'] for l in catalog if l['id'] in selected),'commands':len(trace),'pageErrors':errors,'checks':['normal signup and tutorial entry','all actions through existing map UI','reload restores every chapter','completion progress saved','mobile no overflow']+(['basics dialogue back and reload','basics checkpoint retry and reload','map-only move without dropdowns','disabled target is inert','cancel and reselect move','keyboard map source selection','map confirmation hit testing'] if 'basics' in selected else []),'fixture':'No browser-injected game states. Scenes are prepared by the tutorial server.'}
    if motion_audit:
     assert playbacks and all(sample['milliseconds']>=1450 for sample in playbacks),playbacks
     if 'eyrie' in selected:assert any(sample['kind']=='turmoil' and set(sample['stages'])=={'0','1','2'} and sample['milliseconds']>=5900 for sample in playbacks),playbacks
     report.update(motionKinds=sorted(set(motion_events)),audioStarts=len(audio_starts),playbacks=playbacks,settingsChecks=['explicit audio playback','mute suppresses playback','sound/motion preferences persist across reload']+(['motion-off snaps camera'] if 'basics' in selected else []))
    (OUTPUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report),flush=True);browser.close()
  finally:
   (OUTPUT/'trace.json').write_text(json.dumps(trace,ensure_ascii=False,indent=2),encoding='utf-8');process.terminate();process.wait(timeout=10);log.close()
if __name__=='__main__':run()
