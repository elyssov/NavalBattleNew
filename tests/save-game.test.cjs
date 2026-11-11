const {test}=require('node:test');
const assert=require('node:assert/strict');
const Save=require('../save-game.js');
function game(){
  const ship=(id,x)=>({id,type:'destroyer',size:3,cells:[0,1,2].map(i=>({x:x+i,y:4})),
    hits:[false,true,false],placed:true,deployed:true,sunk:false,orientation:'horizontal',asroc:1,radarCooldown:2});
  const player=(i)=>({ships:[ship('dd'+i,5+i*10)],radarData:{shots:[{x:1,y:2,hit:false}],detectedShips:[],sunkShips:[]},nuclearUsed:false});
  return {settings:{fieldSize:50,landscape:'ocean',gameMode:'ai'},players:[player(0),player(1)],
    landscape:{islands:[],wrecks:[]},currentTurn:7,currentPlayer:0,actionDone:true,movePoints:4,gameOver:false,
    activeTorpedoes:[{attackerIdx:1,targetX:10,targetY:10,currentX:10,currentY:8,spawnX:10,spawnY:7,turnsRemaining:1,launchedTurn:6}],
    nuclearZones:[{id:'1:6',attackerIdx:1,x0:20,y0:20,x1:30,y1:30,turnsRemaining:2}],blastZones:[],sonarDetections:[],rebFlashes:[]};
}
test('save round-trip preserves action budget, damage, ammo, intel and pending effects',()=>{
  const original=game();const loaded=Save.decode(Save.encode(original,[{turn:7,type:'hit',msg:'Test'}]));
  assert.deepEqual(loaded.game,original);assert.equal(loaded.log[0].msg,'Test');
  loaded.game.movePoints=0;assert.equal(original.movePoints,4);
});
test('a reload uses only the persisted bytes, not a shared test save',()=>{
  const storage=new Map();const adapter={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
  assert.equal(Save.read(adapter),null);Save.write(adapter,game(),[]);
  const fresh=require('../save-game.js');assert.equal(fresh.read(adapter).game.currentTurn,7);
});
test('damaged/version-mismatched and impossible saves are rejected',()=>{
  assert.throws(()=>Save.decode('{'));
  assert.throws(()=>Save.decode('{"__proto__":{}}'));
  const snapshot=JSON.parse(Save.encode(game(),[]));snapshot.version=2;assert.throws(()=>Save.decode(JSON.stringify(snapshot)));
  snapshot.version=1;snapshot.game.movePoints=99;assert.throws(()=>Save.decode(JSON.stringify(snapshot)));
  snapshot.game.movePoints=4;snapshot.game.players[0].ships[0].cells[0].x=-1;assert.throws(()=>Save.decode(JSON.stringify(snapshot)));
});
test('in-progress AI snapshots cannot be mistaken for stable player checkpoints',()=>{
  const g=game();g.currentPlayer=1;assert.throws(()=>Save.encode(g,[]));
});
test('storage failure does not report success or erase the previous checkpoint',()=>{
  let previous=Save.encode(game(),[]);
  const storage={getItem:()=>previous,setItem:()=>{throw new Error('quota');}};
  assert.throws(()=>Save.write(storage,game(),[]));assert.equal(Save.read(storage).game.currentTurn,7);
});
test('unplaced reserve submarine and completed battle are valid save states',()=>{
  const g=game();g.players[0].ships.push({id:'sub',type:'submarine',size:3,cells:[],hits:null,placed:false,deployed:false,sunk:false,orientation:'horizontal'});
  assert.equal(Save.decode(Save.encode(g,[])).game.players[0].ships.length,2);
  g.gameOver=true;g.winner=1;g.currentPlayer=1;assert.equal(Save.decode(Save.encode(g,[])).game.winner,1);
});
