# Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
"""Exercise four independent browser players through the normal v5 game UI."""
import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT/'audit/v5/browser'


def ruler(area):
    if any(b['faction']=='lizard' and b['type'].startswith('garden-') for b in area['buildings']): return 'lizard'
    strengths = {faction: count+sum(building['faction']==faction for building in area['buildings'])
                 for faction, count in area['warriors'].items()}
    maximum = max(strengths.values())
    if not maximum:
        return None
    tied = [faction for faction, count in strengths.items() if count == maximum]
    return 'bird' if 'bird' in tied else tied[0] if len(tied)==1 else None


def pick_action(game, me):
    if game.get('choice'):
        options = game['choice']['options']
        option = next((option for option in options if option['id']=='pass'), options[0])
        return {'type':'choice', 'choiceId':game['choice']['choiceId'], 'optionId':option['id']}
    phase = game['phase']
    if phase=='birdsong': return {'type':'birdsong-end'}
    if phase=='discard': return {'type':'discard', 'card':me['hand'][0]['id']}
    if me['faction']=='lizard':
        options=game['factionActions']
        if phase=='lizard-craft': return {'type':'craft','card':game['craftOptions'][0]['card']} if game['craftOptions'] else {'type':'lizard-craft-done'}
        priority=['仪式得分','仪式建造','献祭','仪式招募','圣化','转化','圣战','圣战移动']
        options=[o for o in options if o['category']!='仪式得分' or '+0分' not in o['label']]
        if options:return min(options,key=lambda o:priority.index(o['category']))['action']
        return {'type':'conspiracies-done' if phase=='lizard-conspiracies' else 'end'}
    if me['faction'] in ('alliance','vagabond'):
        options = game['factionActions']
        if phase=='daylight' and game['craftOptions']:
            return {'type':'craft', 'card':game['craftOptions'][0]['card']}
        priority = ['探索废墟','任务','修复','援助','训练军官','动员','组织','征兵','移动','日工','偷窃','弩击','战斗','藏身']
        if phase=='slip':
            damaged = sum(item['damaged'] for item in game['vagabond']['items'])
            preferred = [option for option in options if option['action']['to']>=12] if damaged>1 else [
                option for option in options if option['action']['to']<12 and game['board'][option['action']['to']]['ruins']]
            if preferred: return preferred[0]['action']
        if options:
            if phase=='daylight' or phase=='military':
                options = sorted(options, key=lambda option: priority.index(option['category']) if option['category'] in priority else 99)
            return options[0]['action']
        return {'type': {'revolt':'revolt-done','spread':'spread-done','military':'military-done',
                         'refresh':'refresh-done','slip':'slip-done','daylight':'end'}[phase]}
    if phase=='wood': return {'type':'wood','clearing':game['woodPending'][0]}
    if phase=='craft': return {'type':'craft-done'}
    if phase=='leader': return {'type':'leader','leader':game['leaders'][0]}
    if phase=='decree-add':
        if game['bird']['added']: return {'type':'decree-ready'}
        card = next((card for card in me['hand'] if card['suit']=='wild'), me['hand'][0])
        return {'type':'decree-add','card':card['id'],'column':'recruit'}
    if phase=='new-roost':
        eligible = [area for area in game['board'] if not area['keep'] and area['slots']>len(area['buildings'])+area['ruins']]
        area = min(eligible, key=lambda area:sum(area['warriors'].values()))
        return {'type':'new-roost','clearing':area['id']}
    if me['faction']=='cat': return {'type':'end'}
    column = game['currentDecreeColumn']
    if not column: return {'type':'end'}
    for card in game['bird']['remaining'][column]:
        for area in game['board']:
            if card['suit'] not in ('wild',area['suit']): continue
            action = {'type':column,'clearing':area['id'],'decreeCard':card['id']}
            if column=='recruit' and not area['keep'] and any(building['type']=='roost' for building in area['buildings']):
                return action
            if column=='build' and not area['keep'] and ruler(area)=='bird' and area['slots']>len(area['buildings'])+area['ruins'] and not any(building['type']=='roost' for building in area['buildings']):
                return action
            if column=='move' and area['warriors']['bird']:
                for target in area['links']:
                    if ruler(area)=='bird' or ruler(game['board'][target])=='bird':
                        return {'type':'move','from':area['id'],'to':target,'count':1,'decreeCard':card['id']}
            if column=='battle' and area['warriors']['bird']:
                for target in game['players']:
                    faction = target['faction']
                    if faction=='bird': continue
                    present = game['vagabond']['position']==area['id'] if faction=='vagabond' else (
                        area['warriors'][faction] or any(building['faction']==faction for building in area['buildings'])
                        or faction=='cat' and (area['wood'] or area['keep']) or faction=='alliance' and area['sympathy'])
                    if present: return {**action,'defender':faction}
    raise AssertionError('No legal bird action while decree remains')


def click_action(page, game, action):
    kind = action['type']
    if kind=='leader':
        page.locator('[data-action=leader-preview]').first.click()
        expect(page.locator('dialog[open] .full-card-art')).to_be_visible()
        assert '大臣位于' in page.locator('dialog[open]').inner_text()
        page.locator('[data-close-preview]').click()
    if kind=='choice':
        if all(str(option['id']).isdigit() for option in game['choice']['options']):
            target=int(action['optionId'])
            selector='clearing' if target<12 else 'forest-info'
            page.locator(f'[data-action={selector}][data-id="{target}"]').click()
        else:
            card=page.locator(f'[data-map-choice="{action["optionId"]}"]')
            (card.locator('img') if card.locator('img').count() else card.locator('.map-choice-label')).click()
        confirm=page.locator(f'button[data-action=choice][data-choice="{action["choiceId"]}"][data-option="{action["optionId"]}"]')
        confirm.scroll_into_view_if_needed()
        assert confirm.evaluate("e=>{const r=e.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&r.height>0&&e.contains(hit)}"),'Choice confirmation is clipped or covered'
        confirm.click()
        return
    matching = next((index for index, option in enumerate(game.get('factionActions',[])) if option['action']==action), None)
    if matching is not None:
        form = page.locator('form[data-type=faction-action]').filter(has=page.locator(f'option[value="{matching}"]'))
        key=form.get_attribute('data-map-key')
        page.locator(f'[data-map-mode="{key}"]').click()
        army_move=kind in ('move','crusade') and 'from' in action
        if army_move:
            page.get_by_label('移动起点',exact=True).select_option(str(action['from']))
            page.get_by_label('移动终点',exact=True).select_option(str(action['to']))
            page.get_by_label('移动数量',exact=True).select_option(str(action['count']))
        else:
            for field in ['from','to','clearing']:
                if field in action:
                    target=action[field]
                    selector='clearing' if target<12 else 'forest-info'
                    page.locator(f'[data-action={selector}][data-id="{target}"]').click()
        if not any(field in action for field in ('from','to','clearing')) and kind in ('explore','aid','quest','repair','strike','special'):
            target=game['vagabond']['position']
            selector='clearing' if target<12 else 'forest-info'
            page.locator(f'[data-action={selector}][data-id="{target}"]').click()
        if not army_move: form.locator('select').select_option(str(matching))
        form.locator('button[type=submit],button:not([type])').click()
        return
    direct = page.locator(f'button[data-action="{kind}"]')
    if direct.count():
        direct.first.click()
        return
    form = page.locator(f'form#{kind},form[data-type="{kind}"]')
    if kind=='craft': form = form.filter(has=page.locator(f'input[value="{action["card"]}"]'))
    if 'decreeCard' in action:
        remaining=game['bird']['remaining'][game['currentDecreeColumn']]
        suit=next(card['suit'] for card in remaining if card['id']==action['decreeCard'])
        representative=next(card['id'] for card in remaining if card['suit']==suit)
        page.locator('#decree-card').select_option(representative)
    key=form.get_attribute('data-map-key')
    page.locator(f'[data-map-mode="{key}"]').click()
    if kind=='build' and 'building' in action: page.locator('[data-map-building]').select_option(action['building'])
    if kind=='recruit' and 'clearings' in action: page.locator(f'[data-action=clearing][data-id="{action["clearings"][0]}"]').click()
    if kind=='move' and 'from' in action:
        page.get_by_label('移动起点',exact=True).select_option(str(action['from']))
        page.get_by_label('移动终点',exact=True).select_option(str(action['to']))
    else:
        for field in ['from','to','clearing']:
            if field in action:
                target=action[field]
                selector='clearing' if target<12 else 'forest-info'
                page.locator(f'[data-action={selector}][data-id="{target}"]').click()
    for key,value in action.items():
        if key in ('type','from','to','clearing'): continue
        if key=='decreeCard': continue
        control = form.locator(f'[name="{key}"]')
        if not control.count(): continue
        if control.first.get_attribute('type')=='hidden' or not control.first.is_visible(): continue
        if control.first.evaluate('element=>element.tagName')=='SELECT': control.first.select_option(str(value))
        else: control.first.fill(','.join(map(str,value)) if isinstance(value,list) else str(value))
    if kind=='decree-add':
        before=form.locator('[name=card]').input_value()
        if not (OUTPUT/'action-expanded.png').exists(): page.screenshot(path=str(OUTPUT/'action-expanded.png'))
        page.locator('[data-map-minimize]').click()
        expect(page.locator('.map-context')).not_to_be_visible()
        if not (OUTPUT/'action-minimized.png').exists(): page.screenshot(path=str(OUTPUT/'action-minimized.png'))
        page.locator('[data-map-minimize]').click()
        expect(form).to_be_visible()
        assert form.locator('[name=card]').input_value()==before
    if 'decreeCard' in action:assert page.locator('#decree-card').input_value()==representative,'Decree selection reset after picking the map target'
    form.locator('button[type=submit],button:not([type])').click()


def run():
    OUTPUT.mkdir(parents=True,exist_ok=True)
    with socket.socket() as probe:
        probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='four-browser-',dir=OUTPUT) as directory:
        database = Path(directory)/'qa.sqlite'
        env = {**os.environ,'PORT':str(port),'HOST':'127.0.0.1','DB_PATH':str(database)}
        env.pop('APP_ORIGIN',None)
        base = f'http://127.0.0.1:{port}'
        process = None
        def start():
            nonlocal process
            script="import {createApp} from './backend/server.mjs';const app=createApp({rateLimit:false});app.server.listen(Number(process.env.PORT),process.env.HOST);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));"
            with (OUTPUT/'server.log').open('a',encoding='utf8') as server_log:
                process = subprocess.Popen([shutil.which('node'),'--input-type=module','-e',script],cwd=ROOT,env=env,
                    stdout=server_log,stderr=server_log,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            for _ in range(100):
                try:
                    urllib.request.urlopen(base+'/api/health',timeout=1).close();return
                except OSError: time.sleep(.1)
            raise RuntimeError('Server did not start')
        def stop():
            if process and process.poll() is None: process.terminate();process.wait(timeout=10)
        start()
        errors=[]; counts={}; trace=[]
        try:
            with sync_playwright() as playwright:
                browser=playwright.chromium.launch(channel='msedge',headless=True)
                pages=[browser.new_context(viewport={'width':1440,'height':1000}).new_page() for _ in range(4)]
                for index,page in enumerate(pages):
                    page.on('pageerror',lambda error:errors.append(str(error)))
                    page.goto(base);page.get_by_role('button',name='注册账号',exact=True).click()
                    page.locator('#auth [name=username]').fill('four_browser_'+str(index))
                    page.locator('#auth [name=password]').fill('four-browser-test-only-123')
                    page.locator('#auth button').click();expect(page.locator('#create')).to_be_visible()
                pages[0].locator('#create [name=ruleset]').select_option('root-base-four-v5')
                pages[0].locator('#create [name=title]').fill('基础四阵营验收房')
                pages[0].locator('#create button').click();expect(pages[0].locator('.code-large')).to_be_visible()
                code=pages[0].locator('.code-large').inner_text().strip('# ')
                for index,page in enumerate(pages[1:],1):
                    page.locator('#join [name=code]').fill(code)
                    page.locator('#join [name=name]').fill(['猫','鹰','联盟','游侠'][index])
                    page.locator('#join button').click();expect(page.locator('.code-large')).to_be_visible()
                for page in pages: page.get_by_role('button',name='准备',exact=True).click()
                expect(pages[0].get_by_role('button',name='开始游戏',exact=True)).to_be_enabled()
                assert pages[0].locator('#ruleset').input_value()=='root-base-four-v5'
                pages[0].get_by_role('button',name='开始游戏',exact=True).click()
                for page in pages: expect(page.locator('.scoreboard .score')).to_have_count(4)
                ids={page.evaluate("()=>fetch('/api/me').then(r=>r.json()).then(r=>r.user.id)"):page for page in pages}
                def view(page):
                    try:
                        result=page.evaluate("code=>fetch('/api/rooms/'+code).then(r=>r.json())",code)
                    except Exception:
                        print('server exit status',process.poll(),flush=True)
                        print((OUTPUT/'server.log').read_text(encoding='utf8')[-4000:],flush=True)
                        raise
                    assert 'room' in result,result
                    return result['room']
                for step in range(1000):
                    room=view(pages[0]);game=room['game']
                    if game['winner'] or game['round']>=7: break
                    actor=game['choice']['playerId'] if game.get('choice') else game['players'][game['turn']]['id']
                    page=ids[actor];room=view(page);game=room['game']
                    me=next(player for player in game['players'] if player['id']==actor)
                    action=pick_action(game,me)
                    trace.append({'step':step,'round':game['round'],'faction':me['faction'],'phase':game['phase'],'action':action})
                    click_action(page,game,action)
                    page.wait_for_function("value=>fetch('/api/rooms/'+value.code).then(r=>r.json()).then(r=>r.room.version>value.version)",arg={'code':code,'version':room['version']},timeout=10000)
                    counts[action['type']]=counts.get(action['type'],0)+1
                    if step==55:
                        stop();start()
                        for participant in pages: participant.reload()
                    if step%30==0: print(json.dumps({'step':step,'round':game['round'],'phase':game['phase']}),flush=True)
                for page in pages:
                    expect(page.locator('.info-pane')).to_be_visible()
                    if page!=pages[3]: expect(page.locator('.own-resources')).to_be_visible()
                    if page==pages[2]: expect(page.locator('.alliance-panel')).to_be_visible()
                    if page==pages[3]: expect(page.locator('.vagabond-panel')).to_be_visible()
                    expect(page.locator('.map .forest-marker')).to_have_count(7)
                    page.wait_for_function("code=>fetch('/api/rooms/'+code).then(r=>r.json()).then(r=>r.room.game.board.every(area=>{const badge=document.querySelector('[data-action=clearing][data-id=\"'+area.id+'\"] .clearing-ruler');return area.ruler?badge?.classList.contains(area.ruler):!badge}))",arg=code)
                    page.evaluate("async()=>{document.querySelectorAll('img').forEach(img=>img.loading='eager');await Promise.all(Array.from(document.images).map(img=>img.decode()))}")
                pages[2].screenshot(path=str(OUTPUT/'alliance.png'),full_page=True)
                pages[3].screenshot(path=str(OUTPUT/'vagabond.png'),full_page=True)
                # Refresh retains inventory, supporters and the active choice.
                before=view(pages[3]);pages[3].reload();expect(pages[3].locator('.vagabond-panel')).to_be_visible()
                after=view(pages[3]);assert before==after
                for index,page in enumerate(pages):
                    snapshot=view(page)['game']
                    if index!=2: assert 'supporters' not in snapshot['alliance']
                    for other in snapshot['players']:
                        if other['id']!=page.evaluate("()=>fetch('/api/me').then(r=>r.json()).then(r=>r.user.id)"):assert 'hand' not in other
                pages[3].set_viewport_size({'width':390,'height':844})
                assert pages[3].evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')
                pages[3].screenshot(path=str(OUTPUT/'mobile.png'),full_page=True)
                assert not errors,errors
                assert counts.get('spread',0)>0 and counts.get('explore',0)>0,counts
                report={'passed':True,'round':view(pages[0])['game']['round'],'actions':counts,'steps':len(trace),
                    'checks':['four UI registrations and ready players','standard faction and character setup','Alliance and Vagabond actions through UI','one backend process restart','refresh preserves inventory and private supporters','original icons decoded','four viewers private-hand isolation','mobile no horizontal overflow'],
                    'pageErrors':errors,'fixture':'No game state was seeded. All mutations used normal UI controls.'}
                (OUTPUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
                print(json.dumps(report,ensure_ascii=False),flush=True)
                browser.close()
        finally:
            (OUTPUT/'trace.json').write_text(json.dumps(trace,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
            stop()


if __name__=='__main__':run()
