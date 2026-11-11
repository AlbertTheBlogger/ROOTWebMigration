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
    page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base)
    page.get_by_role('button',name='注册账号',exact=True).click();page.locator('#auth [name=username]').fill('tutorial_browser');page.locator('#auth [name=password]').fill('tutorial-browser-password');page.locator('#auth button').click();expect(page.locator('#create')).to_be_visible()
    page.get_by_role('button',name='新手教程',exact=True).click();expect(page.locator('.tutorial-lesson')).to_have_count(6)
    catalog=page.evaluate("()=>fetch('/api/tutorials').then(r=>r.json()).then(r=>r.lessons)")
    selected=os.environ.get('TUTORIAL_LESSONS','').split(',') if os.environ.get('TUTORIAL_LESSONS') else [lesson['id'] for lesson in catalog]
    assert all(any(l['id']==id for l in catalog) for id in selected)
    page.screenshot(path=str(OUTPUT/'catalog.png'),full_page=True)
    for lesson in selected:
     retried=False
     page.locator(f'[data-action=tutorial-start][data-lesson={lesson}]').click();expect(page.locator('.tutorial-coach')).to_be_visible()
     expect(page.locator('.scoreboard .victory-track progress')).to_have_count(4)
     expect(page.locator('.own-resources .victory-track progress')).to_have_count(1)
     if lesson=='cats':expect(page.locator('.own-resources .building-track')).to_have_count(3)
     if lesson in ['eyrie','alliance','vagabond']:
      expect(page.locator('.own-resources .scoring-spaces > span')).to_have_count({'eyrie':8,'alliance':10,'vagabond':3}[lesson])
     def view():return page.evaluate("id=>fetch('/api/tutorials/'+id).then(r=>r.json()).then(r=>r.room)",lesson)
     for count in range(150):
      room=view();meta=room['tutorial']
      if meta['completed']:break
      if lesson=='lizard' and meta['stepId']=='liz-sacrifice' and meta['count']==1 and not retried:
       trace.append({'lesson':lesson,'step':meta['stepId'],'action':'retry-step'})
       page.locator('[data-action=tutorial-retry]').click()
       page.wait_for_function("v=>fetch('/api/tutorials/'+v.lesson).then(r=>r.json()).then(r=>r.room.version>v.version)",arg={'lesson':lesson,'version':room['version']},timeout=10000)
       reset=view();assert reset['tutorial']['count']==0 and reset['game']['lizard']['acolytes']==0
       page.reload();expect(page.locator('.tutorial-coach')).to_be_visible();assert view()['version']==reset['version'];retried=True;continue
      if count==2:
       page.reload();expect(page.locator('.tutorial-coach')).to_be_visible();assert view()['version']==room['version']
      if meta['ready']:
       trace.append({'lesson':lesson,'step':meta['stepId'],'action':'next'});page.locator('[data-action=tutorial-next]').click()
      else:
       action=plan(room);trace.append({'lesson':lesson,'step':meta['stepId'],'action':action})
       click_action(page,room['game'],action)
      page.wait_for_function("v=>fetch('/api/tutorials/'+v.lesson).then(r=>r.json()).then(r=>r.room.version>v.version)",arg={'lesson':lesson,'version':room['version']},timeout=10000)
      if not meta['ready'] and meta['stepId'] in ['move','cat-build','bird-add','wa-revolt','vg-quest','liz-recruit','liz-crusade','liz-hated']:page.screenshot(path=str(OUTPUT/(meta['stepId']+'.png')))
     assert view()['tutorial']['completed'],lesson
     if lesson=='lizard':assert retried
     print(json.dumps({'lesson':lesson,'commands':count,'completed':True}),flush=True)
     page.locator('.tutorial-coach [data-action=tutorials]').first.click();expect(page.locator('.tutorial-lesson')).to_have_count(6)
    assert all('已完成' in page.locator('.tutorial-lesson[data-lesson='+id+']').inner_text() for id in selected)
    page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(OUTPUT/'mobile-catalog.png'),full_page=True)
    page.locator('[data-action=tutorial-start][data-lesson=basics]').click();expect(page.locator('.tutorial-coach')).to_be_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(OUTPUT/'mobile-game.png'),full_page=True)
    assert not errors,errors
    report={'passed':True,'chapters':len(selected),'nodes':sum(l['stepCount'] for l in catalog if l['id'] in selected),'commands':len(trace),'pageErrors':errors,'checks':['normal signup and tutorial entry','all actions through existing map UI','reload restores every chapter','completion progress saved','mobile no overflow'],'fixture':'No browser-injected game states. Scenes are prepared by the tutorial server.'}
    (OUTPUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report),flush=True);browser.close()
  finally:
   (OUTPUT/'trace.json').write_text(json.dumps(trace,ensure_ascii=False,indent=2),encoding='utf-8');process.terminate();process.wait(timeout=10);log.close()
if __name__=='__main__':run()
