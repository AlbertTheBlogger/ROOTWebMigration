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
   browser=p.chromium.launch(channel='msedge',headless=True)
   page=browser.new_page(viewport={'width':1366,'height':768})
   bird=next(player for player in fixture['room']['game']['players'] if player['faction']=='bird')
   fixture['user']={'id':bird['id'],'username':'bird-layout-test'}
   game=fixture['room']['game'];game['turn']=game['players'].index(bird);game['phase']='decree';game['currentDecreeColumn']='recruit'
   game['bird']['remaining']={'recruit':[{'id':'fox-first','suit':'fox','name':'狐狸法令'},{'id':'wild-second','suit':'wild','name':'鸟类法令'},{'id':'wild-third','suit':'wild','name':'另一张鸟类法令'}]}
   game['mapActions']=[{'type':'recruit','clearing':0,'decreeCard':'fox-first'},{'type':'recruit','clearing':0,'decreeCard':'wild-second'},{'type':'recruit','clearing':0,'decreeCard':'wild-third'}]
   game['choice']=None;bird['hand']=[];submitted=[]
   def api(route):
    path=route.request.url.split('/api/')[1]
    if path.endswith('/events'):return route.fulfill(content_type='text/event-stream',body=': fixture\n\n')
    if path=='me':data={'user':fixture['user']}
    elif path=='rooms':data={'rooms':[]}
    else:
     if path.endswith('/command'):submitted.append(route.request.post_data_json)
     data={'room':fixture['room']}
    route.fulfill(json=data)
   page.route('**/api/**',api);page.goto(base+'/#room=429463')
   expect(page.locator('#decree-card')).to_have_count(1)
   assert page.locator('.scoreboard .victory-track progress').count()==4
   assert page.locator('.scoreboard .score').evaluate_all("cards=>cards.every(card=>card.querySelector('progress').getBoundingClientRect().width>card.getBoundingClientRect().width*.75)")
   assert page.locator('#decree-card option').count()==2
   page.locator('#decree-card').select_option('wild-second');page.locator('[data-map-mode=recruit]').click();page.locator('[data-action=clearing][data-id="0"]').click()
   assert page.locator('#decree-card').input_value()=='wild-second'
   assert page.locator('.bird-panel .decree .decree-art').count()==0
   assert page.locator('.bird-panel .decree .pip .suit-art').count()>0
   page.locator('#recruit button').click();page.wait_for_timeout(200)
   assert submitted[-1]['command']['action']['decreeCard']=='wild-second'
   page.locator('[data-action=player-public][data-player="'+bird['id']+'"]').click()
   parent=page.locator('dialog[open]');parent_id=parent.evaluate("e=>{e.id='player-layer';return e.id}")
   trigger=parent.locator('[data-action=leader-preview]').first
   trigger.focus();scroll=parent.evaluate('e=>e.scrollTop')
   trigger.click()
   expect(page.locator('dialog[open]')).to_have_count(2)
   child=page.locator('dialog[open]').last
   expect(child.locator('.full-card-art')).to_be_visible()
   assert child.bounding_box()['width']<page.locator('#player-layer').bounding_box()['width']
   page.screenshot(path=str(root/'audit/dialog-stack-desktop.png'))
   child.locator('[data-close-preview]').click()
   expect(page.locator('dialog[open]')).to_have_count(1)
   assert trigger.evaluate('e=>e===document.activeElement')
   assert parent.evaluate('e=>e.scrollTop')==scroll
   trigger.click();page.keyboard.press('Escape')
   expect(page.locator('dialog[open]')).to_have_count(1)
   assert trigger.evaluate('e=>e===document.activeElement')
   # A click outside the child closes only that child, even over the parent.
   trigger.click();child=page.locator('dialog[open]').last
   page.mouse.click(2,2)
   expect(page.locator('dialog[open]')).to_have_count(1)
   # Scroll and nested focus survive even when a third level is opened.
   page.evaluate("""async()=>{const m=await import('/experience.js');m.showPublicDetails('第二层','<button id="third-trigger">打开下一层</button>');document.querySelector('#third-trigger').focus();m.showPublicDetails('第三层','<p>第三层内容</p>')}""")
   expect(page.locator('dialog[open]')).to_have_count(3)
   page.keyboard.press('Escape');expect(page.locator('dialog[open]')).to_have_count(2)
   assert page.locator('#third-trigger').evaluate('e=>e===document.activeElement')
   page.keyboard.press('Escape');expect(page.locator('dialog[open]')).to_have_count(1)
   # Mobile uses the same layered interaction.
   page.set_viewport_size({'width':390,'height':844});trigger.click()
   expect(page.locator('dialog[open]')).to_have_count(2)
   page.screenshot(path=str(root/'audit/dialog-stack-mobile.png'))
   page.locator('dialog[open]').last.locator('[data-close-preview]').click()
   expect(page.locator('dialog[open]')).to_have_count(1)
   page.locator('dialog[open] [data-close-preview]').click()
   expect(page.locator('dialog[open]')).to_have_count(0)
   assert page.locator('dialog.card-preview').count()==0
   page.set_viewport_size({'width':1366,'height':768})
   vg=next(player for player in game['players'] if player['faction']=='vagabond')
   page.locator('[data-action=player-public][data-player="'+vg['id']+'"]').click()
   assert page.locator('dialog[open] .quest-card').count()==3
   assert page.locator('dialog[open] .relation').count()==3
   vg_parent=page.locator('dialog[open]')
   vg_parent.evaluate('e=>e.scrollTop=120')
   picture=vg_parent.locator('.choice-art').first
   picture.scroll_into_view_if_needed();picture.focus()
   vg_scroll=vg_parent.evaluate('e=>e.scrollTop');assert vg_scroll>0
   picture.click();expect(page.locator('dialog[open]')).to_have_count(2)
   page.locator('dialog[open]').last.locator('[data-close-preview]').click()
   expect(page.locator('dialog[open]')).to_have_count(1)
   assert vg_parent.evaluate('e=>e.scrollTop')==vg_scroll
   assert picture.evaluate('e=>e===document.activeElement')
   page.locator('[data-close-preview]').click()
   game['phase']='leader';game['leaders']=['despot','commander'];page.reload()
   page.locator('[data-map-mode=leader]').click();page.locator('[data-action=leader-preview][data-leader=commander]').click()
   expect(page.locator('dialog[open] .full-card-art')).to_be_visible()
   assert '额外造成1点伤害' in page.locator('dialog[open]').inner_text()
   page.locator('[data-close-preview]').click()
   page.screenshot(path=str(root/'audit/improvements-leader-1366.png'),full_page=True)
   # Inspect the normal animation observer with controlled visible events.
   page.evaluate("""async()=>{
    window.effects=await import('/experience.js');
    window.eventBase={log:[],players:[{id:'v',name:'游侠',handCount:2,hand:[]},{id:'c',name:'猫',handCount:1,hand:[]}]};
    effects.observe(null,{});effects.observe(eventBase,{cards:{}});
    const after=structuredClone(eventBase);after.log=['游侠 援助，向 猫 交付 1 张牌'];after.players[0].handCount--;after.players[1].handCount++;
    effects.observe(after,{cards:{}});
   }""")
   expect(page.locator('.action-animation[data-kind=aid]')).to_be_visible()
   assert page.locator('.action-animation .card-back').count()==0
   page.wait_for_timeout(1600);assert page.locator('.action-animation').count()==0
   page.evaluate("""()=>{effects.observe(null,{});effects.observe(eventBase,{cards:{}});const after=structuredClone(eventBase);after.log=['猫 无匹配手牌，联盟从牌堆抽取 1 张作为民愤补偿，已加入支持者'];effects.observe(after,{cards:{}})}""")
   expect(page.locator('.action-animation[data-kind=supporter]')).to_be_visible()
   page.evaluate("""()=>{effects.observe(null,{});effects.observe(eventBase,{cards:{}});const after=structuredClone(eventBase);after.players[1].handCount++;effects.observe(after,{cards:{}})}""")
   expect(page.locator('.action-animation .card-back')).to_be_visible()
   page.evaluate("""()=>{effects.observe(null,{});effects.observe(eventBase,{cards:{}});window.scoreAfter=structuredClone(eventBase);scoreAfter.scoreEventSeq=1;scoreAfter.scoreEvents=[{seq:1,playerId:'c',faction:'cat',name:'猫玩家',reason:'建造锯木厂',delta:1,total:1}];effects.observe(scoreAfter,{cards:{}})}""")
   expect(page.locator('.action-animation[data-kind=score] .score-award')).to_have_text('+1')
   assert '猫咪贵族（猫玩家） · 建造锯木厂 · +1' in page.locator('.action-animation').inner_text()
   page.evaluate('()=>effects.observe(scoreAfter,{cards:{}})')
   page.screenshot(path=str(root/'audit/score-animation-cat.png'))
   page.wait_for_timeout(1600);assert page.locator('.action-animation').count()==0
   page.evaluate("""()=>{effects.observe(null,{});effects.observe(eventBase,{cards:{}});scoreAfter=structuredClone(eventBase);scoreAfter.scoreEventSeq=1;scoreAfter.scoreEvents=[{seq:1,playerId:'c',faction:'bird',name:'鹰玩家',reason:'3个鸟巢',delta:2,total:2}];effects.observe(scoreAfter,{cards:{}})}""")
   expect(page.locator('.action-animation[data-kind=score] .score-award')).to_have_text('+2')
   assert '飞鹰王朝（鹰玩家） · 3个鸟巢 · +2' in page.locator('.action-animation').inner_text()
   page.screenshot(path=str(root/'audit/score-animation-bird.png'))
   page.evaluate('()=>{effects.observe(null,{});effects.observe(scoreAfter,{cards:{}})}')
   assert page.locator('.action-animation').count()==0
   report={'passed':True,'checks':['decree suit grouping and nonfirst suit survives map rerender','decree uses suit icons','Vagabond public quests and relationships','turmoil leader preview','aid transfer distinct from draw','supporter compensation event','normal draw preserved','cat build and bird income score notices','duplicate snapshot does not replay score','initial load does not replay historical scores','nested player and leader dialogs','close and Escape restore parent focus','backdrop closes only top layer','three dialog levels and mobile','closed dialogs removed']}
   (root/'audit/improvements-ui-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report),flush=True);browser.close()
 finally:proc.terminate();proc.wait(timeout=10);log.close()
