# Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
"""Run two-player browser acceptance against an isolated, temporary local database."""
import json
import os
from pathlib import Path
import re
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
RULESET = os.environ.get('QA_RULESET','root-battle-lab-v2')
OUTPUT = ROOT / 'audit/browser-acceptance' / ({'root-card-lab-v3':'v3','root-cats-birds-v4':'v4'}.get(RULESET,'.'))


def run():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with socket.socket() as socket_probe:
        socket_probe.bind(('127.0.0.1', 0))
        port = socket_probe.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='woodland-browser-', dir=ROOT/'audit') as temporary:
        temporary_path = Path(temporary).resolve()
        assert temporary_path.parent == (ROOT/'audit').resolve()
        database = temporary_path/'test.sqlite'
        environment = {**os.environ, 'PORT':str(port), 'HOST':'127.0.0.1', 'DB_PATH':str(database), 'COOKIE_SECURE':'false'}
        environment.pop('APP_ORIGIN', None)
        base = f'http://127.0.0.1:{port}'
        process = None
        def start():
            nonlocal process
            process = subprocess.Popen([shutil.which('node'), str(ROOT/'backend/server.mjs')], cwd=ROOT, env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            for attempt in range(100):
                if process.poll() is not None:
                    raise RuntimeError('Local acceptance server exited')
                try:
                    with urllib.request.urlopen(base+'/api/health', timeout=1) as response:
                        if response.status==200: return
                except OSError:
                    time.sleep(.1)
            raise RuntimeError('Local acceptance server did not become ready')
        def stop():
            if process and process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
        start()
        errors=[]
        try:
            with sync_playwright() as playwright:
                browser=playwright.chromium.launch(channel='msedge', headless=True)
                cat_context=browser.new_context(viewport={'width':1360,'height':900})
                bird_context=browser.new_context(viewport={'width':1360,'height':900})
                # Exercise the same ID fallback required by non-secure HTTP origins.
                for context in (cat_context,bird_context):
                    context.add_init_script("Object.defineProperty(Crypto.prototype,'randomUUID',{value:undefined,configurable:true})")
                cat=cat_context.new_page()
                bird=bird_context.new_page()
                # Delay auth and room loading independently to reproduce unresponsive registration.
                cat.add_init_script("""const originalFetch=window.fetch.bind(window);
                  window.fetch=async (...args)=>{
                    const path=String(args[0]);
                    if(path==='/api/auth/register'||path==='/api/rooms')
                      await new Promise(resolve=>setTimeout(resolve,1800));
                    return originalFetch(...args);
                  };""")
                for page in (cat,bird):
                    page.on('pageerror',lambda error:errors.append(str(error)))
                for page,username in ((cat,'browser_cat'),(bird,'browser_bird')):
                    page.goto(base)
                    page.get_by_role('button',name='注册账号',exact=True).click()
                    page.locator('#auth [name=username]').fill(username)
                    page.locator('#auth [name=password]').fill('local-browser-test-123')
                    page.locator('#auth button').click()
                    if page==cat:
                        expect(page.locator('#auth button')).to_be_disabled()
                        expect(page.locator('#auth [role=status]')).to_contain_text('正在连接服务器')
                    expect(page.locator('#create')).to_be_visible()
                    if page==cat:
                        expect(page.locator('#toast')).to_contain_text('正在加载房间')
                        # Wait until the delayed room list has finished before creating a room.
                        page.wait_for_timeout(2200)
                    assert page.evaluate('typeof crypto.randomUUID')=='undefined'
                cat.locator('#create [name=title]').fill('中断恢复验收房')
                cat.locator('#create [name=name]').fill('验收猫')
                cat.locator('#create [name=password]').fill('private-room-test')
                cat.locator('#create button').click()
                expect(cat.locator('.code-large')).to_be_visible()
                code=re.search(r'\d{6}',cat.locator('.code-large').inner_text())[0]
                bird.locator('#join [name=code]').fill(code)
                bird.locator('#join [name=name]').fill('验收鹰')
                bird.locator('#join [name=password]').fill('private-room-test')
                bird.locator('#join button').click()
                expect(bird.locator('.code-large')).to_be_visible()
                cat.get_by_role('button',name='准备',exact=True).click()
                bird.get_by_role('button',name='准备',exact=True).click()
                expect(cat.get_by_role('button',name='开始游戏',exact=True)).to_be_enabled()
                cat.locator('#ruleset').select_option(RULESET)
                assert cat.locator('#ruleset').input_value()==RULESET
                cat.get_by_role('button',name='开始游戏',exact=True).click()
                if RULESET=='root-cats-birds-v4':
                    for step in range(5):
                        snapshot=cat.evaluate("code=>fetch('/api/rooms/'+code).then(r=>r.json())",code)['room']
                        owner=next(p for p in snapshot['game']['players'] if p['id']==snapshot['game']['choice']['playerId'])
                        page=cat if owner['faction']=='cat' else bird
                        choice_id=snapshot['game']['choice']['choiceId']
                        options=page.locator('button[data-action=choice][data-choice="'+choice_id+'"]')
                        expect(options.first).to_be_visible()
                        target=page.locator('button[data-action=choice][data-option=despot]') if step==4 else options.first
                        target.click()
                        expect(page.locator('button[data-choice="'+choice_id+'"]')).to_have_count(0)
                expect(cat.locator('.map .clearing')).to_have_count(12)
                expect(bird.locator('.map .clearing')).to_have_count(12)
                if RULESET=='root-cats-birds-v4':
                    for page in (cat,bird):
                        expect(page.locator('.map3d-clearing')).to_have_count(12)
                    snapshot=cat.evaluate("code=>fetch('/api/rooms/'+code).then(r=>r.json())",code)['room']
                    for area in snapshot['game']['board']:
                        marker=cat.locator(f'.map3d-clearing[data-id="{area["id"]}"]')
                        expect(marker.locator('.building-slot')).to_have_count(area['slots'])
                        for slot in marker.locator('.building-slot').all():
                            box=slot.bounding_box()
                            assert abs(box['width']-box['height'])<1, box
                        expect(marker.locator('.building-slot.occupied')).to_have_count(len(area['buildings'])+area.get('ruins',0))
                        for faction in ('cat','bird'):
                            unit=marker.locator('.clearing-unit.'+faction)
                            expect(unit).to_have_count(int(area['warriors'][faction]>0))
                            if area['warriors'][faction]:
                                expect(unit.locator('.unit-number')).to_have_text(str(area['warriors'][faction]))
                        expect(marker.locator('.clearing-suit img')).to_have_count(1)
                    board_box=cat.locator('.map-card').bounding_box()
                    assert board_box['width']>cat.viewport_size['width']*.9
                    assert cat.locator('.game-panels').bounding_box()['y']>board_box['y']+board_box['height']
                    for index in range(12):
                        marker=cat.locator(f'.map3d-clearing[data-id="{index}"]')
                        marker.click()
                        expect(cat.locator(f'.map3d-clearing[data-id="{index}"]')).to_have_attribute('aria-pressed','true')
                    cat.get_by_role('button',name='轻量棋盘',exact=True).click()
                    expect(cat.locator('svg.map')).to_be_visible()
                    for area in snapshot['game']['board']:
                        expect(cat.locator(f'svg.map .clearing[data-id="{area["id"]}"] .building-slot')).to_have_count(area['slots'])
                    cat.screenshot(path=str(OUTPUT/'overview-flat.png'),full_page=True)
                    cat.get_by_role('button',name='三维棋盘',exact=True).click()
                    cat.get_by_role('button',name='复位视角',exact=True).click()
                if RULESET in ('root-card-lab-v3','root-cats-birds-v4'):
                    expect(cat.locator('img.card-art')).to_have_count(3)
                    cat.evaluate("""async()=>{const images=Array.from(document.images);images.forEach(img=>img.loading='eager');await Promise.all(images.map(img=>img.decode()));if(images.some(img=>!img.naturalWidth))throw Error('Original art failed to load')}""")
                    cat.screenshot(path=str(OUTPUT/'original-art-start.png'),full_page=True)
                if RULESET in ('root-card-lab-v3','root-cats-birds-v4'):
                    connection=sqlite3.connect(database)
                    payload=json.loads(connection.execute('SELECT payload FROM rooms WHERE code=?',(code,)).fetchone()[0])
                    game=payload['game']
                    game['turn']=0
                    game['phase']='craft' if RULESET=='root-cats-birds-v4' else 'daylight'
                    cards=game['deck']+[card for owner in game['players'] for card in owner['hand']]
                    anvil=next(card for card in cards if card['archetype']=='AnvilFox')
                    game['deck']=[card for card in game['deck'] if card['id']!=anvil['id']]
                    for owner in game['players']:
                        owner['hand']=[card for card in owner['hand'] if card['id']!=anvil['id']]
                    game['players'][0]['hand'].append(anvil)
                    game['board'][5]['buildings'].append({'faction':'cat','type':'workshop'})
                    connection.execute('UPDATE rooms SET payload=? WHERE code=?',(json.dumps(payload,ensure_ascii=False),code))
                    connection.execute('UPDATE games SET state=? WHERE id=?',(json.dumps(game,ensure_ascii=False),payload['gameId']))
                    connection.commit()
                    connection.close()
                    cat.reload();bird.reload()
                    if RULESET=='root-cats-birds-v4':
                        cat.locator('form[data-type=craft]').filter(has=cat.locator('input[value="'+anvil['id']+'"]')).locator('button').click()
                    else:
                        cat.locator('button[data-action=craft][data-card="'+anvil['id']+'"]').click()
                    expect(cat.get_by_text('已制作物品 锤子',exact=True)).to_be_visible()
                    state=cat.evaluate("code=>fetch('/api/rooms/'+code).then(response=>response.json())",code)
                    assert state['room']['game']['itemSupply']['hammer']==0
                    assert state['room']['game']['players'][0]['score']==2
                # Set a reproducible legal battle position in this temporary QA database only.
                connection=sqlite3.connect(database)
                payload=json.loads(connection.execute('SELECT payload FROM rooms WHERE code=?',(code,)).fetchone()[0])
                game=payload['game']
                game['turn']=0
                game['phase']='daylight'
                game['board'][3]['warriors']={'cat':3,'bird':3}
                game['board'][3]['buildings']=[]
                game['players'][0]['hand']=[{'id':'qa-counter','kind':'ambush','name':'鸟类反伏击','suit':'wild'},{'id':'qa-hospital','kind':'suit','name':'医院测试牌','suit':'wild'}]
                game['players'][1]['hand']=[{'id':'qa-ambush','kind':'ambush','name':'鸟类伏击','suit':'wild'}]
                connection.execute('UPDATE rooms SET payload=? WHERE code=?',(json.dumps(payload,ensure_ascii=False),code))
                connection.execute('UPDATE games SET state=? WHERE id=?',(json.dumps(game,ensure_ascii=False),payload['gameId']))
                connection.commit()
                connection.close()
                cat.reload();bird.reload()
                expect(cat.locator('#battle')).to_be_attached()
                cat.locator('summary').filter(has_text=re.compile('^战斗$')).click()
                cat.locator('#battle select').select_option('3')
                cat.locator('#battle button').click()
                expect(bird.get_by_role('button',name='打出鸟类伏击',exact=True)).to_be_visible()
                expect(cat.get_by_role('button',name='打出鸟类伏击',exact=True)).to_have_count(0)
                bird.get_by_role('button',name='打出鸟类伏击',exact=True).click()
                cat.get_by_role('button',name='不抵消伏击',exact=True).click()
                hospital_prompt=cat.get_by_text(re.compile('^是否救回')) if RULESET=='root-cats-birds-v4' else cat.get_by_text('是否使用野战医院？',exact=True)
                expect(hospital_prompt).to_be_visible()
                state=cat.evaluate("code=>fetch('/api/rooms/'+code).then(response=>response.json())",code)
                choice_id=state['room']['game']['choice']['choiceId']
                cat.screenshot(path=str(OUTPUT/'hospital-before-restart.png'),full_page=True)
                stop()
                start()
                cat.reload();bird.reload()
                expect(hospital_prompt).to_be_visible()
                restored=cat.evaluate("code=>fetch('/api/rooms/'+code).then(response=>response.json())",code)
                assert restored['room']['game']['choice']['choiceId']==choice_id
                observer=bird.evaluate("code=>fetch('/api/rooms/'+code).then(response=>response.json())",code)
                assert 'options' not in observer['room']['game']['choice']
                cat.get_by_role('button',name=re.compile('^花费医院测试牌')).click()
                for attempt in range(30):
                    state=cat.evaluate("code=>fetch('/api/rooms/'+code).then(response=>response.json())",code)
                    if state['room']['game']['combat'] is None: break
                    choice=state['room']['game']['choice']
                    if choice and not choice['waiting']:
                        cat.locator('button[data-action=choice][data-option=pass]').click()
                    cat.wait_for_timeout(100)
                assert state['room']['game']['combat'] is None
                assert sum('服务器战斗骰子' in entry for entry in state['room']['game']['log'])==1
                cat.screenshot(path=str(OUTPUT/'battle-completed.png'),full_page=True)
                mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True)
                mobile.add_cookies(cat_context.cookies())
                page=mobile.new_page()
                page.goto(base+'/#room='+code)
                if RULESET=='root-cats-birds-v4':
                    expect(page.locator('.map3d-clearing')).to_have_count(12)
                else:
                    expect(page.locator('.map')).to_be_visible()
                assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')
                page.screenshot(path=str(OUTPUT/'mobile.png'),full_page=True)
                expect(bird.get_by_role('button',name='删除房间',exact=True)).to_have_count(0)
                cat.once('dialog',lambda dialog:dialog.dismiss())
                cat.get_by_role('button',name='删除房间',exact=True).click()
                expect(cat.locator('.code-large')).to_contain_text(code)
                cat.once('dialog',lambda dialog:dialog.accept())
                cat.get_by_role('button',name='删除房间',exact=True).click()
                for participant in (cat,bird):
                    expect(participant.locator('#create')).to_be_visible()
                expect(cat.locator('#create button')).to_be_enabled()
                connection=sqlite3.connect(database)
                assert connection.execute('SELECT count(*) FROM rooms WHERE code=?',(code,)).fetchone()[0]==0
                assert connection.execute('SELECT count(*) FROM games WHERE room_code=?',(code,)).fetchone()[0]==0
                assert connection.execute('SELECT count(*) FROM commands WHERE room_code=?',(code,)).fetchone()[0]==0
                assert connection.execute('SELECT count(*) FROM snapshots').fetchone()[0]==0
                connection.close()
                # Closed rooms remain manageable by their owner in the lobby.
                cat.locator('#create [name=title]').fill('关闭清理验收房')
                cat.locator('#create button').click()
                expect(cat.locator('.code-large')).to_be_visible()
                closed_code=cat.locator('.code-large').inner_text().strip('# ').strip()
                cat.get_by_role('button',name='离开房间',exact=True).click()
                closed_card=cat.locator('.room-card').filter(has_text=closed_code)
                expect(closed_card).to_contain_text('已关闭')
                cat.once('dialog',lambda dialog:dialog.accept())
                closed_card.get_by_role('button',name='删除房间',exact=True).click()
                expect(closed_card).to_have_count(0)
                assert not errors, errors
                browser.close()
                report={'passed':True,'browser':'Microsoft Edge headless','checks':['registration and login','private room and two ready players','v2 start through UI','HTTP randomUUID fallback','ambush and counter choice','hospital refresh and process restart','opponent option privacy','single persisted dice roll','mobile viewport without horizontal overflow'],'fixture':'A specific battle position was seeded only in a temporary QA database; actions used the normal UI/API.','screenshots':['hospital-before-restart.png','battle-completed.png','mobile.png'],'page_errors':errors}
                report['ruleset']=RULESET
                report['checks'].append('host-only room deletion; cancel preserves room; accepted deletion returns both players to lobby and removes archives; closed-room deletion from lobby')
                report['checks'][2]=RULESET+' start through UI'
                if RULESET in ('root-card-lab-v3','root-cats-birds-v4'):
                    report['checks'].append('original Anvil crafting through UI and persisted supply/points')
                    report['checks'].append('original card art and faction portraits decoded in browser')
                    report['screenshots'].append('original-art-start.png')
                if RULESET=='root-cats-birds-v4':
                    report['checks'].append('all five standard setup selections through UI')
                    report['checks'].append('3D autumn scene loaded in both browsers; all 12 projected markers clickable; lightweight mode and camera reset')
                    report['checks'].append('full-width board; controls below; exact square building slots and occupied ruins; independent original unit counters and external suit icons in both views')
                (OUTPUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
                print(json.dumps(report,ensure_ascii=False,indent=2))
        finally:
            stop()


if __name__=='__main__':
    run()
