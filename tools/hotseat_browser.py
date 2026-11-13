# Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
"""Single-account hotseat through real controls, with refresh and multi-tab privacy."""
import json,os,shutil,socket,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from four_browser import click_action,pick_action

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'audit/dev113/browser';OUT.mkdir(parents=True,exist_ok=True)

def run():
 full_game=os.environ.get('HOTSEAT_FULL_GAME')=='1'
 with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
 with tempfile.TemporaryDirectory(prefix='hotseat-ui-') as folder:
  env={**os.environ,'DB_PATH':str(Path(folder)/'qa.sqlite')};env.pop('APP_ORIGIN',None)
  log=(OUT/'server.log').open('w',encoding='utf-8')
  script="import {createApp} from './backend/server.mjs';const app=createApp({rateLimit:false});"+f"app.server.listen({port},'127.0.0.1');"
  process=subprocess.Popen([shutil.which('node'),'--input-type=module','-e',script],cwd=ROOT,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
  base=f'http://127.0.0.1:{port}';trace=[];errors=[]
  try:
   for _ in range(100):
    try:urllib.request.urlopen(base+'/api/health',timeout=1).close();break
    except OSError:time.sleep(.1)
   with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True);context=browser.new_context(viewport={'width':1366,'height':900})
    context.add_init_script("""(()=>{
      const capture=data=>{if(data.room?.game&&(!window.__hotseatRoom||data.room.version>=window.__hotseatRoom.version))window.__hotseatRoom=data.room;};
      const original=window.fetch;window.fetch=async(...args)=>{const response=await original(...args);if(args[1]?.headers?.['X-Woodland-Controller'])response.clone().json().then(capture).catch(()=>{});return response;};
      const Source=window.EventSource;window.EventSource=class extends Source{constructor(...args){super(...args);this.addEventListener('message',e=>{try{capture({room:JSON.parse(e.data)});}catch{}});}};
    })();""")
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base)
    page.get_by_role('button',name='注册账号',exact=True).click();page.locator('#auth [name=username]').fill('hotseat_browser');page.locator('#auth [name=password]').fill('hotseat-browser-only');page.locator('#auth button').click();expect(page.locator('#create')).to_be_visible()
    page.locator('#create [name=playMode]').select_option('hotseat');page.locator('#create [name=title]').fill('同屏验收');page.locator('#create [name=name]').fill('玩家一');page.locator('#create button').click()
    expect(page.locator('.room-seats')).to_be_visible()
    for seat in [1,2,3]:page.locator(f'[data-action=local-add][data-seat="{seat}"]').click();expect(page.locator('[data-local-profile]')).to_have_count(seat+1)
    for seat,faction in enumerate(['cat','bird','alliance','vagabond']):
     form=page.locator(f'.room-seat[data-seat="{seat}"] form');form.locator('[name=name]').fill('玩家'+str(seat+1));form.locator('[name=faction]').select_option(faction);form.locator('button[type=submit]').click();expect(form.locator('[name=name]')).to_have_attribute('readonly','')
    page.screenshot(path=str(OUT/'seats.png'),full_page=True)
    page.locator('[data-action=start]').click();expect(page.locator('.hotseat-handoff')).to_be_visible()
    if os.environ.get('HOTSEAT_QUICK')=='1':
     page.locator('[data-action=preferences]').click();page.locator('.experience-dialog [name=motion]').select_option('off');page.locator('[data-close-experience]').click()
    code=page.locator('.code-large').inner_text().split()[-1];code=code.replace('#','').strip()
    def view():return page.evaluate("code=>fetch('/api/rooms/'+code).then(r=>r.json()).then(r=>r.room)",code)
    # This read has no controller capability and must always remain public.
    assert all('hand' not in q for q in view()['game']['players'])
    reloaded=False;second_checked=False;paused=False;restarted=False;actions=0;handoffs=0
    for count in range(2500 if full_game else 250):
     current=page.evaluate('window.__hotseatRoom')
     if current and current['game'].get('winner'):state=current;break
     if page.locator('.hotseat-handoff').count():
      assert page.locator('.hand-panel').count()==0
      if count==0:page.wait_for_timeout(450);page.screenshot(path=str(OUT/'handoff.png'),full_page=True)
      page.locator('[data-action=hotseat-confirm]').click();handoffs+=1;expect(page.locator('.hotseat-status')).to_be_visible();page.wait_for_function('window.__hotseatRoom?.viewerId')
     # Read the currently rendered authoritative projection without using action APIs.
     room=page.evaluate("()=>{const id=document.querySelector('.hotseat-status');return id?.textContent}")
     # The observer fetch stays public; derive own projection through the page's
     # actual event stream, captured below by observing responses/dispatch.
     room=page.evaluate("code=>window.__hotseatRoom",code)
     if not room:raise AssertionError('No captured room projection')
     if not reloaded and room['game']['setup']['complete']:
      page.locator('.hand .card').first.click();expect(page.locator('dialog[open]')).to_be_visible()
      page.reload();expect(page.locator('.hotseat-handoff')).to_be_visible();assert page.locator('dialog[open]').count()==0
      reloaded=True;continue
     if reloaded and not second_checked:
      other=context.new_page();other.goto(base+'/#room='+code);expect(other.locator('.hotseat-handoff')).to_be_visible();assert other.locator('.hand-panel').count()==0;other.close();second_checked=True
     if second_checked and not paused:
      page.locator('[data-action=hotseat-lock]').click();expect(page.locator('.hotseat-handoff')).to_be_visible();assert page.locator('.hand-panel').count()==0;paused=True;continue
     if room['game']['turnsCompleted']>=4 and not restarted:
      process.terminate();process.wait(timeout=10);expect(page.locator('.hotseat-handoff')).to_be_visible();assert page.locator('.hand-panel').count()==0
      process=subprocess.Popen([shutil.which('node'),'--input-type=module','-e',script],cwd=ROOT,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
      for _ in range(100):
       try:urllib.request.urlopen(base+'/api/health',timeout=1).close();break
       except OSError:time.sleep(.1)
      restarted=True;continue
     g=room['game'];me=next(q for q in g['players'] if q['id']==room['viewerId'])
     action=pick_action(g,me);trace.append({'actor':me['faction'],'phase':g['phase'],'action':action})
     click_action(page,g,action);actions+=1
     page.wait_for_function("v=>window.__hotseatRoom?.version>v",arg=room['version'])
     state=page.evaluate('window.__hotseatRoom')
     if full_game and actions%30==0:print(json.dumps({'actions':actions,'turnsCompleted':state['game']['turnsCompleted'],'round':state['game']['round']}),flush=True)
     if state['game'].get('winner') or (not full_game and state['game']['turnsCompleted']>=8):break
    assert reloaded and second_checked and paused and restarted and handoffs>=8
    assert not errors,errors
    report={'passed':True,'actions':actions,'handoffs':handoffs,'turnsCompleted':state['game']['turnsCompleted'],'pageErrors':errors,'checks':['one account/four local seats','private preview removed on reload','new tab starts public','manual hide','disconnect hides private information','server restart and resume'],'scope':'No game state injection or direct action API calls.'}
    if full_game:
     assert state['game'].get('winner'),'Natural game did not reach a winner'
     report['winner']=state['game']['winner'];report['round']=state['game']['round'];report['ruleset']=state['game']['ruleset']
     expect(page.locator('[data-action=new-game]')).to_be_visible();page.screenshot(path=str(OUT/'natural-finish.png'),full_page=True)
     page.locator('[data-action=new-game]').click();expect(page.locator('.room-seats')).to_be_visible()
     waiting=view();assert waiting['status']=='waiting' and waiting.get('game') is None and all(not m['ready'] for m in waiting['members'])
     report['checks']+=['natural winner through normal UI only','next game retains seats and resets readiness']
    if os.environ.get('HOTSEAT_QUICK')=='1':report['motionSetting']='off via normal preferences for this long-play run; defaults unchanged'
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report));browser.close()
  finally:
   (OUT/'trace.json').write_text(json.dumps(trace,ensure_ascii=False,indent=2),encoding='utf-8');process.terminate();process.wait(timeout=10);log.close()

if __name__=='__main__':run()
