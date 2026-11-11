"""Exercise admin forms through a browser with an isolated local database."""
import json,os,shutil,socket,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'audit/admin-browser'

def run():
 OUTPUT.mkdir(parents=True,exist_ok=True)
 with socket.socket() as probe:
  probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
 with tempfile.TemporaryDirectory(prefix='admin-browser-') as folder:
  env={**os.environ,'DB_PATH':str(Path(folder)/'qa.sqlite')};env.pop('APP_ORIGIN',None)
  script=("import {createApp,hashPassword} from './backend/server.mjs';import {randomUUID} from 'node:crypto';"
    "const app=createApp({rateLimit:false});const id=randomUUID();"
    "app.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id,'admin',await hashPassword('test-admin-password'),Date.now());"
    "app.db.prepare(\"INSERT INTO account_access(user_id,role) VALUES(?,'admin')\").run(id);"
    f"app.server.listen({port},'127.0.0.1');")
  log=(OUTPUT/'server.log').open('w',encoding='utf-8')
  process=subprocess.Popen([shutil.which('node'),'--input-type=module','-e',script],cwd=ROOT,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
  base=f'http://127.0.0.1:{port}'
  try:
   for _ in range(100):
    try:urllib.request.urlopen(base+'/api/health',timeout=1).close();break
    except OSError:time.sleep(.1)
   with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    host=browser.new_context().new_page();admin=browser.new_context().new_page();errors=[]
    for page in [host,admin]:page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base)
    host.get_by_role('button',name='注册账号',exact=True).click()
    host.locator('#auth [name=username]').fill('admin_browser_player');host.locator('#auth [name=password]').fill('test-player-password');host.locator('#auth button').click()
    expect(host.locator('#create')).to_be_visible()
    host.locator('#create [name=title]').fill('管理员页面验收');host.locator('#create button').click();expect(host.locator('.code-large')).to_be_visible()
    code=host.locator('.code-large').inner_text().strip('# ')
    uid=host.evaluate("()=>fetch('/api/me').then(r=>r.json()).then(r=>r.user.id)")
    admin.locator('#auth [name=username]').fill('admin');admin.locator('#auth [name=password]').fill('test-admin-password');admin.locator('#auth button').click()
    expect(admin.get_by_role('heading',name='管理控制台',exact=True)).to_be_visible();assert admin.locator('#create').count()==0
    card=admin.locator(f'[data-admin-room="{code}"]')
    card.locator('[name=visibility]').select_option('private');card.locator('form button').click();expect(card).to_contain_text('私密')
    expect(host.locator('.heading .badge')).to_contain_text('密码房间')
    card.locator('[name=password]').fill('browser-room-secret');card.locator('form button').click();expect(card).to_contain_text('已设密码')
    card.locator('[name=visibility]').select_option('public');card.locator('form button').click();expect(card).to_contain_text('未设密码')
    user=admin.locator(f'[data-admin-user="{uid}"]')
    user.locator('[data-action=admin-user-logout]').click();expect(host.locator('#auth')).to_be_visible()
    user.locator('[name=password]').fill('reset-player-password');user.locator('form button').click();expect(user).to_be_visible()
    host.locator('#auth [name=username]').fill('admin_browser_player');host.locator('#auth [name=password]').fill('reset-player-password');host.locator('#auth button').click();expect(host.locator('#create')).to_be_visible()
    user.locator('[data-action=admin-user-disable]').click();expect(user).to_contain_text('已停用')
    user.locator('[data-action=admin-user-enable]').click();expect(user).to_contain_text('正常')
    admin.screenshot(path=str(OUTPUT/'desktop.png'),full_page=True)
    admin.set_viewport_size({'width':390,'height':844});assert admin.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    admin.on('dialog',lambda d:d.accept());card.locator('[data-action=admin-room-delete]').click();expect(card).to_have_count(0)
    admin.reload();expect(admin.get_by_role('heading',name='管理控制台',exact=True)).to_be_visible()
    assert not errors,errors
    report={'passed':True,'checks':['admin login routes to management','private/public and password forms','force logout reaches login page over SSE','reset password permits new login','disable and enable','forced room deletion','refresh restores admin role','mobile no overflow'],'pageErrors':errors,'productionTouched':False}
    (OUTPUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report),flush=True);browser.close()
  finally:
   process.terminate();process.wait(timeout=10);log.close()
if __name__=='__main__':run()
