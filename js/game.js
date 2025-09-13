
// Game core v2 - player drops bombs from top to enemies below.
// Assets preloaded
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const ASSETS = {
  images: {
    player: 'assets/images/player.png',
    enemy1: 'assets/images/enemy1.png',
    enemy2: 'assets/images/enemy2.png',
    boss: 'assets/images/boss.png',
    bomb: 'assets/images/bomb.png',
    explosion: 'assets/images/explosion.png'
  },
  sounds: {
    bg: 'assets/sounds/background_loop.wav',
    launch: 'assets/sounds/bomb_launch.wav',
    explode: 'assets/sounds/explosion.wav',
    powerup: 'assets/sounds/powerup.wav',
    hit: 'assets/sounds/hit.wav'
  }
};

let images = {};
let sounds = {};
let loaded = 0;
let toLoad = Object.keys(ASSETS.images).length + Object.keys(ASSETS.sounds).length;
function onAssetLoaded(){ loaded++; if(loaded>=toLoad) init(); }

// load images
for(const k in ASSETS.images){
  const img = new Image();
  img.src = ASSETS.images[k];
  img.onload = onAssetLoaded;
  images[k]=img;
}
// load sounds
for(const k in ASSETS.sounds){
  const a = new Audio(ASSETS.sounds[k]);
  a.addEventListener('canplaythrough', onAssetLoaded, {once:true});
  sounds[k]=a;
  sounds[k].volume = (k==='bg'?0.15:0.8);
  if(k==='bg'){ sounds[k].loop=true; }
}


// GAME STATE
const Game = {
  running:false,
  score:0,
  level:1,
  lives:3,
  player: {x: W/2 - 64, y: 20, w:128, h:64},
  bombs: [], // bombs falling down from player with arc
  enemies: [],
  powerups: [],
  particles: [],
  wave:0,
  mapSeed:0,
  lastBossLevel: 0
};

// input
let mouse = {x: W/2, y: H/2, down:false};
canvas.addEventListener('mousemove', e=>{ const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
canvas.addEventListener('mousedown', ()=>{ mouse.down = true; launchBomb(); });
canvas.addEventListener('mouseup', ()=>{ mouse.down = false; });
window.addEventListener('keydown', e=>{ if(e.code==='Space') launchBomb(); });

// UI buttons
document.getElementById('startBtn').addEventListener('click', ()=>{ startGame(); });
document.getElementById('instrBtn').addEventListener('click', ()=>{ document.getElementById('menu').classList.add('hidden'); document.getElementById('instructions').classList.remove('hidden'); });
document.querySelectorAll('.backBtn').forEach(b=>b.addEventListener('click', ()=>{ document.getElementById('menu').classList.remove('hidden'); document.getElementById('instructions').classList.add('hidden'); document.getElementById('assetsView').classList.add('hidden'); }));
document.getElementById('assetsBtn').addEventListener('click', ()=>{ document.getElementById('menu').classList.add('hidden'); document.getElementById('assetsView').classList.remove('hidden'); });

document.getElementById('retryBtn').addEventListener('click', ()=>{ startGame(); document.getElementById('gameOver').classList.add('hidden'); });
document.getElementById('menuBtn').addEventListener('click', ()=>{ document.getElementById('gameOver').classList.add('hidden'); document.getElementById('menu').classList.remove('hidden'); });

// utility
function rand(min,max){ return Math.random()*(max-min)+min; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

// map generation (visual) - creates a terrain pattern for this level
function generateMap(seed){
  const cols = 12;
  const rows = 4;
  const cellW = W / cols;
  const terrain = [];
  let base = Math.floor(H - 140 - (seed%4)*30);
  for(let c=0;c<cols;c++){
    const h = base + Math.floor((Math.sin((seed+c)*0.7)+1)*20*(Math.random()));
    terrain.push({x: c*cellW, y: h, w: cellW, h: H - h});
  }
  return terrain;
}

// spawn enemies according to level and wave
function spawnWave(level){
  const count = Math.min(30, 3 + Math.floor(level*1.5) + Math.floor(level/3));
  for(let i=0;i<count;i++){
    const type = (Math.random() < Math.min(0.35, level*0.04))? 'enemy2' : 'enemy1';
    const w = images[type].width*0.6, h = images[type].height*0.6;
    const x = rand(20, W - 20 - w);
    const y = rand(H - 120, H - 60);
    const speed = rand(0.4+level*0.05, 0.8+level*0.12);
    const hp = type==='enemy2'? 2 + Math.floor(level/4) : 1 + Math.floor(level/6);
    Game.enemies.push({type, x, y, w, h, speed, hp, dir: Math.random()<0.5? -1:1});
  }
  // boss every 6 levels
  if(level % 6 === 0 && Game.lastBossLevel !== level){
    const bW = images.boss.width*0.8, bH = images.boss.height*0.8;
    Game.enemies.push({type:'boss', x: W/2 - bW/2, y: H - 200, w: bW, h: bH, speed: 0.3 + level*0.02, hp: 10 + level*5, dir:1, boss:true});
    Game.lastBossLevel = level;
  }
}

// bomb launch - player drops bomb with a downward arc (we'll give slight horizontal velocity based on mouse X)
function launchBomb(){
  if(!Game.running) return;
  const startX = Game.player.x + Game.player.w/2;
  const startY = Game.player.y + Game.player.h - 6;
  const targetX = mouse.x;
  const dx = targetX - startX;
  const vx = clamp(dx/80, -4 - Game.level*0.2, 4 + Game.level*0.2);
  const vy = 1 + Game.level*0.1;
  Game.bombs.push({x:startX, y:startY, vx, vy, g:0.25, r:10, power: 'normal'});
  sounds.launch.currentTime = 0; sounds.launch.play();
}

// powerups: spawn occasionally when enemy dies
function spawnPowerup(x,y){
  const types = ['life','shield','bigbomb'];
  const type = types[Math.floor(Math.random()*types.length)];
  Game.powerups.push({x,y,type,ttl:16000});
}

// explosions particles
function createExplosion(x,y,r){
  for(let i=0;i<18;i++){
    Game.particles.push({x,y,vx:rand(-r,r)/6, vy:rand(-r,r)/6, life:800 + Math.random()*400});
  }
  try{ sounds.explode.currentTime = 0; sounds.explode.play(); }catch(e){}
}

// update loop
let lastFrame = performance.now();
function update(dt){
  if(!Game.running) return;
  // bombs
  for(let i=Game.bombs.length-1;i>=0;i--){
    const b = Game.bombs[i];
    b.vy += b.g;
    b.x += b.vx; b.y += b.vy;
    // collision with enemies
    for(let j=Game.enemies.length-1;j>=0;j--){
      const e = Game.enemies[j];
      if(b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h){
        // hit
        e.hp -= (b.power==='bigbomb'? 3:1);
        createExplosion(b.x,b.y,20);
        if(e.hp<=0){
          // drop powerup sometimes
          if(Math.random() < 0.15) spawnPowerup(e.x + e.w/2, e.y);
          Game.score += 10 + Math.floor(Game.level*2);
          Game.enemies.splice(j,1);
        }
        Game.bombs.splice(i,1);
        try{ sounds.hit.currentTime = 0; sounds.hit.play(); }catch(e){}
        break;
      }
    }
    // off-screen
    if(b.y > H + 50 || b.x < -50 || b.x > W+50){
      Game.bombs.splice(i,1);
    }
  }

  // enemies move
  for(const e of Game.enemies){
    e.x += e.dir * e.speed * (1 + Game.level*0.02);
    if(e.x < 10){ e.dir = 1; }
    if(e.x + e.w > W - 10){ e.dir = -1; }
    // if enemy reaches top danger zone (near player)
    if(e.y < Game.player.y + Game.player.h + 6){
      // enemy damages player area
      Game.lives -= 1;
      e.hp = 0;
      createExplosion(e.x + e.w/2, e.y + e.h/2, 30);
    }
  }
  // remove dead enemies
  for(let i=Game.enemies.length-1;i>=0;i--){ if(Game.enemies[i].hp <= 0) Game.enemies.splice(i,1); }

  // powerups TTL
  for(let i=Game.powerups.length-1;i>=0;i--){
    const p = Game.powerups[i]; p.ttl -= dt;
    if(p.ttl <= 0) Game.powerups.splice(i,1);
    // pickup if near player (we consider player collects when bomb explodes near or just allow clicking? For simplicity, allow pickup by collision with player area)
    if(p.x > Game.player.x && p.x < Game.player.x + Game.player.w && p.y > Game.player.y && p.y < Game.player.y + Game.player.h){
      // apply powerup
      if(p.type === 'life'){ Game.lives = Math.min(6, Game.lives + 1); }
      if(p.type === 'shield'){ Game.shieldTTL = 8000 + Game.level*500; }
      if(p.type === 'bigbomb'){ Game.nextBigBombs = (Game.nextBigBombs || 0) + 2; }
      try{ sounds.powerup.currentTime = 0; sounds.powerup.play(); }catch(e){}
      Game.powerups.splice(i,1);
    }
  }

  // particles
  for(let i=Game.particles.length-1;i>=0;i--){
    const p = Game.particles[i]; p.vy += 0.03; p.x += p.vx; p.y += p.vy; p.life -= dt;
    if(p.life <= 0) Game.particles.splice(i,1);
  }

  // spawn waves if no enemies
  if(Game.enemies.length === 0){
    Game.wave++;
    Game.level = 1 + Math.floor(Game.wave/2);
    document.getElementById('level').innerText = 'Nivel: ' + Game.level;
    // generate map
    Game.map = generateMap(Game.wave + Math.floor(Math.random()*1000));
    // spawn new enemies based on level
    spawnWave(Game.level + Math.floor(Game.wave/3));
  }

  // check lives
  if(Game.lives <= 0){ endGame(); }
  // update HUD
  document.getElementById('score').innerText = 'Puntaje: ' + Game.score;
  document.getElementById('lives').innerText = 'Vidas: ' + Game.lives;
}

// draw
function draw(){
  // background
  ctx.fillStyle = '#022'; ctx.fillRect(0,0,W,H);
  // draw map (terrain blocks)
  if(Game.map){
    for(const t of Game.map){
      ctx.fillStyle = '#0b3'; ctx.fillRect(t.x, t.y, t.w, t.h);
      // small decoration
      ctx.fillStyle = '#083'; ctx.fillRect(t.x + 6, t.y - 6, 6, 6);
    }
  }
  // draw player (image)
  ctx.drawImage(images.player, Game.player.x, Game.player.y, Game.player.w, Game.player.h);

  // draw bombs
  for(const b of Game.bombs){
    ctx.drawImage(images.bomb, b.x - 16, b.y - 16, 32, 32);
  }

  // draw enemies
  for(const e of Game.enemies){
    let img = images[e.type] || images.enemy1;
    ctx.drawImage(img, e.x, e.y, e.w, e.h);
    // health bar
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x, e.y - 8, e.w, 6);
    ctx.fillStyle = '#1fbf6a'; ctx.fillRect(e.x, e.y - 8, (e.hp / (e.boss? (10+Game.level*5) : (1 + Math.floor(Game.level/6)))) * e.w, 6);
  }

  // powerups
  for(const p of Game.powerups){
    ctx.fillStyle = p.type === 'life' ? '#f59e0b' : (p.type==='shield'? '#60a5fa' : '#ef4444');
    ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI*2); ctx.fill();
  }

  // particles
  for(const p of Game.particles){
    ctx.fillStyle = 'rgba(255,200,120,0.9)'; ctx.fillRect(p.x, p.y, 3,3);
  }
}

// game loop
function loop(ts){
  const now = ts || performance.now();
  const dt = now - lastFrame;
  lastFrame = now;
  update(dt);
  draw();
  if(Game.running) requestAnimationFrame(loop);
}

function startGame(){
  Game.running = true; Game.score = 0; Game.wave = 0; Game.level = 1; Game.lives = 3; Game.bombs=[]; Game.enemies=[]; Game.powerups=[]; Game.particles=[];
  Game.map = generateMap(1);
  generateMap(1);
  spawnWave(1);
  document.getElementById('menu').classList.add('hidden');
  try{ sounds.bg.currentTime = 0; sounds.bg.play(); }catch(e){}
  lastFrame = performance.now();
  requestAnimationFrame(loop);
}

function endGame(){
  Game.running = false;
  try{ sounds.bg.pause(); }catch(e){}
  document.getElementById('finalScore').innerText = 'Puntaje final: ' + Game.score;
  document.getElementById('gameOver').classList.remove('hidden');
}

function init(){
  // start with menu visible
  document.getElementById('menu').classList.remove('hidden');
  // place player centered top
  Game.player.x = W/2 - Game.player.w/2;
  document.getElementById('level').innerText = 'Nivel: ' + Game.level;
  // begin animation loop only when started
  window.lastFrame = performance.now();
}

// preload done: small UI hook for assets view
// assets listing is static; nothing else to do
