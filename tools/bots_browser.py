# Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
"""Normal browser entry points for one human and three server-side test bots."""
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
OUTPUT = ROOT / 'audit/bots-browser'


def run():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='bot-ui-') as directory:
        env = {**os.environ, 'DB_PATH': str(Path(directory)/'qa.sqlite')}
        env.pop('APP_ORIGIN', None)
        base = f'http://127.0.0.1:{port}'
        process = None
        def start():
            nonlocal process
            script = ("import {createApp} from './backend/server.mjs';"
                      "const app=createApp({rateLimit:false,botDelay:100});"
                      f"app.server.listen({port},'127.0.0.1');")
            with (OUTPUT/'server.log').open('a', encoding='utf-8') as log:
                process = subprocess.Popen([shutil.which('node'), '--input-type=module', '-e', script],
                                           cwd=ROOT, env=env, stdout=log, stderr=log,
                                           creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            for _ in range(100):
                try:
                    urllib.request.urlopen(base+'/api/health', timeout=1).close()
                    return
                except OSError:
                    time.sleep(.1)
            raise RuntimeError('Test server did not start')
        def stop():
            if process and process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
        start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(channel='msedge', headless=True)
                page = browser.new_page(viewport={'width':1440, 'height':1000})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(base)
                page.get_by_role('button', name='注册账号', exact=True).click()
                page.locator('#auth [name=username]').fill('bot_browser_human')
                page.locator('#auth [name=password]').fill('bot-browser-only-123')
                page.locator('#auth button').click()
                expect(page.locator('#create')).to_be_visible()
                page.locator('#create [name=title]').fill('真人与三人机验收')
                page.locator('#create button').click()
                expect(page.locator('.code-large')).to_be_visible()
                code = page.locator('.code-large').inner_text().strip('# ')
                for faction in ['bird', 'alliance', 'vagabond']:
                    page.locator(f'[data-action=bot-add][data-faction={faction}]').click()
                    expect(page.locator('.player-seat .badge').filter(has_text='人机')).to_have_count(
                        ['bird','alliance','vagabond'].index(faction)+1)
                page.locator('.player-seat.vagabond [data-action=bot-remove]').click()
                expect(page.locator('[data-action=bot-add][data-faction=vagabond]')).to_be_visible()
                page.locator('[data-action=bot-add][data-faction=vagabond]').click()
                page.screenshot(path=str(OUTPUT/'seats.png'), full_page=True)
                page.get_by_role('button', name='准备', exact=True).click()
                page.get_by_role('button', name='开始游戏', exact=True).click()
                expect(page.locator('.scoreboard .score')).to_have_count(4)
                user = page.evaluate("()=>fetch('/api/me').then(r=>r.json()).then(r=>r.user.id)")
                def view():
                    return page.evaluate("code=>fetch('/api/rooms/'+code).then(r=>r.json()).then(r=>r.room)", code)
                deadline = time.monotonic()+180
                mutations = 0
                restarted = False
                while time.monotonic() < deadline:
                    room = view()
                    assert not room['botError'], room['botError']
                    game = room['game']
                    if game['winner']:
                        break
                    actor = game['choice']['playerId'] if game.get('choice') else game['players'][game['turn']]['id']
                    if actor != user:
                        page.wait_for_timeout(100)
                        continue
                    me = next(player for player in game['players'] if player['id']==user)
                    action = pick_action(game, me)
                    click_action(page, game, action)
                    page.wait_for_function("v=>fetch('/api/rooms/'+v.code).then(r=>r.json()).then(r=>r.room.version>v.version)",
                                           arg={'code':code,'version':room['version']}, timeout=10000)
                    mutations += 1
                    if mutations==5 and not restarted:
                        stop()
                        start()
                        page.reload()
                        expect(page.locator('.scoreboard .score')).to_have_count(4)
                        restarted = True
                    if mutations%10==0:
                        print(json.dumps({'humanActions':mutations,'round':game['round']}), flush=True)
                else:
                    raise AssertionError('Browser game timed out')
                expect(page.locator('.actions')).to_contain_text('林间落幕')
                assert not errors, errors
                page.screenshot(path=str(OUTPUT/'finished.png'), full_page=True)
                page.get_by_role('button', name='开下一局', exact=True).click()
                expect(page.locator('.player-seat .badge').filter(has_text='人机')).to_have_count(3)
                page.on('dialog', lambda dialog: dialog.accept())
                page.get_by_role('button', name='删除房间', exact=True).click()
                expect(page.locator('#create')).to_be_visible()
                report = {'passed':True, 'rounds':game['round'], 'humanActions':mutations,
                          'restart':restarted, 'pageErrors':errors,
                          'checks':['UI add/remove three bots','one human and three automatic bots',
                                    'natural winner','restart continuation','next game ready bots','room deletion'],
                          'scope':'Human cat seat clicked through normal UI with a pass-oriented test policy; server bots acted automatically. Isolated database, rate limit disabled.'}
                (OUTPUT/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
                print(json.dumps(report, ensure_ascii=False), flush=True)
                browser.close()
        finally:
            stop()


if __name__=='__main__':
    run()
