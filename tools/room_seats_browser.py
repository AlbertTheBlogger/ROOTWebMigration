# Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
"""Exercise four-seat waiting rooms through two independent browser players."""
import json,os,shutil,socket,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'audit/room-seats-browser'

def run():
 OUT.mkdir(parents=True,exist_ok=True)
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 with tempfile.TemporaryDirectory(prefix='room-seats-ui-') as folder:
  env={**os.environ,'DB_PATH':str(Path(folder)/'qa.sqlite')};env.pop('APP_ORIGIN',None)
  script="import {createApp} from './backend/server.mjs';const app=createApp({rateLimit:false,botDelay:600});"+f"app.server.listen({port},'127.0.0.1');"
  log=(OUT/'server.log').open('w',encoding='utf-8')
  process=subprocess.Popen([shutil.which('node'),'--input-type=module','-e',script],cwd=ROOT,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
  base=f'http://127.0.0.1:{port}';errors=[];checks=[]
  try:
   for _ in range(100):
    try:urllib.request.urlopen(base+'/api/health',timeout=1).close();break
    except OSError:time.sleep(.1)
   with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    host=browser.new_context(viewport={'width':1600,'height':1000}).new_page()
    guest=browser.new_context(viewport={'width':1366,'height':900}).new_page()
    for page,name in [(host,'seat_ui_host'),(guest,'seat_ui_guest')]:
     page.on('pageerror',lambda error:errors.append(str(error)));page.goto(base)
     page.get_by_role('button',name='注册账号',exact=True).click()
     page.locator('#auth [name=username]').fill(name);page.locator('#auth [name=password]').fill('seat-browser-only-password');page.locator('#auth button').click();expect(page.locator('#create')).to_be_visible()
    assert host.locator('#create [name=capacity]').count()==0
    expect(host.locator('#create [name=ruleset]')).to_have_value('root-lizard-cult-v6')
    host.locator('#create [name=title]').fill('四席位林间小聚');host.locator('#create button').click()
    expect(host.locator('.room-seat')).to_have_count(4);expect(host.locator('.empty-seat')).to_have_count(3)
    expect(host.locator('[data-action=start]')).to_be_disabled()
    code=host.locator('.code-large').inner_text().strip('# ')
    def view():return host.evaluate("code=>fetch('/api/rooms/'+code).then(r=>r.json()).then(r=>r.room)",code)
    def newer(version):host.wait_for_function("v=>fetch('/api/rooms/'+v.code).then(r=>r.json()).then(r=>r.room.version>v.version)",arg={'code':code,'version':version})
    def join():
     guest.locator('#join [name=code]').fill(code);guest.locator('#join [name=name]').fill('林间旅伴');guest.locator('#join button').click();expect(guest.locator('.room-seat')).to_have_count(4)
    join();expect(host.locator('.empty-seat')).to_have_count(2)
    host.locator('#profile [name=faction]').select_option('lizard');host.locator('#profile [name=name]').fill('林间执事')
    host.locator('#profile [name=name]').focus()
    guest.locator('#profile button[type=submit]').click();expect(guest.locator('#profile [data-action=ready]')).to_be_visible()
    expect(host.locator('.room-seat[data-seat="1"] .seat-status')).to_contain_text('已准备')
    expect(host.locator('#profile [name=name]')).to_have_value('林间执事')
    expect(host.locator('#profile [name=faction]')).to_have_value('lizard')
    assert host.locator('#profile [name=name]').evaluate('e=>e===document.activeElement')
    checks.append('peer SSE preserves unsaved name, faction and input focus')
    version=view()['version'];host.locator('[data-action=bot-add][data-seat="3"]').click();newer(version)
    expect(host.locator('.empty-seat[data-seat="2"]')).to_be_visible()
    expect(host.locator('.room-seat[data-seat="3"] [data-bot-faction]')).to_have_value('alliance')
    assert guest.locator('[data-bot-faction]').count()==0 and guest.locator('[data-action=bot-remove]').count()==0
    version=view()['version'];host.locator('[data-bot-faction]').select_option('lizard');newer(version)
    before=view();host.locator('#profile button[type=submit]').click();expect(host.locator('#toast')).to_contain_text('阵营已有玩家准备')
    after=view();assert after['version']==before['version'];assert after['members'][0]['name']=='seat_ui_host' and not after['members'][0]['ready']
    expect(host.locator('#profile [name=name]')).to_have_value('林间执事')
    checks.append('conflicting prepare rolls back server identity and retains local draft')
    version=view()['version'];host.locator('[data-bot-faction]').select_option('vagabond');newer(version)
    host.locator('#profile button[type=submit]').click();expect(host.locator('#profile [data-action=ready]')).to_be_visible()
    expect(host.locator('#profile [name=faction]')).to_be_disabled()
    expect(host.locator('[data-action=start]')).to_be_enabled()
    assert view()['members'][0]['name']=='林间执事'
    checks.append('combined name/faction prepare, host bot configuration, three occupied seats can start')
    host.screenshot(path=str(OUT/'desktop-three-seats.png'),full_page=True)
    host.set_viewport_size({'width':390,'height':844});assert host.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    host.locator('#profile [data-action=ready]').click();expect(host.locator('#profile [name=faction]')).to_be_enabled()
    host.locator('#profile [name=faction]').select_option('cat');host.locator('#profile button[type=submit]').click();expect(host.locator('#profile [data-action=ready]')).to_be_visible()
    version=view()['version'];host.locator('[data-action=bot-remove]').click();newer(version)
    expect(host.locator('.empty-seat[data-seat="3"]')).to_be_visible();assert view()['members'][1]['seat']==1
    version=view()['version'];host.locator('[data-action=bot-add][data-seat="3"]').click();newer(version)
    host.screenshot(path=str(OUT/'mobile-room.png'),full_page=True)
    assert host.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    checks.append('phone cancel/reselect/prepare and bot removal/re-add preserve seat holes')
    host.locator('[data-action=start]').click();expect(host.locator('.scoreboard .score')).to_have_count(3)
    expect(guest.locator('.scoreboard .score')).to_have_count(3)
    assert len(view()['game']['players'])==3
    host.once('dialog',lambda dialog:dialog.accept());host.locator('[data-action=delete-room]').click()
    expect(host.locator('#create')).to_be_visible();expect(guest.locator('#create')).to_be_visible()
    host.set_viewport_size({'width':1600,'height':1000})
    host.locator('#create [name=title]').fill('两位旅伴也能出发');host.locator('#create button').click();expect(host.locator('.room-seat')).to_have_count(4)
    code=host.locator('.code-large').inner_text().strip('# ');join()
    for page in [host,guest]:page.locator('#profile button[type=submit]').click();expect(page.locator('#profile [data-action=ready]')).to_be_visible()
    expect(host.locator('[data-action=start]')).to_be_enabled();expect(host.locator('.empty-seat')).to_have_count(2)
    saved=view();host.reload();expect(host.locator('#profile [data-action=ready]')).to_be_visible();assert view()['version']==saved['version']
    host.screenshot(path=str(OUT/'desktop-two-seats.png'),full_page=True)
    host.locator('[data-action=start]').click();expect(host.locator('.scoreboard .score')).to_have_count(2)
    assert view()['capacity']==4 and len(view()['game']['players'])==2
    checks.append('two humans start with two empty seats and confirmed identity survives reload')
    assert not errors,errors
    report={'passed':True,'pageErrors':errors,'checks':checks,'viewports':[[1600,1000],[390,844]],'scope':'Normal UI registration, create/join, seat configuration and start. Temporary database; no injected room or game states.'}
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False));browser.close()
  finally:process.terminate();process.wait(timeout=10);log.close()

if __name__=='__main__':run()
