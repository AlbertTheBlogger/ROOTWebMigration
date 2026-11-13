# Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
"""Targeted UI component fixtures plus normal cats opening/restart controls."""
import json,os,shutil,socket,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from four_browser import click_action
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'audit/dev113/feedback-components'
FIXTURE="""
import * as r from './backend/rules/versions/base-four.mjs';
let s=r.createGame(['cat','bird','alliance'].map(f=>({userId:f,name:f,faction:f})),()=>0);
while(!s.setup.complete){const q=s.effects.frames[0];s=r.applyAction(s,q.playerId,{type:'choice',choiceId:q.id,optionId:q.options[0].id},()=>0);}
s.turn=s.players.findIndex(p=>p.id==='cat');s.phase='evening';s.effects.frames=[];s.usedEffects=[];s.combat=null;
for(const c of s.board){c.warriors={cat:0,bird:0,alliance:0};c.buildings=[];c.sympathy=false;c.wood=0;c.ruins=0;}
s.board[0].warriors.cat=3;s.board[1].warriors.cat=2;s.players[s.turn].crafted=[{id:'shoe',kind:'cobbler',archetype:'CobblerRabbit',name:'补鞋匠'}];
const before=r.projectGame(s,'cat'),after=r.projectGame(r.applyAction(s,'cat',{type:'move',from:0,to:1,count:3,cobbler:true},()=>0),'cat');
s.phase='daylight';s.actions=3;s.players[s.turn].crafted=[];s.players[s.turn].hand=[];s.board[1].sympathy=true;
const outrage0=r.projectGame(s,'cat'),outrage1=r.projectGame(r.applyAction(s,'cat',{type:'move',from:0,to:1,count:2},()=>0),'cat');
s.turn=s.players.findIndex(p=>p.id==='alliance');s.phase='revolt';s.alliance.supporters=s.deck.filter(c=>c.suit===s.board[1].suit||c.suit==='wild').slice(0,2);
const revolt0=r.projectGame(s,'alliance'),revolt1=r.projectGame(r.applyAction(s,'alliance',{type:'revolt',clearing:1},()=>0),'alliance');
console.log(JSON.stringify({before,after,outrage0,outrage1,revolt0,revolt1}));
"""

def run():
 OUT.mkdir(parents=True,exist_ok=True);data=json.loads(subprocess.check_output([shutil.which('node'),'--input-type=module','-e',FIXTURE],cwd=ROOT,text=True,encoding='utf-8'))
 with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
 with tempfile.TemporaryDirectory(prefix='feedback-ui-') as folder:
  env={**os.environ,'DB_PATH':str(Path(folder)/'qa.sqlite')};env.pop('APP_ORIGIN',None)
  log=(OUT/'server.log').open('w',encoding='utf-8');proc=subprocess.Popen([shutil.which('node'),'--input-type=module','-e',f"import{{createApp}}from'./backend/server.mjs';createApp({{rateLimit:false}}).server.listen({port},'127.0.0.1')"],cwd=ROOT,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
  base=f'http://127.0.0.1:{port}';errors=[]
  try:
   for _ in range(100):
    try:urllib.request.urlopen(base+'/api/health',timeout=1).close();break
    except OSError:time.sleep(.1)
   with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True);page=browser.new_page(viewport={'width':1366,'height':900});page.on('pageerror',lambda e:errors.append(str(e)))
    html='<meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><main id="fixture"></main><script type="module">'+"""
import {mountMapControls,pickMapClearing,resetMapControls} from '/map-controls.js';import {observePresentation} from '/motion.js';import {clearingContents} from '/clearing-ui.js';
const data=DATA,art=await fetch('/asset-manifest.json').then(r=>r.json());
function paint(g,controls=false){resetMapControls();document.querySelector('#fixture').innerHTML='<div class="map-card" style="height:680px;position:relative;margin:15px"><svg class="map" viewBox="15 20 1170 720" style="width:100%;height:100%">'+g.board.map(c=>{const a={...c,...art.board.clearings[c.id]};return `<g class="clearing" data-action="clearing" data-id="${c.id}"><ellipse class="ground" cx="${a.x}" cy="${a.y}" rx="66" ry="54"/><foreignObject x="${a.x-78}" y="${a.y-60}" width="156" height="170"><div xmlns="http://www.w3.org/1999/xhtml" class="clearing-marker flat-marker">${clearingContents(a,art)}</div></foreignObject></g>`}).join('')+'</svg></div>'+(controls?'<section class="actions"><h2>轮到你了</h2><details data-category="补鞋匠"><summary>补鞋匠</summary><form data-type="faction-action"><select name="option">'+g.factionActions.map((o,i)=>`<option value="${i}">${o.label}</option>`).join('')+'</select><button>使用补鞋匠移动</button></form></details></section>':'');
if(controls){mountMapControls({game:g,userId:'cat',version:1,gameId:'component'});document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();window.submitted=g.factionActions[Number(e.target.elements.option.value)].action;});}}
document.addEventListener('click',e=>{const c=e.target.closest('[data-action=clearing]');if(c)pickMapClearing(Number(c.dataset.id));});
window.control=()=>{observePresentation(null,art);paint(data.before,true);};window.replay=kind=>{observePresentation(null,art);observePresentation(data[kind+'0'],art,{context:kind});paint(data[kind+'1']);observePresentation(data[kind+'1'],art,{context:kind});};window.move=()=>{observePresentation(null,art);observePresentation(data.before,art,{context:'move'});paint(data.after);observePresentation(data.after,art,{context:'move'});};window.repaint=()=>{paint(data.after);observePresentation(data.after,art,{context:'move'});};window.control();window.ready=true;
""".replace('DATA',json.dumps(data,ensure_ascii=False))+'</script>'
    page.route('**/feedback-fixture',lambda route:route.fulfill(content_type='text/html; charset=utf-8',body=html));page.goto(base+'/feedback-fixture');page.wait_for_function('window.ready')
    for width,height in [(1366,900),(390,844)]:
     page.set_viewport_size({'width':width,'height':height});page.evaluate('window.control()');page.locator('[data-action=clearing][data-id="0"]').click();page.locator('[data-action=clearing][data-id="1"]').click();quantity=page.locator('.map-context [aria-label="移动数量"]');expect(quantity).to_be_visible();quantity.select_option('3');page.locator('.map-context form button').click();assert page.evaluate('window.submitted.count')==3
    page.set_viewport_size({'width':1366,'height':900});page.evaluate('window.move()');expect(page.locator('.presentation-moving-unit')).to_be_visible();unit=page.locator('.clearing[data-id="1"] .clearing-unit.cat .unit-number');expect(unit).to_have_text('2');page.evaluate('window.repaint()');expect(unit).to_have_text('2');page.wait_for_function("document.querySelector('.map-card').dataset.presentationBusy==='false'");expect(unit).to_have_text('5')
    page.evaluate("window.replay('outrage')");expect(page.locator('.presentation-layer[data-kind=outrage]')).to_be_visible(timeout=5000);assert page.locator('.presentation-layer[data-kind=supporter]').count()==0;started=time.monotonic();expect(page.locator('.presentation-layer[data-kind=supporter]')).to_be_visible(timeout=2500);assert time.monotonic()-started>=.7;page.wait_for_function("document.querySelector('.map-card').dataset.presentationBusy==='false'")
    page.evaluate("window.replay('revolt')");banner=page.locator('.presentation-layer[data-kind=revolt] .presentation-announcement');expect(banner).to_be_visible();bounds=banner.bounding_box();assert bounds['width']<=421 and bounds['height']<=110,bounds;page.wait_for_timeout(400);page.screenshot(path=str(OUT/'revolt.png'))
    # Normal authenticated UI for chapter restart, highlighted setup and automatic wood.
    page.goto(base);page.get_by_role('button',name='注册账号',exact=True).click();page.locator('#auth [name=username]').fill('feedback_smoke');page.locator('#auth [name=password]').fill('feedback-smoke-password');page.locator('#auth button').click();expect(page.locator('#create')).to_be_visible();page.get_by_role('button',name='新手教程',exact=True).click();page.locator('[data-action=tutorial-start][data-lesson=cats]').click();expect(page.locator('.tutorial-dialogue')).to_be_visible();page.once('dialog',lambda d:d.accept());page.locator('[data-action=tutorial-restart]').click();expect(page.locator('.guide-heading h3')).to_contain_text('王国的基石');assert page.locator('.map-stage:visible').count()==0;assert page.locator('.map-context:visible').count()==0,'Empty choice popup covers the lesson title during dialogue'
    page.reload();expect(page.locator('.tutorial-dialogue')).to_be_visible();expect(page.locator('.map-context')).not_to_be_visible();assert page.locator('.guide-heading h3').evaluate('e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}');page.screenshot(path=str(OUT/'cats-restart.png'))
    def view():return page.evaluate("fetch('/api/tutorials/cats').then(r=>r.json()).then(r=>r.room)")
    for _ in range(50):
     room=view();m=room['tutorial'];g=room['game']
     if m['stepId']=='cat-actions':break
     if m['guide']['canAdvance']:page.locator('[data-action=tutorial-guide-next]').click()
     elif m['ready']:page.locator('[data-action=tutorial-next]').click()
     elif m['guide'].get('auto'):pass
     else:
      target=page.locator('.clearing.actionable').first;assert target.locator('.ground').evaluate("e=>getComputedStyle(e).fill")!='rgba(0, 0, 0, 0)';q=g['choice'];click_action(page,g,{'type':'choice','choiceId':q['choiceId'],'optionId':q['options'][0]['id']})
     page.wait_for_function("v=>fetch('/api/tutorials/cats').then(r=>r.json()).then(r=>r.room.version>v)",arg=room['version'])
     if m['stepId']=='cat-wood' and m['guide'].get('auto') and not m['ready']:
      expect(page.locator('.presentation-layer[data-kind=wood]')).to_be_visible();assert view()['game']['board'][0]['wood']==1
    else:raise AssertionError('Opening did not finish')
    keep=page.locator('.clearing[data-id="0"] .clearing-token.keep');expect(keep).to_be_visible();assert keep.locator('img').evaluate('i=>i.complete&&i.naturalWidth>0');page.screenshot(path=str(OUT/'cats-opening.png'));assert not errors,errors
    report={'passed':True,'checks':['component fixture: Cobbler quantity selection on desktop and phone','component fixture: arrivals deferred through mid-motion rerender','component fixture: outrage then supporter, 1 second each','component fixture: compact revolt announcement','normal UI: restart and reload without empty choice popup; heading is unobstructed','normal UI: translucent setup highlights','normal UI: automatic wood with original Keep retained'],'pageErrors':errors,'scope':'Component fixtures use actual rule projections, not full natural games. Opening uses normal authenticated controls.'};(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report));browser.close()
  finally:proc.terminate();proc.wait(timeout=10);log.close()
if __name__=='__main__':run()
