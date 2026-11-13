# Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
"""PC approval and phone claims through normal controls, without state injection."""
import json,os,shutil,socket,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from four_browser import click_action,pick_action

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'audit/dev113/claims-browser'
CAPTURE="""(()=>{const save=d=>{if(d.room&&(!window.__claimsRoom||d.room.version>=window.__claimsRoom.version))window.__claimsRoom=d.room;};const f=window.fetch;window.fetch=async(...a)=>{const r=await f(...a);if(a[1]?.headers?.['X-Woodland-Controller'])r.clone().json().then(save).catch(()=>{});return r;};const E=window.EventSource;window.EventSource=class extends E{constructor(...a){super(...a);this.addEventListener('message',e=>{try{save({room:JSON.parse(e.data)});}catch{}});}};})();"""

def battle_check(pc,phone,database,code,seat):
 """Explicit isolated real-rules fixture, followed by normal browser decisions."""
 seed="""
 import {DatabaseSync} from 'node:sqlite';import {applyAction} from './backend/rules/versions/registry.mjs';
 const db=new DatabaseSync(process.argv[1]),code=process.argv[2],seat=process.argv[3];
 const row=db.prepare('SELECT payload,version FROM rooms WHERE code=?').get(code),room=JSON.parse(row.payload);let g=room.game;
 while(!g.setup.complete){const q=g.effects.frames[0];g=applyAction(g,q.playerId,{type:'choice',choiceId:q.id,optionId:q.options[0].id},()=>0);}
 g.turn=g.players.findIndex(p=>p.faction==='cat');g.phase='daylight';g.actions=3;g.march=0;g.effects.frames=[];g.combat=null;
 for(const p of g.players)g.deck.push(...p.hand.splice(0));
 for(const p of g.players){const i=g.deck.findIndex(c=>c.kind==='ambush'&&c.suit==='wild');if(i<0)throw Error('Missing ambush');p.hand.push(...g.deck.splice(i,1));}
 g.board[0].warriors.cat=3;g.board[0].warriors.bird=3;room.game=g;room.controlEpoch++;room.controlActor=g.players[g.turn].id;room.controlTurn=g.turnsCompleted;
 db.prepare('UPDATE rooms SET payload=?,version=? WHERE code=?').run(JSON.stringify(room),row.version+1,code);
 db.prepare('UPDATE games SET state=? WHERE id=?').run(JSON.stringify(g),room.gameId);db.close();
 """
 subprocess.check_output([shutil.which('node'),'--input-type=module','-e',seed,str(database),code,seat],cwd=ROOT,text=True,encoding='utf-8')
 pc.reload();phone.reload();expect(pc.locator('.hotseat-handoff')).to_be_visible();expect(phone.locator('.companion-shell[data-companion-view=public]')).to_be_visible()
 pc.locator('[data-action=hotseat-confirm]').click();expect(pc.locator('.hotseat-status')).to_be_visible()
 pc.locator('[data-action=preferences]').click();pc.locator('.experience-dialog [name=motion]').select_option('off');pc.locator('[data-close-experience]').click()
 room=pc.evaluate('window.__claimsRoom');version=room['version'];click_action(pc,room['game'],{'type':'battle','clearing':0,'defender':'bird'})
 phone.wait_for_function('v=>window.__claimsRoom.version>v&&window.__claimsRoom.companion.canDecide',arg=version)
 expect(phone.locator('[data-action=mobile-confirm]')).to_be_visible();assert phone.locator('.hand-panel').count()==0
 phone.locator('[data-action=mobile-confirm]').click();expect(phone.locator('.companion-private')).to_be_visible()
 room=phone.evaluate('window.__claimsRoom');assert room['viewerId']==seat and room['game']['choice']['kind']=='ambush'
 assert all('hand' not in p for p in room['game']['players'] if p['id']!=seat)
 expect(pc.locator('.hotseat-handoff')).to_be_visible();assert pc.locator('.hand-panel').count()==0
 phone.locator('.companion-private > summary').click();expect(phone.locator('.hand-panel')).to_be_visible()
 phone.screenshot(path=str(OUT/'battle-private-landscape.png'),full_page=True);phone.locator('.hand .card').first.click();expect(phone.locator('dialog[open]')).to_be_visible()
 # Releasing an active defender must close its private decision immediately.
 if not pc.locator('.claim-manager').evaluate('e=>e.open'):pc.locator('.claim-manager summary').click()
 pc.locator(f'[data-action=claim-release][data-user="{seat}"]').click();expect(phone.locator('.companion-shell[data-companion-view=public]')).to_be_visible();assert phone.locator('.hand-panel').count()==0;assert phone.locator('dialog[open]').count()==0
 phone.locator('.companion-info > summary').click();phone.locator(f'[data-action=claim-request][data-user="{seat}"]').click();expect(pc.locator('[data-action=claim-approve]')).to_be_visible();pc.locator('[data-action=claim-approve]').click()
 phone.locator('.companion-info > summary').click();expect(phone.locator('[data-action=mobile-confirm]')).to_be_visible();phone.locator('[data-action=mobile-confirm]').click();expect(phone.locator('.companion-private')).to_be_visible()
 room=phone.evaluate('window.__claimsRoom');q=room['game']['choice'];assert q['kind']=='ambush';option=next(o for o in q['options'] if o['id']!='pass')
 click_action(phone,room['game'],{'type':'choice','choiceId':q['choiceId'],'optionId':option['id']})
 expect(phone.locator('.companion-shell[data-companion-view=public]')).to_be_visible();assert phone.locator('.hand-panel').count()==0
 pc.locator('[data-action=hotseat-confirm]').click();expect(pc.locator('.hotseat-status')).to_be_visible();room=pc.evaluate('window.__claimsRoom');q=room['game']['choice'];assert q['kind']=='counter-ambush'
 option=next(o for o in q['options'] if o['id']!='pass');click_action(pc,room['game'],{'type':'choice','choiceId':q['choiceId'],'optionId':option['id']})
 pc.wait_for_function('v=>window.__claimsRoom.version>v',arg=room['version']);expect(phone.locator('.companion-shell[data-companion-view=public]')).to_be_visible()
 final=phone.evaluate('window.__claimsRoom');assert final['viewerId'] is None and all('hand' not in p for p in final['game']['players'])
 assert final['companion']['canDecide'] is False
 return ['isolated battle UI: PC attack to phone ambush to PC counter-ambush','isolated battle UI: release revokes private view, reclaim requires fresh confirmation']
def run():
 OUT.mkdir(parents=True,exist_ok=True)
 with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
 with tempfile.TemporaryDirectory(prefix='claims-ui-') as folder:
  env={**os.environ,'DB_PATH':str(Path(folder)/'qa.sqlite')};env.pop('APP_ORIGIN',None)
  script="import {createApp} from './backend/server.mjs';const app=createApp({rateLimit:false});"+f"app.server.listen({port},'127.0.0.1');"
  log=(OUT/'server.log').open('w',encoding='utf-8');process=subprocess.Popen([shutil.which('node'),'--input-type=module','-e',script],cwd=ROOT,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
  base=f'http://127.0.0.1:{port}';errors=[];actions=0
  try:
   for _ in range(100):
    try:urllib.request.urlopen(base+'/api/health',timeout=1).close();break
    except OSError:time.sleep(.1)
   with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    contexts=[browser.new_context(viewport={'width':1366,'height':900}),browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)]
    for c in contexts:c.add_init_script(CAPTURE)
    pc,phone=[c.new_page() for c in contexts]
    for i,page in enumerate([pc,phone]):
     page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base);page.get_by_role('button',name='注册账号',exact=True).click();page.locator('#auth [name=username]').fill('claims_browser_'+str(i));page.locator('#auth [name=password]').fill('claims-browser-password');page.locator('#auth button').click();expect(page.locator('#create')).to_be_visible()
    pc.locator('#create [name=playMode]').select_option('hotseat');pc.locator('#create [name=title]').fill('手机认领验收');pc.locator('#create [name=name]').fill('猫咪玩家');pc.locator('#create button').click();pc.locator('[data-action=local-add][data-seat="1"]').click()
    expect(pc.locator('[data-local-profile]')).to_have_count(2)
    for seat,faction in enumerate(['cat','bird']):
     form=pc.locator(f'.room-seat[data-seat="{seat}"] form');form.locator('[name=faction]').select_option(faction);form.locator('button[type=submit]').click();expect(form.locator('[name=name]')).to_have_attribute('readonly','')
    code=pc.locator('.code-large').inner_text().split()[-1];phone.locator('#companion-join [name=code]').fill(code);phone.locator('#companion-join button').click();expect(phone.locator('.companion-claims')).to_be_visible()
    seat=pc.locator('.room-seat[data-seat="1"]').get_attribute('data-user')
    phone.locator(f'[data-action=claim-request][data-user="{seat}"]').click();expect(phone.get_by_text('等待房主确认',exact=True)).to_be_visible();expect(pc.locator('[data-action=claim-approve]')).to_be_visible();pc.screenshot(path=str(OUT/'approval.png'),full_page=True)
    pc.locator('[data-action=claim-approve]').click();expect(phone.locator('.companion-summary')).to_contain_text('已认领');phone.reload();expect(phone.locator('.companion-summary')).to_contain_text('已认领');assert phone.locator('.hand-panel').count()==0
    pc.locator('[data-action=start]').click();expect(pc.locator('.hotseat-handoff')).to_be_visible();expect(phone.locator('.companion-shell[data-companion-view=public]')).to_be_visible()
    for _ in range(30):
     if phone.locator('[data-action=mobile-confirm]').count():break
     if pc.locator('[data-action=hotseat-confirm]').count():pc.locator('[data-action=hotseat-confirm]').click();expect(pc.locator('.hotseat-status')).to_be_visible()
     room=pc.evaluate('window.__claimsRoom');g=room['game'];me=next(p for p in g['players'] if p['id']==room['viewerId']);action=pick_action(g,me);click_action(pc,g,action);actions+=1;pc.wait_for_function('v=>window.__claimsRoom.version>v',arg=room['version'])
    expect(phone.locator('[data-action=mobile-confirm]')).to_be_visible();phone.set_viewport_size({'width':844,'height':390});phone.locator('[data-action=mobile-confirm]').click();expect(phone.locator('.companion-private')).to_be_visible();phone.locator('.companion-private > summary').click();expect(phone.locator('.hand-panel')).to_be_visible();phone.screenshot(path=str(OUT/'private-landscape.png'));phone.locator('.companion-private > summary').click()
    phone.locator('.companion-private > summary').click();phone.locator('.hand-panel img').first.wait_for(state='visible');phone.wait_for_function("[...document.querySelectorAll('.hand-panel img')].every(i=>i.complete&&i.naturalWidth>0)");phone.screenshot(path=str(OUT/'private-landscape.png'));phone.locator('.companion-private > summary').click();phone.screenshot(path=str(OUT/'decision-landscape.png'))
    if not pc.locator('.claim-manager').evaluate('e=>e.open'):pc.locator('.claim-manager summary').click()
    pc.locator(f'[data-action=claim-release][data-user="{seat}"]').click();expect(phone.locator('.companion-shell[data-companion-view=public]')).to_be_visible();phone.locator('.companion-info > summary').click();expect(phone.locator('.companion-claims')).to_be_visible();assert phone.locator('.hand-panel').count()==0
    phone.locator(f'[data-action=claim-request][data-user="{seat}"]').click();expect(pc.locator('[data-action=claim-approve]')).to_be_visible();pc.locator('[data-action=claim-approve]').click();expect(phone.locator('[data-action=mobile-confirm]')).to_be_visible();assert phone.locator('.hand-panel').count()==0
    phone.locator('.companion-info > summary').click();phone.locator('[data-action=mobile-confirm]').click();expect(phone.locator('.companion-private')).to_be_visible();room=phone.evaluate('window.__claimsRoom');assert room['viewerId']==seat
    action={'type':'choice','choiceId':room['game']['choice']['choiceId'],'optionId':room['game']['choice']['options'][0]['id']};click_action(phone,room['game'],action);actions+=1;expect(phone.locator('.companion-shell[data-companion-view=public]')).to_be_visible();assert phone.locator('.hand-panel').count()==0
    for w,h in [(390,844),(844,390),(740,360)]:
     phone.set_viewport_size({'width':w,'height':h});phone.wait_for_timeout(150);bounds=phone.locator('.companion-board').bounding_box();assert bounds['width']>=w-2 and bounds['height']>=h-110,bounds;assert phone.evaluate('document.documentElement.scrollWidth<=innerWidth+1');phone.screenshot(path=str(OUT/f'board-{w}x{h}.png'))
    svg=phone.locator('svg.map');initial=svg.get_attribute('viewBox');phone.locator('[data-companion-camera=in]').click();zoomed=svg.get_attribute('viewBox');assert initial!=zoomed
    box=svg.bounding_box();x=box['x']+box['width']*.5;y=box['y']+box['height']*.5;selected=phone.locator('.clearing.selected').get_attribute('data-id');phone.mouse.move(x,y);phone.mouse.down();phone.mouse.move(x+65,y+25,steps=8);phone.mouse.up();panned=svg.get_attribute('viewBox');assert panned!=zoomed;assert phone.locator('.clearing.selected').get_attribute('data-id')==selected
    touch=contexts[1].new_cdp_session(phone)
    def pinch(kind,d):touch.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if kind=='touchEnd' else [{'x':x-d,'y':y,'id':1},{'x':x+d,'y':y,'id':2}]})
    pinch('touchStart',35)
    for d in range(40,81,5):pinch('touchMove',d);phone.wait_for_timeout(20)
    pinch('touchEnd',0);assert float(svg.get_attribute('viewBox').split()[2])<float(panned.split()[2]);panned=svg.get_attribute('viewBox')
    before=json.dumps(phone.evaluate('window.__claimsRoom.game.board'),sort_keys=True)
    for _ in range(20):
     if pc.locator('[data-action=hotseat-confirm]').count():pc.locator('[data-action=hotseat-confirm]').click();expect(pc.locator('.hotseat-status')).to_be_visible()
     room=pc.evaluate('window.__claimsRoom');g=room['game'];me=next(p for p in g['players'] if p['id']==room['viewerId']);click_action(pc,g,pick_action(g,me));actions+=1;phone.wait_for_function('v=>window.__claimsRoom.version>v',arg=room['version'])
     if json.dumps(phone.evaluate('window.__claimsRoom.game.board'),sort_keys=True)!=before:break
    else:raise AssertionError('Phone did not see board update')
    assert phone.locator('svg.map').get_attribute('viewBox')==panned;phone.locator('[data-companion-camera=reset]').click();assert phone.locator('svg.map').get_attribute('viewBox')==initial
    assert phone.evaluate('document.documentElement.scrollWidth<=innerWidth+1');phone.screenshot(path=str(OUT/'phone-board.png'),full_page=True)
    battle_checks=battle_check(pc,phone,Path(folder)/'qa.sqlite',code,seat) if os.environ.get('CLAIMS_BATTLE')=='1' else []
    assert not errors,errors
    report={'passed':True,'actions':actions,'pageErrors':errors,'checks':['separate phone account','PC approval','reload retains binding','no extra player seat','phone handles its own real setup choice in landscape','release hides private information immediately','reclaim requires fresh confirmation','public map updates through SSE','390x844 portrait, 844x390 and 740x360 landscape without overflow','zoom and pan without accidental selection','two-finger touch pinch','camera retained across SSE; reset restores full board'],'scope':'Normal controls and CDP touch gestures; no browser-injected game state or direct action API calls. Battle authorization has separate isolated HTTP coverage; not a physical device or Safari test.'}
    if battle_checks:
     report['checks']+=battle_checks;report['battleActions']=3;report['scope']='Normal setup, claims and map flow plus an explicitly seeded isolated real-rules battle fixture in temporary SQLite. All battle inputs use normal browser controls; not a natural battle encounter, physical phone or Safari test.'
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report));browser.close()
  finally:process.terminate();process.wait(timeout=10);log.close()
if __name__=='__main__':run()
