/* Versioned, local-only save codec. No DOM, timers or runtime references. */
(function(root, factory) {
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.NavalSave=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const KEY='naval_battle_save_v1', MAX_BYTES=4000000;
  const sizes={missile_boat:1,mrk:2,destroyer:3,cruiser:4,tarkr:5,carrier:5,submarine:3};
  function demand(condition, message){if(!condition)throw new Error(message);}
  function int(n,min,max){return Number.isInteger(n)&&n>=min&&n<=max;}
  function list(a,max){demand(Array.isArray(a)&&a.length<=max,'Invalid collection');return a;}
  function cell(c,sz){demand(c&&int(c.x,0,sz-1)&&int(c.y,0,sz-1),'Invalid coordinate');}
  function cells(a,sz,max=5){for(const c of list(a,max))cell(c,sz);}
  function validate(s){
    demand(s&&s.version===1,'Unsupported save version');
    demand(typeof s.savedAt==='string'&&Number.isFinite(Date.parse(s.savedAt)),'Invalid timestamp');
    const g=s.game,sz=g?.settings?.fieldSize;
    demand([30,50,100].includes(sz),'Invalid board size');
    demand(['ai','hotseat'].includes(g.settings.gameMode),'Invalid game mode');
    demand(['ocean','wrecks','islands','archipelago'].includes(g.settings.landscape),'Invalid terrain');
    demand(int(g.currentTurn,1,1000000)&&int(g.currentPlayer,0,1),'Invalid turn');
    demand(typeof g.actionDone==='boolean'&&int(g.movePoints,0,9)&&typeof g.gameOver==='boolean','Invalid turn state');
    demand(g.settings.gameMode!=='ai'||g.currentPlayer===0||g.gameOver,'Only stable player checkpoints may be restored');
    demand(!g.gameOver||int(g.winner,0,1),'Invalid winner');
    demand(list(g.players,2).length===2,'Invalid players');
    for(const p of g.players){
      demand(typeof p.nuclearUsed==='boolean','Invalid weapons state');
      const ships=list(p.ships,24);demand(ships.length>0,'Empty fleet');
      const ids=new Set(),occupied=new Set();
      for(const sh of ships){
        demand(sh&&sizes[sh.type]===sh.size&&typeof sh.id==='string'&&!ids.has(sh.id),'Invalid ship');ids.add(sh.id);
        demand(typeof sh.sunk==='boolean'&&typeof sh.deployed==='boolean'&&typeof sh.placed==='boolean','Invalid ship status');
        demand(['horizontal','vertical'].includes(sh.orientation),'Invalid orientation');
        cells(sh.cells,sz);const deployed=sh.type!=='submarine'||sh.deployed;
        demand(sh.cells.length===(deployed?sh.size:0),'Invalid hull');
        demand(!deployed||(Array.isArray(sh.hits)&&sh.hits.length===sh.size&&sh.hits.every(h=>typeof h==='boolean')),'Invalid damage');
        for(const c of sh.cells){const k=c.x+','+c.y;demand(sh.sunk||!occupied.has(k),'Overlapping fleet');if(!sh.sunk)occupied.add(k);}
        for(const [key,max] of [['torpedoes',3],['t10',1],['planes',3],['strikers',6],['asroc',1],['radarCooldown',3],['sonarCooldown',2],['reactorHits',2],['radiationTurns',3]]){
          if(sh[key]!=null)demand(int(sh[key],0,max),'Invalid '+key);
        }
        if(sh.launchers!=null){demand(list(sh.launchers,4).length===4,'Invalid launchers');for(const l of sh.launchers)demand([0,1,3,4].includes(l.index)&&typeof l.loaded==='boolean'&&typeof l.damaged==='boolean','Invalid launcher');}
      }
      const r=p.radarData;demand(r,'Missing radar');
      for(const shot of list(r.shots,100000)){cell(shot,sz);demand(typeof shot.hit==='boolean','Invalid shot');}
      for(const d of list(r.detectedShips,10000)){cells(d.cells,sz);demand(int(d.turnDetected,1,g.currentTurn),'Invalid intel age');}
      for(const d of list(r.sunkShips,200))cells(d.cells,sz);
    }
    const terrain=g.landscape;demand(terrain,'Missing landscape');
    for(const kind of ['islands','wrecks']) cells(terrain[kind],sz,sz*sz);
    for(const t of list(g.activeTorpedoes,6)){
      demand(int(t.attackerIdx,0,1)&&int(t.turnsRemaining,1,2),'Invalid torpedo');
      for(const prefix of ['target','current','spawn'])cell({x:t[prefix+'X'],y:t[prefix+'Y']},sz);
      demand(int(t.launchedTurn,1,g.currentTurn),'Invalid launch time');
    }
    for(const z of list(g.nuclearZones,2))demand(int(z.attackerIdx,0,1)&&int(z.turnsRemaining,1,3)&&int(z.x0,0,sz-1)&&int(z.y0,0,sz-1)&&int(z.x1,z.x0,sz-1)&&int(z.y1,z.y0,sz-1),'Invalid nuclear zone');
    for(const z of list(g.blastZones,100)){demand(int(z.ownerIdx,0,1),'Invalid blast owner');cells(z.cells,sz,25);}
    for(const d of list(g.sonarDetections,200)){demand(int(d.playerIdx,0,1),'Invalid sonar owner');if(d.cells)cells(d.cells,sz);}
    for(const row of list(s.log,100))demand(typeof row.msg==='string'&&row.msg.length<=8000&&typeof row.type==='string'&&int(row.turn,1,g.currentTurn),'Invalid log');
    return s;
  }
  function decode(raw){
    demand(typeof raw==='string'&&raw.length<=MAX_BYTES,'Save is too large');
    return validate(JSON.parse(raw,(key,value)=>{
      demand(!['__proto__','constructor','prototype'].includes(key),'Unsafe object key');return value;
    }));
  }
  function encode(game,log){
    const raw=JSON.stringify({version:1,savedAt:new Date().toISOString(),game,log:log.slice(-100)});
    decode(raw);return raw;
  }
  function write(storage,game,log){const raw=encode(game,log);storage.setItem(KEY,raw);return raw;}
  function read(storage){const raw=storage.getItem(KEY);return raw?decode(raw):null;}
  return {KEY,encode,decode,write,read};
});
