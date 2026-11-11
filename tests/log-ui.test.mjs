// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupLogs,renderLogGroups } from '../frontend/log-ui.js';

test('old log entries group each player turn independently of the table round',()=>{
 const game={turnsCompleted:2,log:['setup draw','cat 第 1 轮开始','cat move','bird 第 1 轮开始','bird build','alliance 第 1 轮开始','mobilize']};
 const groups=groupLogs(game);assert.deepEqual(groups.map(g=>g.turn),[0,1,2,3]);assert.deepEqual(groups.map(g=>g.player),['开局设置','cat','bird','alliance']);
});
test('truncated legacy logs and appended turn metadata keep absolute turn numbers',()=>{
 const game={turnsCompleted:11,log:['prior action','cat 第 3 轮开始','cat move','bird 第 3 轮开始','bird build'],logTurns:[null,null,null,12,12]};
 assert.deepEqual(groupLogs(game).map(g=>g.turn),[10,11,12]);
 assert.match(renderLogGroups({...game,log:['<script>'],logTurns:[12]}),/&lt;script&gt;/);
});
