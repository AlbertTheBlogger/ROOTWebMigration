# Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
"""Play twelve rounds through two real browser UIs without seeding game state."""
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'audit/v4/browser-longplay'


def ruler(c):
    cat=c['warriors']['cat']+sum(b['faction']=='cat' for b in c['buildings'])
    bird=c['warriors']['bird']+sum(b['faction']=='bird' for b in c['buildings'])
    return 'bird' if bird and bird>=cat else 'cat' if cat else None


def bird_action(g):
    col=g['currentDecreeColumn']
    for card in g['bird']['remaining'][col]:
        for c in g['board']:
            if card['suit'] not in ('wild',c['suit']): continue
            if col=='move' and c['warriors']['bird']:
                for target in c['links']:
                    if ruler(c)=='bird' or ruler(g['board'][target])=='bird':
                        return dict(type=col,from_id=c['id'],to=target,count=1,decree=card['id'])
            if col=='recruit':
                reserve=20-sum(a['warriors']['bird'] for a in g['board'])
                if not c['keep'] and any(b['type']=='roost' for b in c['buildings']) and reserve>=(2 if g['bird']['leader']=='charismatic' else 1):
                    return dict(type=col,clearing=c['id'],decree=card['id'])
            if col=='battle' and c['warriors']['bird'] and (c['warriors']['cat'] or c['keep'] or c['wood'] or any(b['faction']=='cat' for b in c['buildings'])):
                return dict(type=col,clearing=c['id'],decree=card['id'])
            if col=='build' and not c['keep'] and ruler(c)=='bird' and len(c['buildings'])+c['ruins']<c['slots'] and not any(b['type']=='roost' for b in c['buildings']) and sum(b['type']=='roost' for a in g['board'] for b in a['buildings'])<7:
                return dict(type=col,clearing=c['id'],decree=card['id'])
    raise AssertionError('No legal decree action while server still in decree')


def run():
    OUTPUT.mkdir(parents=True,exist_ok=True)
    with socket.socket() as probe:
        probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='v4-ui-',dir=ROOT/'audit') as temporary:
        env={**os.environ,'HOST':'127.0.0.1','PORT':str(port),'DB_PATH':str(Path(temporary)/'qa.sqlite'),'COOKIE_SECURE':'false'}
        env.pop('APP_ORIGIN',None)
        base=f'http://127.0.0.1:{port}'
        process=None
        def start():
            nonlocal process
            process=subprocess.Popen([shutil.which('node'),str(ROOT/'backend/server.mjs')],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            for _ in range(100):
                try:
                    with urllib.request.urlopen(base+'/api/health',timeout=1) as r:
                        if r.status==200:return
                except OSError:time.sleep(.05)
            raise RuntimeError('Server did not start')
        def stop():
            if process and process.poll() is None:process.terminate();process.wait(timeout=10)
        start()
        try:
            with sync_playwright() as pw:
                browser=pw.chromium.launch(channel='msedge',headless=True)
                pages=[browser.new_context(viewport={'width':1360,'height':950}).new_page() for _ in range(2)]
                errors=[]
                for i,page in enumerate(pages):
                    page.on('pageerror',lambda error:errors.append(str(error)))
                    page.goto(base)
                    page.get_by_role('button',name='注册账号',exact=True).click()
                    page.locator('#auth [name=username]').fill('v4_ui_'+str(i))
                    page.locator('#auth [name=password]').fill('isolated-ui-test-only-123')
                    page.locator('#auth button').click();expect(page.locator('#create')).to_be_visible()
                cat,bird=pages
                cat.locator('#create [name=title]').fill('猫鹰十二轮网页验收')
                cat.locator('#create [name=name]').fill('长局猫')
                cat.locator('#create button').click();expect(cat.locator('.code-large')).to_be_visible()
                code=re.search(r'\d{6}',cat.locator('.code-large').inner_text())[0]
                bird.locator('#join [name=code]').fill(code);bird.locator('#join [name=name]').fill('长局鹰')
                bird.locator('#join button').click();expect(bird.locator('.code-large')).to_be_visible()
                for page in pages:page.get_by_role('button',name='准备',exact=True).click()
                cat.locator('#ruleset').select_option('root-cats-birds-v4')
                start_button=cat.get_by_role('button',name='开始游戏',exact=True)
                expect(start_button).to_be_enabled()
                with cat.expect_response(lambda r:r.url.endswith('/command') and r.request.method=='POST') as started:
                    start_button.click()
                assert started.value.status==200,started.value.text()
                print('Started standard setup',flush=True)
                expect(cat.locator('.map')).to_be_visible()
                def snapshot(page):return page.evaluate("code=>fetch('/api/rooms/'+code).then(r=>r.json()).then(b=>b.room)",code)
                counts={};restarts=0;steps=0;last_restart=0
                while steps<1000:
                    room=snapshot(cat);g=room['game']
                    if g['winner'] or g['turnsCompleted']>=24:break
                    q=g.get('choice')
                    owner_id=q['playerId'] if q else g['players'][g['turn']]['id']
                    faction=next(p['faction'] for p in g['players'] if p['id']==owner_id)
                    page=cat if faction=='cat' else bird
                    room=snapshot(page);g=room['game'];q=g.get('choice')
                    me=next(p for p in g['players'] if p['id']==owner_id)
                    if q:
                        options=q['options']
                        option=next((o for o in options if o['id']=='commander'),options[0]) if q['kind']=='setup-leader' else next((o for o in options if o['id']=='pass'),options[0])
                        action=dict(type='choice',choice=q['choiceId'],option=option['id'])
                    elif g['phase']=='birdsong':action=dict(type='birdsong-end')
                    elif g['phase']=='wood':action=dict(type='wood',clearing=g['woodPending'][0])
                    elif g['phase']=='craft':action=dict(type='craft-done')
                    elif g['phase']=='daylight':action=dict(type='end')
                    elif g['phase']=='leader':action=dict(type='leader',leader=g['leaders'][0])
                    elif g['phase']=='discard':action=dict(type='discard',card=me['hand'][0]['id'])
                    elif g['phase']=='decree-add':
                        if g['bird']['added']:action=dict(type='decree-ready')
                        else:
                            suits=[c['suit'] for c in g['board'] if any(b['type']=='roost' for b in c['buildings'])]
                            card=next((c for c in me['hand'] if c['suit']!='wild' and c['suit'] not in suits),me['hand'][0])
                            action=dict(type='decree-add',card=card['id'],column='recruit')
                    elif g['phase']=='new-roost':
                        eligible=[c for c in g['board'] if not c['keep'] and len(c['buildings'])+c['ruins']<c['slots']]
                        target=min(eligible,key=lambda c:sum(c['warriors'].values()))
                        action=dict(type='new-roost',clearing=target['id'])
                    elif g['phase']=='decree':action=bird_action(g) if g['currentDecreeColumn'] else dict(type='end')
                    else:raise AssertionError(g['phase'])
                    kind=action['type'];counts[kind]=counts.get(kind,0)+1
                    if kind=='choice':button=page.locator(f'button[data-action=choice][data-choice="{action["choice"]}"][data-option="{action["option"]}"]')
                    elif kind in ('birdsong-end','craft-done','end','decree-ready'):button=page.locator(f'button[data-action="{kind}"]')
                    else:
                        form=page.locator('#'+kind)
                        details=form.locator('xpath=ancestor::details')
                        if details.count() and details.get_attribute('open') is None:details.locator('summary').click()
                        for key,value in action.items():
                            if key=='type':continue
                            if key=='decree':page.locator('#decree-card').select_option(value);continue
                            field=form.locator('[name="'+('from' if key=='from_id' else key)+'"]')
                            if field.evaluate('el=>el.tagName')=='SELECT':field.select_option(str(value))
                            else:field.fill(str(value))
                        button=form.locator('button')
                    expect(button).to_be_visible()
                    with page.expect_response(lambda r:r.url.endswith('/command') and r.request.method=='POST') as response:
                        button.click()
                    result=response.value
                    assert result.status==200,result.text()
                    steps+=1
                    if steps%25==0:print(json.dumps({'steps':steps,'round':g['round'],'phase':g['phase']}),flush=True)
                    if g['turnsCompleted']>=last_restart+8:
                        before=snapshot(page);stop();start();restarts+=1;last_restart=g['turnsCompleted']
                        for tab in pages:tab.reload();expect(tab.locator('.map')).to_be_visible()
                        assert snapshot(page)['game']==before['game']
                room=snapshot(cat)
                assert room['game']['turnsCompleted']>=24,room['game']['round']
                assert not errors,errors
                cat.screenshot(path=str(OUTPUT/'round-13-cat.png'),full_page=True)
                bird.screenshot(path=str(OUTPUT/'round-13-bird.png'),full_page=True)
                report=dict(passed=True,fixture_injection=False,round=room['game']['round'],turns=room['game']['turnsCompleted'],steps=steps,restarts=restarts,actions=counts,page_errors=errors)
                (OUTPUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
                print(json.dumps(report),flush=True);browser.close()
        finally:stop()


if __name__=='__main__':run()
