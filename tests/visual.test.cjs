const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function source(name){const s=html.indexOf('function '+name+'(');const end=html.slice(s).search(/\n\}\r?\n/);return html.slice(s,s+end+2);}
test('ship atlas uses seven distinct, bounded rectangles including the real destroyer',()=>{
  const c={};vm.createContext(c);vm.runInContext(html.match(/const SHOWCASE_SHIP_FRAMES = ([\s\S]*?);/)[0]+';globalThis.frames=SHOWCASE_SHIP_FRAMES;',c);
  assert.equal(Object.keys(c.frames).length,7);
  for(const f of Object.values(c.frames)){const [x,y,w,h]=f.rect;assert.ok(w>0&&h>0&&x>=0&&y>=0&&x+w<=1280&&y+h<=1280);}
  assert.ok(c.frames.destroyer.rect[0]>1000);
});
test('frame drawing applies the measured atlas crop at native and scaled image sizes',()=>{
  const c={showcaseSheetsReady:true};vm.createContext(c);vm.runInContext(source('drawShowcaseFrame'),c);
  const draws=[];const ctx={globalAlpha:1,save(){},restore(){},drawImage(...a){draws.push(a);}};
  c.drawShowcaseFrame(ctx,{complete:true,naturalWidth:1280,naturalHeight:1280},{rect:[100,20,130,520]},4,3,0,0,20,80);
  assert.deepEqual(draws[0].slice(1,5),[100,20,130,520]);
  c.drawShowcaseFrame(ctx,{complete:true,naturalWidth:640,naturalHeight:640},{rect:[100,20,130,520]},4,3,0,0,20,80);
  assert.deepEqual(draws[1].slice(1,5),[50,10,65,260]);
});
test('impact drawing does not alter combat state or remove active effects',()=>{
  const c={CELL_PX:16,battle:{impacts:[{x:3,y:4,hit:true,onRadar:true,started:Date.now()-100}]},gameState:{movePoints:4,actionDone:true}};
  vm.createContext(c);vm.runInContext(source('drawBattleImpacts'),c);
  const before=JSON.stringify(c);const ctx={save(){},restore(){},beginPath(){},ellipse(){},stroke(){},arc(){},fill(){},moveTo(){},lineTo(){}};
  c.drawBattleImpacts(ctx,true);assert.equal(JSON.stringify(c),before);
});
