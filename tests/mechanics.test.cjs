const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script); // Parse the actual shipped script, not a parallel model.
function source(name) {
  const start = script.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name);
  const end = script.slice(start).search(/\n\}\r?\n/);
  return script.slice(start, start + end + 2);
}
function ship(type, x, y, size = 3) {
  return { type, size, cells: Array.from({length:size}, (_,i)=>({x:x+i,y})),
    hits: Array(size).fill(false), placed:true, deployed:true, sunk:false, crew:10 };
}
function world() {
  const player = () => ({ships:[], radarData:{shots:[],sunkShips:[],detectedShips:[]},nuclearUsed:false});
  const c = {gameState:{settings:{fieldSize:50,gameMode:'hotseat'},players:[player(),player()],
    currentPlayer:0,currentTurn:1,nuclearZones:[],activeTorpedoes:[]},
    battle:{sinkExplosions:[]},gridCache:Array.from({length:50},()=>Array(50).fill(0)),
    addLog(){},playSound(){},showToast(){},L:x=>x,T:x=>x,shipTypeName:x=>x,
    shipProperName:s=>s.type,coordStr:()=>'',sunkDescription:()=>'',captainLastWords:()=>'',
    showVictory(w){c.winner=w;},console};
  vm.createContext(c);
  for(const name of ['getShipAt','checkVictory','fireTorpedo','advanceTorpedoes',
    'launchNuclearStrike','applyRadiationDamage','decrementNuclearZones']) vm.runInContext(source(name),c);
  return c;
}
test('nuclear strike is 11x11, clipped at map edges',()=>{
  const c=world(); c.gameState.players[0].ships=[{...ship('submarine',0,0),t10:1}];
  c.launchNuclearStrike(0,25,25);
  const z=c.gameState.nuclearZones[0];
  assert.equal(z.x1-z.x0+1,11); assert.equal(z.y1-z.y0+1,11);
  assert.equal(c.gameState.players[0].radarData.shots.length,121);
  c.launchNuclearStrike(0,0,0);
  assert.equal(c.gameState.nuclearZones[1].x0,0);
});
test('reserve submarine prevents early victory, expires after turn ten',()=>{
  const c=world();
  c.gameState.players[0].ships=[{...ship('cruiser',0,0),sunk:true},
    {...ship('submarine',0,0),placed:false,deployed:false}];
  c.gameState.players[1].ships=[ship('destroyer',10,10)];
  assert.equal(c.checkVictory(),false);
  c.gameState.currentTurn=11;
  assert.equal(c.checkVictory(),true); assert.equal(c.winner,1);
});
test('radiation and contamination tick only on the affected player turn',()=>{
  const c=world(); const victim=ship('carrier',10,10,5);
  victim.radiationDamage=true; victim.radiationTurns=3;
  c.gameState.players[1].ships=[victim];
  c.applyRadiationDamage(0); assert.equal(victim.hits.filter(Boolean).length,0);
  for(let i=0;i<3;i++)c.applyRadiationDamage(1);
  c.applyRadiationDamage(1);
  assert.equal(victim.hits.filter(Boolean).length,3);
  assert.equal(victim.radiationDamage,false);
  c.gameState.nuclearZones=[{attackerIdx:0,turnsRemaining:3}];
  c.decrementNuclearZones(0); assert.equal(c.gameState.nuclearZones[0].turnsRemaining,3);
  for(let i=0;i<3;i++) c.decrementNuclearZones(1);
  assert.equal(c.gameState.nuclearZones.length,0);
});
test('an expiring nuclear zone does not restart the same radiation course',()=>{
  const c=world();c.gameState.players[0].ships=[{...ship('submarine',0,0),t10:1}];
  const victim=ship('carrier',29,25,5);c.gameState.players[1].ships=[victim];
  c.launchNuclearStrike(0,25,25);
  for(let i=0;i<3;i++){c.applyRadiationDamage(1);c.decrementNuclearZones(1);}
  c.applyRadiationDamage(1);
  assert.equal(victim.hits.filter(Boolean).length,3);assert.equal(victim.radiationDamage,false);
});
test('torpedo gives defender a response and expires at the selected target',()=>{
  const c=world(); const sub={...ship('submarine',0,0),torpedoes:3};
  const victim=ship('destroyer',10,10); c.gameState.players[0].ships=[sub];
  c.gameState.players[1].ships=[victim];
  c.fireTorpedo(0,10,10); c.advanceTorpedoes();
  assert.equal(c.gameState.activeTorpedoes[0].turnsRemaining,2);
  c.gameState.currentPlayer=1; c.advanceTorpedoes();
  assert.equal(victim.sunk,false);
  c.gameState.currentPlayer=0;c.gameState.currentTurn=2;c.advanceTorpedoes();
  assert.equal(victim.sunk,true); assert.equal(c.gameState.activeTorpedoes.length,0);
});
test('torpedo can be evaded and cannot pass through a wreck',()=>{
  const c=world(); c.gameState.players[0].ships=[{...ship('submarine',0,0),torpedoes:3}];
  const victim=ship('destroyer',10,10);c.gameState.players[1].ships=[victim];
  c.fireTorpedo(0,10,10);
  victim.cells=victim.cells.map(p=>({...p,y:20}));
  c.gameState.currentPlayer=1;c.advanceTorpedoes();
  c.gameState.currentPlayer=0;c.gameState.currentTurn=2;c.advanceTorpedoes();
  assert.equal(victim.sunk,false);assert.equal(c.gameState.activeTorpedoes.length,0);
  c.gameState.activeTorpedoes=[{attackerIdx:0,currentX:5,currentY:5,targetX:8,targetY:5,turnsRemaining:2,launchedTurn:1}];
  c.gridCache[5][6]=2;c.advanceTorpedoes();
  assert.equal(c.gameState.activeTorpedoes.length,0);
  c.gameState.activeTorpedoes=[{attackerIdx:0,currentX:5,currentY:5,targetX:8,targetY:5,turnsRemaining:1,launchedTurn:1}];
  c.gridCache[5][6]=0;c.gridCache[5][7]=1;c.advanceTorpedoes();
  assert.equal(c.gameState.activeTorpedoes.length,0);
});
test('rapid repeated mouse clicks cannot spend more than one action',()=>{
  const c=world();const events={};
  c.document={getElementById:id=>({addEventListener:(name,fn)=>events[id+':'+name]=fn,style:{}})};
  Object.assign(c,{battleInputInitialized:false,setupCameraHandlers(){},fleetCam:{},radarCam:{},
    screenToCell:()=>({x:5,y:5}),updateActionBar(){},updateTopBar(){},resetFireModes(){},
    shots:0,regularShot(){c.shots++;return true;}});
  vm.runInContext(source('setupBattleInput'),c);c.setupBattleInput();
  events['radar-canvas:mouseup']({button:0});events['radar-canvas:mouseup']({button:0});
  assert.equal(c.shots,1); assert.equal(c.gameState.actionDone,true);
});
test('CIC uses the functional maps rather than duplicating own contacts on enemy radar',()=>{
  assert.doesNotMatch(source('renderRadar'),/renderCicRadarScreen/);
  assert.doesNotMatch(source('renderFleetMap'),/renderCicRadarScreen/);
});
