import json,os,socket,subprocess,tempfile,time,urllib.request,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
with tempfile.TemporaryDirectory(prefix='choice-ui-') as folder:
 env={**os.environ,'DB_PATH':str(Path(folder)/'test.sqlite')};env.pop('APP_ORIGIN',None)
 log=open(root/'audit/choice-ui-server.log','w')
 proc=subprocess.Popen([shutil.which('node'),'--input-type=module','-e',f"import{{createApp}}from'./backend/server.mjs';createApp({{rateLimit:false}}).server.listen({port},'127.0.0.1')"],cwd=root,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
 base=f'http://127.0.0.1:{port}'
 try:
  for _ in range(100):
   try:urllib.request.urlopen(base+'/api/health',timeout=1);break
   except OSError:time.sleep(.1)
  with sync_playwright() as p:
   browser=p.chromium.launch(channel='msedge',headless=True);report=[]
   for width,height in [(1912,948),(1366,768),(1024,600),(960,600),(1280,720),(390,844),(320,640),(740,390)]:
    page=browser.new_page(viewport={'width':width,'height':height});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    html='''<link rel="stylesheet" href="/styles.css"><div class="map-card" style="height:680px;margin-top:20px"><div class="map-toolbar"></div></div><section class="actions"><h2>选择游侠角色</h2><div class="stack">'''+''.join(f'<button data-action="choice" data-choice="vagabond-character" data-option="{key}"><img class="choice-art" src="/assets/suits/fox.webp" alt="{label}">{label}</button>' for key,label in [('thief','盗贼'),('tinker','工匠'),('ranger','猎人')])+'''</div></section><script type="module">
import{decorate}from'/experience.js';import{mountMapControls}from'/map-controls.js';
const game={ruleset:'root-base-four-v5',phase:'setup',turn:0,round:1,players:[{id:'me',name:'测试',hand:[]}],choice:{choiceId:'vagabond-character',playerId:'me',prompt:'选择游侠角色',options:[{id:'thief'},{id:'tinker'},{id:'ranger'}]}};
decorate(game,'me',{cards:{},leaders:{},characters:{}},{});mountMapControls({game,userId:'me',version:0,gameId:'fixture'});
document.addEventListener('click',e=>{const b=e.target.closest('[data-action=choice]');if(b)window.submitted=b.dataset.option});window.ready=true;
</script>'''
    page.route('**/choice-fixture',lambda route:route.fulfill(content_type='text/html; charset=utf-8',body='<meta charset="utf-8">'+html));page.goto(base+'/choice-fixture');page.wait_for_function('()=>window.ready')
    if width<=760:
     page.evaluate("()=>{const b=document.querySelector('.map-stage');b.textContent='行军 · 选择终点';b.classList.remove('stage-intro');void b.offsetWidth;b.classList.add('stage-intro')}")
     for delay in [0,350,750]:
      page.wait_for_timeout(delay)
      banner=page.locator('.map-stage').bounding_box();board=page.locator('.map-card').bounding_box()
      assert banner['y']-board['y']<10 and banner['height']<=32
      assert page.locator('.map-stage').evaluate("e=>getComputedStyle(e).animationName")=='none'
     page.screenshot(path=str(root/f'audit/mobile-march-hint-{width}.png'))
     if height<500:
      report.append({'viewport':[width,height],'marchHintInToolbar':True});page.close();continue
    card=page.locator('[data-map-choice=ranger]');card.locator('img').click();expect(page.locator('dialog[open]')).to_have_count(0)
    confirm=page.locator('[data-action=choice][data-option=ranger]');expect(confirm).to_be_visible();box=confirm.bounding_box();assert box['y']>=0 and box['y']+box['height']<=height
    expect(page.locator('.map-selected-choice')).to_have_text('已选：猎人')
    # Scrolling a short popup must not let the sticky minimize control cover
    # the sticky confirmation, and minimize must keep a working reopen entry.
    page.locator('.map-context').evaluate('e=>e.scrollTop=e.scrollHeight')
    confirm.scroll_into_view_if_needed()
    assert confirm.evaluate("e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}"),f'confirmation covered at {width}x{height}'
    page.locator('.map-context').evaluate('e=>e.scrollTop=0')
    page.locator('[data-map-minimize]').click();expect(page.locator('.map-context')).not_to_be_visible()
    page.locator('[data-map-minimize]').click();expect(confirm).to_be_visible()
    page.locator('.map-choice-confirmation button').filter(has_text='取消').click();expect(confirm).to_have_count(0)
    card.locator('img').click();confirm.click();assert page.evaluate('window.submitted')=='ranger';assert not errors,errors
    page.screenshot(path=str(root/f'audit/choice-ui-{width}.png'));report.append({'viewport':[width,height],'artTapSelects':True,'confirmInViewport':True,'cancelWorks':True,'submitted':'ranger'});page.close()
   browser.close();(root/'audit/choice-ui-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report))
 finally:proc.terminate();proc.wait(timeout=10);log.close()
