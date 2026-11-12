# Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
"""Verify shared effects in a real two-human room without injecting game states."""
import json,os,shutil,socket,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from four_browser import click_action,pick_action

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'audit/experience-room'

def run():
 OUT.mkdir(exist_ok=True)
 with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
 with tempfile.TemporaryDirectory(prefix='experience-ui-') as folder:
  env={**os.environ,'DB_PATH':str(Path(folder)/'qa.sqlite')};env.pop('APP_ORIGIN',None)
  script="import {createApp} from './backend/server.mjs';const app=createApp({rateLimit:false});"+f"app.server.listen({port},'127.0.0.1');"
  log=(OUT/'server.log').open('w',encoding='utf-8');proc=subprocess.Popen([shutil.which('node'),'--input-type=module','-e',script],cwd=ROOT,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
  base=f'http://127.0.0.1:{port}';errors=[];observed=[[],[]];trajectories=[[],[]];trace=[]
  try:
   for _ in range(100):
    try:urllib.request.urlopen(base+'/api/health',timeout=1).close();break
    except OSError:time.sleep(.1)
   with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True);pages=[]
    for i in range(2):
     page=browser.new_context(viewport={'width':1366,'height':900}).new_page();pages.append(page)
     page.expose_function('recordEffect',lambda kind,seq,index=i:observed[index].append({'kind':kind,'seq':seq}))
     page.expose_function('recordTrajectory',lambda seq,first,last,index=i:trajectories[index].append({'seq':seq,'first':first,'last':last}))
     page.add_init_script("""(()=>{const seen=new WeakSet();new MutationObserver(records=>{for(const r of records)for(const el of r.addedNodes)if(el.nodeType===1&&el.matches('.presentation-layer')&&!seen.has(el)){
      seen.add(el);window.recordEffect(el.dataset.kind,el.dataset.eventSeq);
      if(el.dataset.kind==='move'){const points=[];const sample=()=>{if(!el.isConnected){if(points.length>1)window.recordTrajectory(el.dataset.eventSeq,points[0],points[points.length-1]);return;}
       const token=el.querySelector('.presentation-moving-unit'),p=Number(el.style.getPropertyValue('--progress'));
       if(token&&p>.1&&p<.9){const r=token.getBoundingClientRect();points.push([r.x,r.y]);}requestAnimationFrame(sample);};requestAnimationFrame(sample);}
     }}).observe(document,{subtree:true,childList:true});})();""")
     page.on('pageerror',lambda error:errors.append(str(error)));page.goto(base)
     page.get_by_role('button',name='注册账号',exact=True).click();page.locator('#auth [name=username]').fill('experience_ui_'+str(i));page.locator('#auth [name=password]').fill('experience-local-password');page.locator('#auth button').click();expect(page.locator('#create')).to_be_visible()
    host,guest=pages;host.locator('#create [name=title]').fill('动态表现验证');host.locator('#create button').click();expect(host.locator('.room-seat')).to_have_count(4)
    code=host.locator('.code-large').inner_text().strip('# ')
    guest.locator('#join [name=code]').fill(code);guest.locator('#join button').click();expect(guest.locator('.room-seat')).to_have_count(4)
    for page in pages:page.locator('#profile button[type=submit]').click();expect(page.locator('#profile [data-action=ready]')).to_be_visible()
    host.locator('[data-action=start]').click()
    for page in pages:expect(page.locator('.scoreboard .score')).to_have_count(2)
    users={page.evaluate("()=>fetch('/api/me').then(r=>r.json()).then(r=>r.user.id)"):page for page in pages}
    def view(page=host):return page.evaluate("code=>fetch('/api/rooms/'+code).then(r=>r.json()).then(r=>r.room)",code)
    moved=False
    for n in range(80):
     room=view();g=room['game']
     if moved and g['round']>=3:break
     actor=g['choice']['playerId'] if g.get('choice') else g['players'][g['turn']]['id'];page=users[actor];room=view(page);g=room['game'];me=next(p for p in g['players'] if p['id']==actor)
     if g.get('march') and me['faction']=='cat' and not g.get('choice'):action={'type':'march-end'}
     elif g['phase']=='daylight' and me['faction']=='cat' and not g.get('choice'):
      action=next((a for a in g['mapActions'] if a['type']==('move' if not moved else 'build')),None)
      action=action or {'type':'end'}
     else:action=pick_action(g,me)
     before=g.get('presentationSeq',0);click_action(page,g,action);trace.append({'phase':g['phase'],'action':action})
     page.wait_for_function("v=>fetch('/api/rooms/'+v.code).then(r=>r.json()).then(r=>r.room.version>v.version)",arg={'code':code,'version':room['version']})
     if action['type']=='move' and not moved:
      current=view();event=next(e for e in current['game']['presentationEvents'] if e['seq']>before and e['kind']=='move');seq=str(event['seq'])
      sprite=page.locator(f'.presentation-layer[data-kind=move][data-event-seq="{seq}"] .presentation-moving-unit')
      expect(sprite).to_be_visible(timeout=15000)
      page.screenshot(path=str(OUT/'move-in-progress.png'))
      # A local map selection rerenders the board without resubmitting the move.
      page.locator('.map [data-action=clearing][data-id="8"]').click()
      for client in pages:client.wait_for_function("()=>document.querySelector('.map-card')?.dataset.presentationBusy!=='true'&&!document.querySelector('.presentation-layer')",timeout=30000)
      page.wait_for_timeout(100)
      assert all(sum(e['kind']=='move' and e['seq']==seq for e in events)==1 for events in observed)
      assert all(any(t['seq']==seq and abs(t['last'][0]-t['first'][0])+abs(t['last'][1]-t['first'][1])>2 for t in samples) for samples in trajectories),trajectories
      count=len(observed[1]);guest.reload();expect(guest.locator('.scoreboard .score')).to_have_count(2);guest.wait_for_timeout(150)
      assert len(observed[1])==count,'Reload replayed historical effects'
      moved=True
     # A batch can have no visible layer between stages while still playing.
     for client in pages:client.wait_for_function("()=>document.querySelector('.map-card')?.dataset.presentationBusy!=='true'&&!document.querySelector('.presentation-layer')",timeout=30000)
    assert moved
    for page in pages:page.wait_for_function("()=>document.querySelector('.map-card')?.dataset.presentationBusy!=='true'&&!document.querySelector('.presentation-layer')",timeout=30000)
    kinds=[sorted({e['kind'] for e in events}) for events in observed]
    assert all({'move','draw','build'}.issubset(set(group)) for group in kinds),kinds
    assert not errors,errors
    report={'passed':True,'commands':len(trace),'round':view()['game']['round'],'motionKindsByViewer':kinds,'pageErrors':errors,'checks':['same authoritative movement visible to both human clients','sprite position changes over time','local rerender does not replay the event','refresh skips historical effects','normal-game build and draw share tutorial presentation'],'scope':'Temporary two-human room; all setup and actions via normal controls, no injected game states.'}
    (OUT/'report.json').write_bytes(json.dumps(report,ensure_ascii=False,indent=2).encode('utf-8'));print(json.dumps(report),flush=True);browser.close()
  finally:(OUT/'trace.json').write_bytes(json.dumps(trace,ensure_ascii=False,indent=2).encode('utf-8'));proc.terminate();proc.wait(timeout=10);log.close()

if __name__=='__main__':run()
