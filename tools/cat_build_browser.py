import json,os,socket,subprocess,tempfile,time,urllib.request,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1];fixture=json.loads((root/'audit/cat-build-projection.json').read_text(encoding='utf-8'));print('fixture version',fixture['room']['version'],flush=True)
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
with tempfile.TemporaryDirectory(prefix='build-ui-') as folder:
 env={**os.environ,'DB_PATH':str(Path(folder)/'test.sqlite')};env.pop('APP_ORIGIN',None)
 log=open(root/'audit/build-ui-server.log','w');proc=subprocess.Popen([shutil.which('node'),'--input-type=module','-e',f"import{{createApp}}from'./backend/server.mjs';createApp({{rateLimit:false}}).server.listen({port},'127.0.0.1')"],cwd=root,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW);base=f'http://127.0.0.1:{port}'
 try:
  for _ in range(100):
   try:urllib.request.urlopen(base+'/api/health',timeout=1);break
   except OSError:time.sleep(.1)
  with sync_playwright() as p:
   browser=p.chromium.launch(channel='msedge',headless=True);page=browser.new_page(viewport={'width':1366,'height':768});submitted=[]
   scenario=os.environ.get('BUILD_CASE','normal')
   if scenario!='normal':fixture['room']['game']['mapActions']=[a for a in fixture['room']['game']['mapActions'] if a['type']!='build' or (scenario=='workshop-only' and a['building']=='workshop')]
   print('scenario',scenario,flush=True)
   def api(route):
    path=route.request.url.split('/api/')[1]
    if path.endswith('/events'):return route.fulfill(content_type='text/event-stream',body=': fixture\n\n')
    if path=='me':data={'user':fixture['user']}
    elif path=='rooms':data={'rooms':[]}
    elif path.endswith('/command'):
     submitted.append(route.request.post_data_json);data={'room':fixture['room']}
    else:data={'room':fixture['room']}
    route.fulfill(json=data)
   page.route('**/api/**',api);page.goto(base+'/#room=429463');expect(page.locator('[data-map-mode=build]')).to_be_visible();page.locator('[data-map-mode=build]').click();page.locator('[data-action=clearing][data-id="4"]').click()
   print(page.locator('[data-map-building]').evaluate('(e)=>({value:e.value,options:[...e.options].map(o=>({value:o.value,disabled:o.disabled})),visible:!!e.getClientRects().length})'),flush=True)
   print('popup',page.locator('.map-context').is_visible(),'banner',page.locator('.map-stage').inner_text(),flush=True)
   page.screenshot(path=str(root/f'audit/cat-build-{scenario}.png'),full_page=True)
   if scenario=='none':
    assert not page.locator('.map-context').is_visible()
    assert '目前无法建造' in page.locator('.map-stage').inner_text()
    assert page.locator('[data-map-building]').is_disabled()
   else:
    assert page.locator('.map-context').is_visible()
    if scenario=='workshop-only':assert page.locator('[data-map-building]').input_value()=='workshop'
    page.wait_for_timeout(1100)
    page.locator('[data-action=clearing][data-id="4"]').click()
    assert page.locator('.map-stage').evaluate("e=>e.getAnimations().every(a=>a.playState==='finished')"),'Repeated clearing clicks restart the intro'
   if page.locator('#build').is_visible():
    page.locator('[data-map-minimize]').click();assert not page.locator('.map-context').is_visible()
    page.locator('[data-action=clearing][data-id="4"]').click();assert page.locator('.map-context').is_visible()
    page.locator('#build button').click();page.wait_for_timeout(300);print('submitted',submitted,flush=True);assert submitted[-1]['command']['action']['building']==('workshop' if scenario=='workshop-only' else 'sawmill');assert submitted[-1]['command']['action']['clearing']==4
   browser.close()
 finally:proc.terminate();proc.wait(timeout=10);log.close()
