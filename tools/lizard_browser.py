# Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
"""Play the Lizard seat through normal UI against three bots using a temporary database."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect
from four_browser import click_action, pick_action

ROOT = Path(__file__).resolve().parents[1]


def run():
    width = int(os.environ.get('LIZARD_WIDTH', '1366'))
    height = int(os.environ.get('LIZARD_HEIGHT', '900'))
    minimum_round = int(os.environ.get('LIZARD_ROUNDS', '0'))
    output = ROOT / 'audit' / ('lizard-mobile' if width < 761 else 'lizard-browser')
    output.mkdir(parents=True, exist_ok=True)
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='woodland-lizard-ui-') as directory:
        env = {**os.environ, 'DB_PATH': str(Path(directory) / 'test.sqlite')}
        env.pop('APP_ORIGIN', None)
        process = None
        def start():
            nonlocal process
            script = "import {createApp} from './backend/server.mjs';" + f"createApp({{rateLimit:false,botDelay:40}}).server.listen({port},'127.0.0.1');"
            with (output / 'server.log').open('a', encoding='utf-8') as log:
                process = subprocess.Popen([shutil.which('node'), '--input-type=module', '-e', script], cwd=ROOT, env=env,
                                           stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            for _ in range(100):
                try:
                    urllib.request.urlopen(base + '/api/health', timeout=1).close()
                    return
                except OSError:
                    time.sleep(.1)
            raise AssertionError('Local server did not start')
        def stop():
            if process and process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
        start()
        try:
            with sync_playwright() as pw:
                browser = pw.chromium.launch(channel='msedge', headless=True)
                page = browser.new_page(viewport={'width': width, 'height': height})
                errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.goto(base)
                page.get_by_role('button', name='注册账号', exact=True).click()
                page.locator('#auth [name=username]').fill('lizard_ui_player')
                page.locator('#auth [name=password]').fill('lizard-ui-local-123')
                page.locator('#auth button').click()
                expect(page.locator('#create')).to_be_visible()
                page.locator('#create [name=ruleset]').select_option('root-lizard-cult-v6')
                page.locator('#create [name=title]').fill('蜥蜴神教验收')
                page.locator('#create button').click()
                expect(page.locator('.room-seat')).to_have_count(4)
                page.locator('#profile [name=faction]').select_option('lizard')
                page.locator('#profile button').click()
                expect(page.locator('.player-seat.lizard .player-name')).to_contain_text('lizard_ui_player')
                for seat,faction in enumerate(['cat', 'bird', 'alliance'],1):
                    page.locator(f'[data-action=bot-add][data-seat="{seat}"]').click()
                    expect(page.locator('.player-seat .badge').filter(has_text='人机')).to_have_count(['cat', 'bird', 'alliance'].index(faction) + 1)
                code = page.locator('.code-large').inner_text().strip('# ')
                page.get_by_role('button', name='开始游戏', exact=True).click()
                expect(page.locator('.scoreboard .score')).to_have_count(4)
                user = page.evaluate("()=>fetch('/api/me').then(r=>r.json()).then(r=>r.user.id)")
                def view():
                    return page.evaluate("code=>fetch('/api/rooms/'+code).then(r=>r.json()).then(r=>r.room)", code)
                deadline = time.monotonic() + 240
                actions = []
                restarted = False
                captured = False
                while time.monotonic() < deadline:
                    room = view()
                    assert not room['botError'], room['botError']
                    game = room['game']
                    if game['winner'] or (minimum_round and game['round'] > minimum_round):
                        break
                    actor = game['choice']['playerId'] if game.get('choice') else game['players'][game['turn']]['id']
                    if actor != user:
                        page.wait_for_timeout(80)
                        continue
                    me = next(p for p in game['players'] if p['id'] == user)
                    if not captured and game['setup']['complete'] and game['phase'] == 'daylight':
                        expect(page.locator('.lizard-panel')).to_contain_text('失魂堆')
                        assert page.locator('.map-card img').evaluate_all('(imgs)=>imgs.every(i=>i.complete&&i.naturalWidth>0)')
                        page.locator(f'[data-action=player-public][data-player="{user}"]').click()
                        expect(page.locator('dialog[open]')).to_contain_text('被逐者')
                        expect(page.locator('dialog[open]')).to_contain_text('失魂堆')
                        page.screenshot(path=str(output / 'public-panel.png'), full_page=True)
                        page.locator('dialog[open] [data-close-preview]').click()
                        page.wait_for_timeout(1200)
                        page.screenshot(path=str(output / 'game.png'), full_page=True)
                        captured = True
                    action = pick_action(game, me)
                    if game['phase'] == 'lizard-conspiracies' and 'crusade' not in actions:
                        move = next((o['action'] for o in game['factionActions'] if o['action']['type'] == 'crusade' and 'from' in o['action']), None)
                        if move:
                            action = move
                    click_action(page, game, action)
                    page.wait_for_function("v=>fetch('/api/rooms/'+v.code).then(r=>r.json()).then(r=>r.room.version>v.version)", arg={'code': code, 'version': room['version']}, timeout=10000)
                    page.wait_for_timeout(50)
                    actions.append(action['type'])
                    if len(actions) == 8 and not restarted:
                        stop()
                        start()
                        page.reload()
                        expect(page.locator('.scoreboard .score')).to_have_count(4)
                        restarted = True
                    if len(actions) % 15 == 0:
                        print(json.dumps({'actions': len(actions), 'round': game['round'], 'phase': game['phase']}), flush=True)
                else:
                    raise AssertionError('Lizard browser game timed out')
                assert captured
                assert restarted
                assert not errors, errors
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Horizontal page overflow'
                if not minimum_round:
                    assert game['winner']
                    expect(page.locator('button[data-action=new-game]')).to_be_visible()
                    page.locator('[data-action=new-game]').click()
                    expect(page.locator('.player-seat .badge').filter(has_text='人机')).to_have_count(3)
                    expect(page.locator('#profile [name=faction]')).to_have_value('lizard')
                report = {'passed': True, 'viewport': [width, height], 'round': game['round'], 'winner': game['winner'],
                          'humanActions': len(actions), 'actionTypes': sorted(set(actions)), 'restart': restarted,
                          'pageErrors': errors, 'scope': 'Temporary database, normal UI Lizard seat, three server bots; no game-state injection. Headless Edge viewport, not a real phone.'}
                (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
                print(json.dumps(report, ensure_ascii=False), flush=True)
                browser.close()
        finally:
            stop()


if __name__ == '__main__':
    run()
