import './style.css';
import {erasePolygon} from './damage.js';
let hudDirty=false, hudAt=0, lastPageLabel='', cachedView;
const noiseBuffers=new Map();
import {landingSurface, makePlatforms} from './platforms.js';
let platforms = [], jumpHeld = false, jumpTime = 0, dropUntil = 0, jetting = false, landingPulse = 0;

const $ = s => document.querySelector(s);
const canvas = $('#game'), ctx = canvas.getContext('2d');
$('#arena').append(document.querySelector('.equipment'));
document.querySelector('.equipment').append($('#sound'));
let beams = [], flameTime = 0;
const WORLD_WIDTH = 1200, TILE = 24;
let VIEW_HEIGHT = 720;
const surface = document.createElement('canvas'), paint = surface.getContext('2d');
const photo = new Image();
let ready = false, mode = 'zlbigger', custom = '', levelHeight = 720, cameraY = 0;
let damageMask;
let blocks = [], debris = [], shots = [], particles = [], rings = [], keys = {};
let player = { x: 110, y: 650, vy: 0 }, pointer = { x: 650, y: 350 };
let weapon = 0, running = false, paused = false, firing = false, sound = true;
let lastShot = -1000, grenadeAt = -1000, elapsed = 0, destroyed = 0, shake = 0, flash = 0, audio;
const cols = Math.ceil(WORLD_WIDTH / TILE);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };

function build() {
  if (!ready) return;
  levelHeight = mode === 'zlbigger' ? Math.round(photo.height * WORLD_WIDTH / photo.width) : 900;
  surface.width = WORLD_WIDTH; surface.height = levelHeight;
  if (mode === 'zlbigger') paint.drawImage(photo, 0, 0, WORLD_WIDTH, levelHeight);
  else {
    paint.fillStyle = '#f2eddf'; paint.fillRect(0, 0, WORLD_WIDTH, levelHeight);
    paint.fillStyle = '#29261e'; paint.font = 'bold 28px Georgia';
    paint.fillText(mode === 'wiki' ? 'W / KNOWLEDGE' : 'YOUR PERSONAL PLAYGROUND', 70, 80);
    paint.font = 'bold 54px sans-serif';
    const title = mode === 'wiki' ? '自由的知识，无限的可能。' : custom;
    for (let i = 0; i < title.length; i += 17) paint.fillText(title.slice(i, i + 17), 70, 240 + i / 17 * 80);
    paint.font = '22px sans-serif'; paint.fillStyle = '#777363';
    paint.fillText('把这一页，变成你今天的解压时刻。', 70, 470);
    for (let i = 0; i < 3; i++) { paint.fillStyle = '#e2ddce'; paint.fillRect(70 + i * 355, 550, 325, 220); }
  }
  platforms = makePlatforms(paint, WORLD_WIDTH, levelHeight, mode === 'zlbigger');
  jumpHeld = false; jumpTime = 0; dropUntil = 0; jetting = false;
  damageMask = new Uint8Array(WORLD_WIDTH * levelHeight); damageMask.fill(255);
  blocks = [];
  for (let y = 0; y < levelHeight; y += TILE) for (let x = 0; x < WORLD_WIDTH; x += TILE)
    blocks.push({ x, y, w: Math.min(TILE, WORLD_WIDTH - x), h: Math.min(TILE, levelHeight - y), alive: true });
  beams = []; debris = []; shots = []; particles = []; rings = []; destroyed = 0; cameraY = 0; shake = 0;
  player = { x: 175, y: mode === 'zlbigger' ? 230 : 100, vy: 0, grounded: false }; firing = false;
  $('#complete').hidden = true;
  $('#scene-name').textContent = mode === 'zlbigger' ? 'https://zlbigger.com' : mode === 'wiki' ? 'W / KNOWLEDGE' : 'YOUR PLAYGROUND';
  $('#total').textContent = blocks.length;
  update();
}
function update() {
  const percent = Math.round(destroyed / blocks.length * 1000) / 10;
  $('#percent').innerHTML = `${percent}<small>%</small>`;
  $('#bar').style.width = `${percent}%`; $('#count').textContent = destroyed;
  if (destroyed === blocks.length) { $('#complete').hidden = false; $('#game-status').textContent = '整页已粉碎 · 完成'; }
}
function tone(type = 'smg') {
  if (!sound) return;
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  audio.resume();
  const config = {
    smg:[.09,2400,.13,120], shotgun:[.24,1200,.25,70], rocket:[.3,650,.18,55],
    explosion:[.65,300,.4,38], laser:[.16,3200,.07,900], flame:[.2,550,.09,80], grenade:[.1,1700,.08,420]
  };
  const [duration,frequency,volume,pitch]=config[type] || config.smg;
  const gain=audio.createGain(), filter=audio.createBiquadFilter();
  filter.type='lowpass';filter.frequency.value=frequency;
  gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
  filter.connect(gain);gain.connect(audio.destination);
  if(type!=='laser') {
    let buffer=noiseBuffers.get(type);
    if(!buffer){buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate);const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;noiseBuffers.set(type,buffer);}
    const noise=audio.createBufferSource();noise.buffer=buffer;noise.connect(filter);noise.start();
  }
  const osc=audio.createOscillator();osc.type=type==='laser'?'sawtooth':'sine';
  osc.frequency.setValueAtTime(pitch,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(pitch*.25,audio.currentTime+duration);
  osc.connect(filter);osc.start();osc.stop(audio.currentTime+duration);
}

function explode(x, y, radius, kind = 0, dx = 0, dy = 0) {
  const heavy = kind === 2 || kind === 5;
  if(kind===4)particles.push({x,y,vx:rand(-20,20),vy:-40,life:.6,max:.6,size:26,fire:true});
  const outline = new Path2D(), vertices=[];
  const points = heavy ? 42 : 18;
  for (let i = 0; i <= points; i++) {
    const angle = i / points * Math.PI * 2;
    const r = radius * (i === points ? 1 : rand(.78, 1.18));
    const px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r;
    vertices.push([px,py]);
    if (!i) outline.moveTo(px, py); else outline.lineTo(px, py);
  }
  outline.closePath();
  // Irregular, textured paper/glass shards instead of identical square tiles.
  for (let i = 0; i < (heavy ? 48 : kind === 1 ? 8 : 5); i++) {
    const a = rand(0, Math.PI * 2), distance = rand(0, radius * .9);
    const sx = clamp(x + Math.cos(a) * distance, 0, WORLD_WIDTH - 2);
    const sy = clamp(y + Math.sin(a) * distance, 0, levelHeight - 2);
    const size = heavy ? rand(6, 31) : rand(3, 12);
    const w = Math.min(Math.ceil(size), WORLD_WIDTH - sx), h = Math.min(Math.ceil(size * rand(.4, 1.4)), levelHeight - sy);
    const patch = document.createElement('canvas'); patch.width = w; patch.height = h;
    const pc = patch.getContext('2d');
    pc.beginPath(); pc.moveTo(w * .35, 0); pc.lineTo(w, h * .25); pc.lineTo(w * .72, h); pc.lineTo(0, h * .7); pc.closePath(); pc.clip();
    pc.drawImage(surface, sx, sy, w, h, 0, 0, w, h);
    const speed = rand(heavy ? 160 : 50, heavy ? 680 : 310);
    debris.push({image:patch,x:sx,y:sy,w,h,vx:Math.cos(a)*speed+dx*.08,vy:Math.sin(a)*speed-90,spin:rand(-16,16),angle:a,life:rand(.7,heavy?2.8:1.3)});
  }
  paint.save();
  // Charred edges and fine radial stress cracks remain on surviving material.
  paint.globalCompositeOperation = 'source-atop';
  paint.strokeStyle = heavy ? '#33201799' : '#322b2366';
  paint.lineWidth = heavy ? 9 : 3; paint.stroke(outline);
  for (let i = 0; i < (heavy ? 18 : 5); i++) {
    const a = rand(0, Math.PI * 2), length = radius * rand(1.15, heavy ? 1.65 : 2.3);
    paint.lineWidth = rand(.5, 1.5); paint.beginPath();
    paint.moveTo(x+Math.cos(a)*radius*.75,y+Math.sin(a)*radius*.75);
    paint.lineTo(x+Math.cos(a+.08)*length*.8,y+Math.sin(a+.08)*length*.8);
    paint.lineTo(x+Math.cos(a)*length,y+Math.sin(a)*length); paint.stroke();
  }
  paint.globalCompositeOperation = 'destination-out'; paint.fill(outline); paint.restore();
  // Collision follows the erased alpha pixels, not the old coarse tile grid.
  const x0 = Math.max(0, Math.floor(x-radius*1.25)), y0 = Math.max(0, Math.floor(y-radius*1.25));
  const w = Math.min(WORLD_WIDTH-x0, Math.ceil(radius*2.5)), h = Math.min(levelHeight-y0, Math.ceil(radius*2.5));
  if (w>0 && h>0) {
    erasePolygon(damageMask,WORLD_WIDTH,levelHeight,vertices);
    for(let row=Math.floor(y0/TILE);row<=Math.floor((y0+h-1)/TILE);row++)
      for(let col=Math.floor(x0/TILE);col<=Math.floor((x0+w-1)/TILE);col++) {
        const b=blocks[row*cols+col];
        if(b?.alive && !hitAt(b.x+b.w/2,b.y+b.h/2)) { b.alive=false;destroyed++; }
      }
    hudDirty=true;
  }
  for(let i=0;i<(heavy?90:kind===1?12:9);i++) {
    const a=rand(0,Math.PI*2),speed=rand(80,heavy?950:350);
    particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:rand(.12,heavy?1:.35),max:1,size:rand(.7,heavy?3:1.8),smoke:false});
  }
  for(let i=0;i<(heavy?22:2);i++) particles.push({x:x+rand(-radius*.5,radius*.5),y:y+rand(-radius*.5,radius*.5),vx:rand(-60,60),vy:rand(-130,-25),life:heavy?2.4:.5,max:heavy?2.4:.5,size:heavy?rand(18,42):rand(5,10),smoke:true});
  if(heavy) {
    rings.push({x,y,radius,life:.7});
    flash=.1; tone('explosion');
  }
  shake=Math.max(shake,heavy?15:kind===1?3:1.2);
  if(debris.length>650)debris.splice(0,debris.length-650);
}
function shoot(now, grenade = false) {
  if (!running || paused || !ready) return;
  grenade = grenade || weapon === 5;
  const selected = grenade ? 5 : weapon;
  if (now - lastShot < [85,360,620,90,65,850][selected]) return;
  lastShot = now;
  const angle = Math.atan2(pointer.y - (player.y - 29), pointer.x - player.x);
  const ox=player.x+Math.cos(angle)*45,oy=player.y-29+Math.sin(angle)*45;
  if(selected===3) {
    let ex=ox,ey=oy;
    // A piercing beam cuts several small points in a continuous line.
    for(let d=0;d<1100;d+=12) {
      ex=ox+Math.cos(angle)*d;ey=oy+Math.sin(angle)*d;
      if(ex<0||ex>=WORLD_WIDTH||ey<0||ey>=levelHeight)break;
      if(hitAt(ex,ey)) { explode(ex,ey,7,3); if(d>100)break; }
    }
    beams.push({x:ox,y:oy,ex,ey,life:.12});tone('laser');return;
  }
  if(selected===4) {
    for(let i=0;i<4;i++) {
      const a=angle+rand(-.24,.24),speed=rand(380,570);
      shots.push({x:ox,y:oy,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:.48,radius:15,kind:4,flame:true});
    }
    tone('flame');return;
  }
  const count=selected===1?8:1;
  for(let i=0;i<count;i++) {
    const a=angle+(count>1?rand(-.19,.19):rand(-.012,.012));
    const speed=grenade?540:selected===2?900:1700;
    shots.push({x:ox,y:oy,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-(grenade?180:0),life:grenade?1.5:2,kind:selected,radius:grenade?135:[10,16,118][selected],rocket:selected===2,grenade});
  }
  tone(['smg','shotgun','rocket','laser','flame','grenade'][selected]);
}
function hitAt(x, y) {
  if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= levelHeight) return false;
  return damageMask?.[Math.floor(y) * WORLD_WIDTH + Math.floor(x)] > 100;
}
function tick(dt, now) {
  elapsed += dt;
  beams.forEach(b=>b.life-=dt);beams=beams.filter(b=>b.life>0);
  const direction = (keys.d || keys.ArrowRight ? 1 : 0) - (keys.a || keys.ArrowLeft ? 1 : 0);
  player.x = clamp(player.x + direction * 300 * dt, 20, WORLD_WIDTH - 20);
  const jumping = !!(keys[' '] || keys.w || keys.ArrowUp);
  if (jumping && !jumpHeld) {
    jumpTime = 0;
    if (player.grounded) { player.vy = -530; player.grounded = false; }
  }
  jumpTime = jumping ? jumpTime + dt : 0;
  jumpHeld = jumping;
  if (keys.s || keys.ArrowDown) { dropUntil = elapsed + .2; player.grounded = false; }
  jetting = jumping && jumpTime > .24;
  player.vy += 1050 * dt;
  if (jetting) player.vy = Math.max(-360, player.vy - 1900 * dt);
  const previousY = player.y;
  player.y = Math.max(78, player.y + player.vy * dt);
  const surface = player.vy >= 0 && elapsed > dropUntil
    ? landingSurface(platforms, player.x, previousY, player.y, hitAt) : null;
  const wasGrounded = player.grounded;
  player.grounded = false;
  if (surface) {
    player.y = surface.y; player.vy = 0; player.grounded = true;
    player.platform = surface;
    if (!wasGrounded) landingPulse = .25;
  }
  if (player.y >= levelHeight - 6) { player.y = levelHeight - 6; player.vy = 0; player.grounded = true; }
  if (player.y < cameraY + 110) cameraY = Math.max(0, player.y - 110);
  if (player.y > cameraY + VIEW_HEIGHT - 100) cameraY = Math.min(Math.max(0, levelHeight - VIEW_HEIGHT), player.y - VIEW_HEIGHT + 100);
  landingPulse = Math.max(0, landingPulse - dt);
  const pageLabel=`${Math.round(cameraY / Math.max(1, levelHeight - VIEW_HEIGHT) * 100)}%`; if(pageLabel!==lastPageLabel){$('#page-position').textContent=pageLabel;lastPageLabel=pageLabel;}
  if (firing) shoot(now);
  for (const s of shots) {
    const steps = Math.max(1, Math.ceil(Math.hypot(s.vx, s.vy) * dt / 8));
    for (let i = 0; i < steps; i++) {
      s.x += s.vx * dt / steps; s.y += s.vy * dt / steps;
      if (!s.grenade && (hitAt(s.x, s.y) || s.y > levelHeight)) { explode(s.x, s.y, s.radius, s.kind, s.vx, s.vy); s.life = 0; break; }
    }
    if (s.grenade) {
      s.vy += 500 * dt;
      const ground=landingSurface(platforms,s.x,s.y-s.vy*dt,s.y,hitAt);
      if(s.vy>0 && ground){s.y=ground.y-4;s.vy*=-.48;s.vx*=.72;}
      if(s.y>levelHeight-7){s.y=levelHeight-7;s.vy*=-.4;s.vx*=.7;}
      if(s.x<5||s.x>WORLD_WIDTH-5){s.x=clamp(s.x,5,WORLD_WIDTH-5);s.vx*=-.6;}
      if(s.life<=dt)explode(s.x,s.y,s.radius,5);
    }
    s.life -= dt;
    if (s.rocket && s.life > 0) particles.push({ x: s.x, y: s.y, vx: rand(-25, 25), vy: rand(-30, 30), life: .4, max: .4, size: rand(3, 7), smoke: true });
  }
  shots = shots.filter(s => s.life > 0 && s.x > -20 && s.x < WORLD_WIDTH + 20);
  for (const b of debris) { b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 720 * dt; b.angle += b.spin * dt; b.life -= dt; }
  debris = debris.filter(b => b.life > 0);
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (!p.smoke) p.vy += 320 * dt; }
  particles = particles.filter(p => p.life > 0).slice(-1200);
  for (const r of rings) r.life -= dt;
  rings = rings.filter(r => r.life > 0);
  shake *= Math.exp(-12 * dt); flash = Math.max(0, flash - dt);
}
function character(now) {
  const flying = jetting;
  const walking = keys.a || keys.d || keys.ArrowLeft || keys.ArrowRight;
  const facing = pointer.x < player.x ? -1 : 1;
  const stride = walking ? Math.sin(elapsed * 17) : 0;
  const bob = flying ? Math.sin(elapsed * 12) * 1.2 : walking ? Math.abs(stride) * 1.5 : Math.sin(elapsed * 3) * .5;
  const recoil = running && !paused ? Math.max(0, 1 - (now - lastShot) / 120) : 0;
  const ink = '#131d2c', dark = '#27394c', steel = '#547387', light = '#a6c0c6', cyan = '#88f4f6', orange = '#e99b4e';
  ctx.save(); ctx.translate(player.x, player.y);
  ctx.fillStyle = '#11182726'; ctx.beginPath(); ctx.ellipse(0, 3, 21, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.scale(facing, 1);
  // Articulated greaves and boots; each leg has a separate knee and heel.
  const leg = (x, swing, rear) => {
    ctx.save(); ctx.translate(x, -23); ctx.rotate(flying ? (rear ? .32 : -.24) : swing * .48);
    rect(-5, 0, 11, 15, ink); rect(-3, 1, 7, 11, rear ? dark : steel);
    rect(-5, 10, 12, 7, ink); rect(-3, 11, 8, 4, rear ? steel : light);
    ctx.translate(0, 15); ctx.rotate(flying ? -.6 : Math.max(0, -swing) * .65);
    rect(-4, 0, 10, 11, ink); rect(-2, 1, 6, 7, steel); rect(-2, 2, 2, 5, light);
    rect(-5, 8, 15, 7, ink); rect(-3, 9, 12, 3, dark); rect(3, 9, 6, 2, light); rect(-5, 14, 16, 2, '#0b121d');
    ctx.restore();
  };
  leg(-7, -stride, true); leg(6, stride, false);
  ctx.translate(-recoil * 1.5, bob - 4);
  // Twin-cylinder backpack, heat vents, fuel indicator and articulated nozzles.
  rect(-23, -46, 13, 27, ink); rect(-21, -44, 9, 23, steel);
  rect(-24, -41, 5, 19, dark); rect(-20, -43, 3, 16, light);
  for (let i = 0; i < 3; i++) rect(-16, -40 + i * 5, 3, 2, ink);
  rect(-23, -23, 9, 6, ink); rect(-21, -23, 5, 3, orange);
  rect(-23, -48, 9, 4, light); rect(-21, -53, 2, 6, ink);
  if (flying) {
    ctx.save(); ctx.shadowColor = '#49cfff'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#2da8eb'; ctx.beginPath(); ctx.moveTo(-23, -17); ctx.lineTo(-12, -17); ctx.lineTo(-16, rand(1, 17)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c9fbff'; ctx.beginPath(); ctx.moveTo(-21, -17); ctx.lineTo(-15, -17); ctx.lineTo(-17, rand(-2, 5)); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  // Undersuit, layered ceramic breastplate and utility belt.
  rect(-13, -45, 28, 28, ink); rect(-11, -43, 23, 24, dark);
  rect(-9, -43, 20, 13, steel); rect(-8, -43, 19, 3, light);
  rect(-8, -38, 7, 6, '#76929d'); rect(2, -38, 8, 6, '#6a8b9d');
  rect(-7, -28, 17, 6, '#3b5064'); rect(-12, -20, 26, 5, ink);
  rect(-9, -21, 6, 7, steel); rect(4, -21, 6, 7, steel); rect(-1, -20, 4, 4, orange);
  rect(-2, -41, 3, 9, ink); rect(-1, -40, 2, 5, cyan);
  // Neck seal, angular helmet shell, visor reflection and communications module.
  rect(-5, -50, 14, 6, ink); rect(-9, -65, 22, 17, ink);
  rect(-6, -69, 15, 5, ink); rect(-7, -64, 20, 13, steel);
  rect(-4, -67, 12, 4, light); rect(-7, -62, 21, 4, '#8daab3');
  rect(0, -59, 16, 8, ink); rect(2, -58, 13, 4, '#27a7c6');
  ctx.save(); ctx.shadowColor = cyan; ctx.shadowBlur = 5;
  rect(3, -58, 10, 2, cyan); rect(11, -57, 3, 3, '#d6ffff'); ctx.restore();
  rect(-10, -60, 7, 10, ink); rect(-9, -58, 4, 5, orange);
  rect(-4, -51, 15, 5, dark); rect(7, -52, 7, 3, light);
  rect(-5, -48, 4, 3, light); rect(9, -50, 5, 2, ink);
  // Pauldron, unit insignia and the rear supporting arm.
  rect(-13, -45, 12, 12, ink); rect(-12, -44, 10, 7, light); rect(-10, -42, 6, 4, orange);
  rect(-11, -33, 8, 9, dark); rect(-7, -29, 10, 6, ink);
  ctx.restore();
  // Weapons rotate independently; support hand stays attached to the foregrip.
  ctx.save(); ctx.translate(player.x, player.y - 29);
  const angle = Math.atan2(pointer.y - player.y + 29, pointer.x - player.x);
  ctx.rotate(angle); ctx.scale(1, facing); ctx.translate(-recoil * 4, 0);
  rect(-9, -6, 14, 10, ink); rect(-7, -5, 12, 6, steel);
  if (weapon >= 3) {
    if(weapon===5){rect(7,-7,14,17,ink);rect(9,-5,10,13,'#778456');rect(12,-11,5,5,light);rect(18,-10,3,10,orange);}
    else {rect(0,-9,43,16,ink);rect(3,-7,34,11,steel);rect(6,-6,23,3,light);
      rect(31,-7,14,13,weapon===3?'#7054ad':'#985d38');
      rect(33,-4,14,5,weapon===3?'#c7a1ff':'#ffb75a');
      for(let i=0;i<3;i++)rect(7+i*7,-5,3,9,weapon===3?'#81f8ff':'#e7923f');}
  } else if (weapon === 2) {
    rect(0, -10, 44, 18, ink); rect(2, -8, 38, 13, '#586955'); rect(5, -8, 30, 3, '#9fac84');
    rect(1, -12, 7, 22, dark); rect(34, -11, 10, 20, steel); rect(40, -8, 6, 14, ink);
    rect(11, -5, 10, 7, orange); rect(14, -3, 4, 3, '#fff0a8'); rect(8, 6, 6, 10, ink);
    rect(23, -15, 8, 5, ink); rect(24, -14, 5, 2, cyan);
  } else {
    rect(0, -6, 31, 11, ink); rect(2, -5, 26, 5, steel); rect(4, -5, 22, 2, light);
    rect(29, -3, weapon === 1 ? 20 : 15, 5, ink); rect(31, -3, weapon === 1 ? 15 : 10, 2, steel);
    rect(10, -10, 10, 4, ink); rect(12, -9, 6, 2, cyan);
    rect(10, 4, 7, 11, dark); rect(11, 5, 3, 8, steel); rect(0, 4, 5, 8, ink);
    for (let i = 0; i < 3; i++) rect(20 + i * 3, -3, 1, 4, ink);
    if (weapon === 1) { rect(25, 2, 11, 5, orange); rect(40, -4, 7, 7, dark); }
  }
  rect(0, 4, 7, 7, ink); rect(1, 4, 5, 4, light);
  rect(21, 4, 7, 6, ink); rect(22, 4, 5, 3, light);
  if (now - lastShot < 55 && running && !paused) {
    ctx.shadowColor = '#ffb842'; ctx.shadowBlur = 24; ctx.fillStyle = '#fff4bb';
    ctx.beginPath(); ctx.moveTo(46, -3); ctx.lineTo(71, -11); ctx.lineTo(62, 0); ctx.lineTo(76, 6); ctx.lineTo(46, 5); ctx.fill();
  }
  ctx.restore();
}
function view() {
  if(cachedView)return cachedView;
  const b = canvas.getBoundingClientRect(), scale = b.width / WORLD_WIDTH;
  return cachedView = { b, scale, ox: (b.width - WORLD_WIDTH * scale) / 2, oy: (b.height - VIEW_HEIGHT * scale) / 2 };
}
let backdrop;
function buildBackdrop(){
  backdrop=document.createElement('canvas');backdrop.width=WORLD_WIDTH;backdrop.height=Math.ceil(VIEW_HEIGHT);
  const bg=backdrop.getContext('2d');
  const bgRect=(x,y,w,h,color)=>{bg.fillStyle=color;bg.fillRect(x,y,w,h);};
  const sky = bg.createLinearGradient(0, 0, 0, VIEW_HEIGHT); sky.addColorStop(0, '#141329'); sky.addColorStop(.6, '#343047'); sky.addColorStop(1, '#b86c55');
  bg.fillStyle = sky; bg.fillRect(0, 0, WORLD_WIDTH, VIEW_HEIGHT);
  for (let i = 0; i < 70; i++) bgRect((i * 173) % 1200, (i * 47) % 380, 2, 2, '#aea6c080');
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 26; i++) {
      const x = i * 52, height = 90 + Math.sin(i * 6.3 + layer * 4) * 90 + layer * 60;
      const y = VIEW_HEIGHT - height + 0;
      bgRect(x, y, 47, height, ['#332c47', '#242438', '#141b2b'][layer]);
      for (let yy = y + 12; yy < VIEW_HEIGHT; yy += 18) for (let xx = x + 7; xx < x + 43; xx += 11)
        if (Math.sin(xx * yy) > .25) bgRect(xx, yy, 3, 5, layer === 2 ? '#bd94794d' : '#b0a6c24d');
    }
  }
}
function render(now) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); rect(0, 0, canvas.width, canvas.height, '#101321');
  const v = view(), dpr = canvas.width / v.b.width;
  ctx.setTransform(v.scale * dpr, 0, 0, v.scale * dpr, v.ox * dpr, v.oy * dpr);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, WORLD_WIDTH, VIEW_HEIGHT); ctx.clip();
  if(!backdrop)buildBackdrop();
  ctx.drawImage(backdrop,0,0,WORLD_WIDTH,VIEW_HEIGHT);
  ctx.translate(rand(-shake, shake), rand(-shake, shake) - cameraY);
  if (ready) ctx.drawImage(surface, 0, cameraY, WORLD_WIDTH, Math.min(VIEW_HEIGHT, levelHeight - cameraY), 0, cameraY, WORLD_WIDTH, Math.min(VIEW_HEIGHT, levelHeight - cameraY));
  for (const b of debris) {
    if (b.y < cameraY - 70 || b.y > cameraY + VIEW_HEIGHT + 70) continue;
    ctx.save(); ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.rotate(b.angle);
    ctx.globalAlpha = Math.min(1, b.life);
    ctx.drawImage(b.image, -b.w / 2, -b.h / 2); ctx.restore();
  }
  for (const p of particles) {
    if(p.y<cameraY-100||p.y>cameraY+VIEW_HEIGHT+100||p.x< -100||p.x>WORLD_WIDTH+100)continue;
    ctx.save(); ctx.globalAlpha = Math.min(1, p.life / p.max) * (p.smoke ? .35 : 1);
    ctx.fillStyle = p.smoke ? '#44434b' : p.life > .3 ? '#ffbc50' : '#ffe8b2';
    if(p.fire){const r=p.size*(1.5-p.life/p.max);const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);g.addColorStop(0,'#fff6c3');g.addColorStop(.4,'#ff9329dd');g.addColorStop(1,'#ef3e0000');ctx.fillStyle=g;ctx.fillRect(p.x-r,p.y-r,r*2,r*2);}
    else if (p.smoke) {
      const size = p.size * (2.8 - p.life / p.max);
      const smoke = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,size);
      smoke.addColorStop(0,'#383438bb'); smoke.addColorStop(.45,'#66606377'); smoke.addColorStop(1,'#77707000');
      ctx.fillStyle=smoke; ctx.fillRect(p.x-size,p.y-size,size*2,size*2);
    }
    else { ctx.strokeStyle=ctx.fillStyle; ctx.lineWidth=p.size; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x-p.vx*.018,p.y-p.vy*.018); ctx.stroke(); }
    ctx.restore();
  }
  for(const b of beams){ctx.save();ctx.globalAlpha=b.life/.12;ctx.shadowColor='#ae6aff';ctx.shadowBlur=22;ctx.strokeStyle='#b373ff';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.ex,b.ey);ctx.stroke();ctx.strokeStyle='#efffff';ctx.lineWidth=2;ctx.stroke();ctx.restore();}
  for (const s of shots) {
    if(s.flame){ctx.save();const r=10+(1-s.life/.48)*23;const g=ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,r);g.addColorStop(0,'#fff4b8');g.addColorStop(.25,'#ffb32be0');g.addColorStop(.6,'#f9531977');g.addColorStop(1,'#e5360000');ctx.fillStyle=g;ctx.fillRect(s.x-r,s.y-r,r*2,r*2);ctx.restore();continue;}
    if(s.grenade){ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.life*8);rect(-5,-7,10,14,'#526344');rect(-3,-5,6,10,'#9baf75');rect(-2,-10,5,4,'#252e36');rect(3,-8,2,5,s.life<.5?'#ff6644':'#e6ba63');ctx.restore();continue;}
    ctx.save(); ctx.strokeStyle = s.rocket ? '#ffae50' : '#fff1a8'; ctx.lineWidth = s.rocket ? 5 : 2;
    ctx.shadowColor = '#ff9b32'; ctx.shadowBlur = 13; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * .018, s.y - s.vy * .018); ctx.stroke(); ctx.restore();
  }
  for (const r of rings) {
    if(r.y<cameraY-r.radius*2||r.y>cameraY+VIEW_HEIGHT+r.radius*2)continue;
    const t = 1 - r.life / .7;
    ctx.save(); ctx.globalCompositeOperation='screen';
    // Expanding overlapping flame lobes: white-hot core cooling to orange.
    for(let i=0;i<9;i++) {
      const a=i*2.399, spread=r.radius*t*.75;
      const fx=r.x+Math.cos(a)*spread,fy=r.y+Math.sin(a)*spread-t*35;
      const size=r.radius*(.25+t*.6)*(1-i*.035);
      const fire=ctx.createRadialGradient(fx,fy,0,fx,fy,size);
      fire.addColorStop(0,t<.3?'#fffce5':'#ffb237'); fire.addColorStop(.35,'#ff7b20ba'); fire.addColorStop(.7,'#ed3b1055');fire.addColorStop(1,'#a9210000');
      ctx.globalAlpha=(1-t)*.8;ctx.fillStyle=fire;ctx.fillRect(fx-size,fy-size,size*2,size*2);
    }
    ctx.globalAlpha=(1-t)**2;ctx.strokeStyle='#fff0d0';ctx.lineWidth=2*(1-t);
    ctx.beginPath();ctx.ellipse(r.x,r.y,r.radius*(.3+t*1.8),r.radius*(.2+t*1.3),0,0,Math.PI*2);ctx.stroke();ctx.restore();
  }

  // A faint ledge shows which actual webpage pixels can carry the player.
  for (const p of platforms) {
    if (p.y < cameraY || p.y > cameraY + VIEW_HEIGHT) continue;
    if (Math.abs(player.y - p.y) > 160 || player.x < p.x - 60 || player.x > p.x + p.w + 60) continue;
    ctx.save(); ctx.strokeStyle = player.grounded && player.platform === p ? '#64aaa3aa' : '#73807138';
    ctx.lineWidth = 2; ctx.setLineDash([3,4]);
    for (let x = p.x; x < p.x + p.w; x += 12) if (hitAt(x+3,p.y+5)) {
      ctx.beginPath(); ctx.moveTo(x,p.y); ctx.lineTo(Math.min(x+10,p.x+p.w),p.y); ctx.stroke();
    }
    ctx.restore();
  }
  if (landingPulse > 0) { ctx.save(); ctx.globalAlpha = landingPulse * 2; ctx.strokeStyle = '#80b8b0'; ctx.beginPath(); ctx.ellipse(player.x,player.y,25*(1-landingPulse),4,0,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
  character(now);
  if (running && !paused) {
    ctx.save(); ctx.strokeStyle = '#ff583b'; ctx.lineWidth = 1.5; ctx.shadowColor = '#fff'; ctx.shadowBlur = 3;
    ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 7, 0, Math.PI * 2);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { ctx.moveTo(pointer.x + dx * 10, pointer.y + dy * 10); ctx.lineTo(pointer.x + dx * 16, pointer.y + dy * 16); }
    ctx.stroke(); ctx.restore();
  }
  if (flash) { ctx.globalAlpha = flash * 1.3; rect(0, cameraY, WORLD_WIDTH, VIEW_HEIGHT, '#fff0bd'); ctx.globalAlpha = 1; }
  ctx.restore();
}
let previous;
function frame(now) { const dt = Math.min((now - (previous ?? now)) / 1000, .033); previous = now; if (running && !paused) tick(dt, now); if(hudDirty && now-hudAt>100){update();hudDirty=false;hudAt=now;} render(now); requestAnimationFrame(frame); }
function resize() { cachedView=null; backdrop=null; const b = canvas.getBoundingClientRect(); VIEW_HEIGHT = b.height / (b.width / WORLD_WIDTH); canvas.width = b.width * Math.min(devicePixelRatio, 2); canvas.height = b.height * Math.min(devicePixelRatio, 2); cameraY = clamp(cameraY, 0, Math.max(0, levelHeight - VIEW_HEIGHT)); player.y = clamp(player.y, cameraY + 48, cameraY + VIEW_HEIGHT - 18); }
function aim(e) { const {b, scale, ox, oy} = view(); return { x: (e.clientX - b.left - ox) / scale, y: (e.clientY - b.top - oy) / scale + cameraY }; }
function scrollScene(delta) {
  if (!ready || paused) return;
  const before = cameraY; cameraY = clamp(cameraY + delta, 0, Math.max(0, levelHeight - VIEW_HEIGHT));
  player.y += cameraY - before; pointer.y += cameraY - before;
  const pageLabel=`${Math.round(cameraY / Math.max(1, levelHeight - VIEW_HEIGHT) * 100)}%`; if(pageLabel!==lastPageLabel){$('#page-position').textContent=pageLabel;lastPageLabel=pageLabel;}
}
function start() { if (!ready) return; running = true; paused = false; $('#start').hidden = true; $('#pause').hidden = true; $('#game-status').textContent = 'A/D 移动 · 空格跳跃/长按飞行 · S 穿过平台 · 鼠标开火 · 1–6 换武器 · R 重建'; canvas.focus({preventScroll:true}); }
function pause() { if (!running) return; paused = !paused; $('#pause').hidden = !paused; firing = false; keys = {}; }
function reset() { build(); $('#page-position').textContent = '0%'; if (running) start(); }
function selectWeapon(i) { weapon = i; document.querySelectorAll('.weapon').forEach((b,j) => b.classList.toggle('active',i === j)); }
canvas.addEventListener('pointermove', e => pointer = aim(e));
canvas.addEventListener('pointerdown', e => { canvas.focus({preventScroll:true}); pointer = aim(e); if(e.button === 2) shoot(performance.now(), true); else { firing = true; shoot(performance.now()); } canvas.setPointerCapture(e.pointerId); });
window.addEventListener('pointerup', () => firing = false);
canvas.addEventListener('pointercancel', () => firing = false);
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { e.preventDefault(); scrollScene(e.deltaY); }, {passive:false});
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || $('#custom-dialog').open) return;
  if ([' ', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'PageDown', 'PageUp'].includes(e.key)) e.preventDefault();
  keys[e.key] = true; keys[e.key.toLowerCase()] = true;
  if (e.key === 'PageDown') scrollScene(500); if(e.key === 'PageUp') scrollScene(-500);
  if(e.repeat) return;
  if (/^[123456]$/.test(e.key)) selectWeapon(+e.key - 1);
  if(e.key === 'Escape') pause(); if(e.key.toLowerCase() === 'r') reset();
});
window.addEventListener('keyup',e => { keys[e.key] = false; keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { keys = {}; firing = false; if(running && !paused) pause(); });
$('#play').onclick = start; $('#resume').onclick = pause; $('#reset').onclick = reset; $('#again').onclick = reset;
$('#help').onclick = () => { if (!running) start(); if (!paused) pause(); };
$('#sound').onclick = () => { sound = !sound; $('#sound').textContent = `声音：${sound ? '开' : '关'}`; if(sound) tone('laser'); };

$('#page-up').onclick = () => scrollScene(-540); $('#page-down').onclick = () => scrollScene(540);
$('#fullscreen').onclick = async () => { try { if(document.fullscreenElement) await document.exitFullscreen(); else await $('#arena').requestFullscreen(); } catch { $('#game-status').textContent = '当前浏览器不支持全屏，可放大窗口体验'; } };
document.querySelectorAll('.weapon').forEach(b => b.onclick = () => selectWeapon(+b.dataset.weapon));
function setScene(s) { mode = s; document.querySelectorAll('[data-scene]').forEach(b => b.classList.toggle('active',b.dataset.scene === s)); reset(); }
document.querySelectorAll('[data-scene]').forEach(b => b.onclick = () => { if(b.dataset.scene === 'custom') { $('#custom-dialog').showModal(); firing = false; keys = {}; } else setScene(b.dataset.scene); });
$('#custom-dialog').addEventListener('close', () => { if($('#custom-dialog').returnValue === 'create' && $('#custom-text').value.trim()) { custom = $('#custom-text').value.trim(); setScene('custom'); } });
document.querySelectorAll('[data-move]').forEach(b => { b.onpointerdown = e => { e.preventDefault(); keys[b.dataset.move] = true; b.setPointerCapture(e.pointerId); }; b.onpointerup = b.onpointercancel = () => keys[b.dataset.move] = false; });
$('#touch-fire').onpointerdown = e => { e.preventDefault(); firing = true; e.target.setPointerCapture(e.pointerId); }; $('#touch-fire').onpointerup = () => firing = false;
photo.onload = () => { ready = true; build(); $('#play').disabled = false; $('#play').innerHTML = '进入真实网页 <span>↗</span>'; start(); };
photo.onerror = () => { $('#game-status').textContent = '网页画面加载失败，请刷新重试'; $('#play').textContent = '画面加载失败'; };
$('#sound').textContent = '声音：开';
$('#play').disabled = true; $('#play').textContent = '载入真实网页…';
photo.src = `${import.meta.env.BASE_URL}captures/zlbigger.png`;
window.addEventListener('resize',resize); resize(); requestAnimationFrame(frame);
