// ─── DRAWING ────────────────────────────────────────────
function drawRink() {
  const topSlot = defendsTop(0) ? 0 : 1;
  const botSlot = 1 - topSlot;

  // Background (outside rink) — offset to cover full canvas despite translate
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(-RINK_X, 0, CANVAS_W, H);

  // Ice
  ctx.fillStyle = '#dde8f0';
  ctx.fillRect(0, 0, W, H);

  // Subtle ice texture
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = i % 2 ? '#fff' : '#b0c0d0';
    ctx.fillRect(Math.random()*W, Math.random()*H, rand(20,80)*S, 1);
  }
  ctx.globalAlpha = 1;

  // 3D Board — layered strokes for depth
  const cr = 20 * S;
  const boardPath = new Path2D();
  boardPath.moveTo(cr, 0);
  boardPath.lineTo(W - cr, 0);
  boardPath.arcTo(W, 0, W, cr, cr);
  boardPath.lineTo(W, H - cr);
  boardPath.arcTo(W, H, W - cr, H, cr);
  boardPath.lineTo(cr, H);
  boardPath.arcTo(0, H, 0, H - cr, cr);
  boardPath.lineTo(0, cr);
  boardPath.arcTo(0, 0, cr, 0, cr);
  boardPath.closePath();

  // Outer shadow
  ctx.strokeStyle = '#0a0a14';
  ctx.lineWidth = 9 * S;
  ctx.stroke(boardPath);
  // Board face (dasher)
  ctx.strokeStyle = '#2a2a3e';
  ctx.lineWidth = 6 * S;
  ctx.stroke(boardPath);
  // Board highlight
  ctx.strokeStyle = '#445';
  ctx.lineWidth = 3 * S;
  ctx.stroke(boardPath);
  // Inner edge (ice meets board)
  ctx.strokeStyle = '#778';
  ctx.lineWidth = 1 * S;
  ctx.stroke(boardPath);

  // Penalty box areas (outside rink, drawn over board to create gates)
  const box0Top = H / 2 - PEN_BOX_GAP / 2 - PEN_BOX_H;
  const box0Bot = box0Top + PEN_BOX_H;
  const box1Top = H / 2 + PEN_BOX_GAP / 2;
  const box1Bot = box1Top + PEN_BOX_H;
  const gateDepth = 8 * S; // how far into board the gate cuts
  const boxInset = 6 * S;  // gap between board outer edge and box walls

  // Dark fill beyond board (non-gate areas only)
  const outerEdge = 5 * S; // just past outer board stroke
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(W + outerEdge, 0, PEN_BOX_W - outerEdge, box0Top);
  ctx.fillRect(W + outerEdge, box0Bot, PEN_BOX_W - outerEdge, box1Top - box0Bot);
  ctx.fillRect(W + outerEdge, box1Bot, PEN_BOX_W - outerEdge, H - box1Bot);

  // Draw penalty boxes with gate openings
  const gateOpenH = 20 * S; // small door opening
  for (let t = 0; t < 2; t++) {
    const byTop = t === 0 ? box0Top : box1Top;
    const gateTop = byTop + (PEN_BOX_H - gateOpenH) / 2;
    // Erase board strokes only at the small gate opening
    ctx.fillStyle = '#dde8f0';
    ctx.fillRect(W - 5 * S, gateTop, 5 * S, gateOpenH);
    ctx.fillStyle = '#181822';
    ctx.fillRect(W, gateTop, outerEdge, gateOpenH);
    // Box floor (fully outside rink)
    ctx.fillStyle = '#181822';
    ctx.fillRect(W + outerEdge, byTop, PEN_BOX_W - outerEdge, PEN_BOX_H);
    // Bench seat (against far wall)
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(W + PEN_BOX_W - 10 * S, byTop + 4 * S, 5 * S, PEN_BOX_H - 8 * S);
    // Box walls — top, right, bottom + left wall with gate gap
    ctx.strokeStyle = '#445';
    ctx.lineWidth = 1.5 * S;
    const boxLeft = W + outerEdge;
    ctx.beginPath();
    ctx.moveTo(boxLeft, byTop);
    ctx.lineTo(W + PEN_BOX_W, byTop);
    ctx.lineTo(W + PEN_BOX_W, byTop + PEN_BOX_H);
    ctx.lineTo(boxLeft, byTop + PEN_BOX_H);
    ctx.stroke();
    // Left wall segments (above and below gate)
    ctx.beginPath();
    ctx.moveTo(boxLeft, byTop);
    ctx.lineTo(boxLeft, gateTop);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(boxLeft, gateTop + gateOpenH);
    ctx.lineTo(boxLeft, byTop + PEN_BOX_H);
    ctx.stroke();
  }

  // Center line
  ctx.strokeStyle = '#c04040';
  ctx.lineWidth = 2 * S;
  ctx.beginPath();
  ctx.moveTo(0, H/2);
  ctx.lineTo(W, H/2);
  ctx.stroke();

  // Center circle
  ctx.beginPath();
  ctx.arc(W/2, H/2, 30*S, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W/2, H/2, 3*S, 0, Math.PI * 2);
  ctx.fillStyle = '#c04040';
  ctx.fill();

  // Blue lines
  ctx.strokeStyle = '#3060c0';
  ctx.lineWidth = 2 * S;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.3);
  ctx.lineTo(W, H * 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, H * 0.7);
  ctx.lineTo(W, H * 0.7);
  ctx.stroke();

  // Face-off circles
  const faceoffs = [
    [W*0.25, H*0.2], [W*0.75, H*0.2],
    [W*0.25, H*0.8], [W*0.75, H*0.8],
  ];
  ctx.strokeStyle = '#c04040';
  ctx.lineWidth = 1 * S;
  for (const [fx, fy] of faceoffs) {
    ctx.beginPath();
    ctx.arc(fx, fy, 16*S, 0, Math.PI*2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(fx, fy, 2*S, 0, Math.PI*2);
    ctx.fillStyle = '#c04040';
    ctx.fill();
  }

  // Goals
  const tTop = teamOf(topSlot);
  const tBot = teamOf(botSlot);
  const topGoal = { fill: tTop.goalFill, stroke: tTop.goalStroke, net: tTop.goalNet };
  const botGoal = { fill: tBot.goalFill, stroke: tBot.goalStroke, net: tBot.goalNet };

  ctx.fillStyle = topGoal.fill;
  ctx.fillRect(GOAL_X, 0, GOAL_W, GOAL_DEPTH);
  ctx.strokeStyle = topGoal.stroke;
  ctx.lineWidth = 2 * S;
  ctx.strokeRect(GOAL_X, 0, GOAL_W, GOAL_DEPTH);
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(GOAL_X + i * GOAL_W/4, 0);
    ctx.lineTo(GOAL_X + i * GOAL_W/4, GOAL_DEPTH);
    ctx.strokeStyle = topGoal.net;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.fillStyle = botGoal.fill;
  ctx.fillRect(GOAL_X, H - GOAL_DEPTH, GOAL_W, GOAL_DEPTH);
  ctx.strokeStyle = botGoal.stroke;
  ctx.lineWidth = 2 * S;
  ctx.strokeRect(GOAL_X, H - GOAL_DEPTH, GOAL_W, GOAL_DEPTH);
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(GOAL_X + i * GOAL_W/4, H - GOAL_DEPTH);
    ctx.lineTo(GOAL_X + i * GOAL_W/4, H);
    ctx.strokeStyle = botGoal.net;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Crease arcs
  ctx.strokeStyle = topGoal.stroke;
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath();
  ctx.arc(W/2, 0, 26*S, 0, Math.PI);
  ctx.stroke();
  ctx.strokeStyle = botGoal.stroke;
  ctx.beginPath();
  ctx.arc(W/2, H, 26*S, Math.PI, Math.PI * 2);
  ctx.stroke();
}

function drawIceTrails() {
  ctx.lineWidth = 1 * S;
  ctx.lineCap = 'round';
  for (const p of players) {
    if (p.iceTrail.length < 2) continue;
    for (let i = 1; i < p.iceTrail.length; i++) {
      ctx.globalAlpha = (i / p.iceTrail.length) * 0.07;
      ctx.strokeStyle = '#b0c4d4';
      ctx.beginPath();
      ctx.moveTo(p.iceTrail[i-1].x, p.iceTrail[i-1].y);
      ctx.lineTo(p.iceTrail[i].x, p.iceTrail[i].y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawPlayers() {
  for (const p of players) {
    const isCarrier = p.hasPuck;
    const t = teamOf(p.team);
    const tName = t.name.toLowerCase();
    const spriteName = p.role === 'goalie' ? `goalie_${tName}` : `player_${tName}`;
    const sprite = spriteImages[spriteName];
    const size = p.r * 2.5;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(p.x + 2*S, p.y + 2*S, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (sprite) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.facing - Math.PI / 2);
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.fillStyle = t.body;
      ctx.strokeStyle = t.outline;
      ctx.lineWidth = 1.5 * S;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = t.helmet;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 1.5*S, p.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      if (p.role === 'goalie') {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${5*S}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('G', p.x, p.y + 1*S);
      }
    }

    if (p.penalized) {
      // Penalty timer text
      ctx.fillStyle = '#ffcc00';
      ctx.font = `${3*S}px 'Press Start 2P', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(Math.ceil(p.penaltyTimer) + 's', p.x, p.y - p.r - 2*S);
    }

    // Carrier indicator
    if (isCarrier) {
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 1.5 * S;
      ctx.setLineDash([3*S, 3*S]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 3*S, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function drawPuck() {
  // Trail
  for (let i = 0; i < puck.trail.length; i++) {
    const t = puck.trail[i];
    const alpha = (i / puck.trail.length) * 0.3;
    ctx.fillStyle = `rgba(20,20,20,${alpha})`;
    ctx.beginPath();
    ctx.arc(t.x, t.y, puck.r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Puck
  const puckSprite = spriteImages['puck'];
  if (puckSprite) {
    const ps = puck.r * 2.5;
    ctx.drawImage(puckSprite, puck.x - ps / 2, puck.y - ps / 2, ps, ps);
  } else {
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(puck.x, puck.y, puck.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.arc(puck.x - 1*S, puck.y - 1*S, puck.r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawUI() {
  document.getElementById('score-0').textContent = score[0];
  document.getElementById('score-1').textContent = score[1];
  if (overtime) {
    const otNum = period - TOTAL_PERIODS;
    document.getElementById('period-info').textContent = otNum > 1 ? `OT${otNum}` : 'OT';
  } else {
    document.getElementById('period-info').textContent = `P${period}`;
  }
  const mins = Math.floor(clock / 60);
  const secs = Math.floor(clock % 60);
  document.getElementById('game-time').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
}

function drawOverlays() {
  // Faceoff indicator
  if (state === 'faceoff') {
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.008);
    ctx.strokeStyle = `rgba(255, 204, 0, ${pulse})`;
    ctx.lineWidth = 2 * S;
    ctx.beginPath();
    ctx.arc(faceoffPos.x, faceoffPos.y, 12 * S + pulse * 5 * S, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 204, 0, ${0.5 + pulse * 0.5})`;
    ctx.font = `${5*S}px 'Press Start 2P', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FACE-OFF', faceoffPos.x, faceoffPos.y - 22*S);
  }

  // Penalty announcement overlay
  if (state === 'penalty') {
    ctx.fillStyle = 'rgba(5,5,20,0.6)';
    ctx.fillRect(-RINK_X, H/2 - 30*S, CANVAS_W, 60*S);
    ctx.fillStyle = teamOf(lastPenaltyTeam).light;
    ctx.font = `${9*S}px 'Press Start 2P', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${teamOf(lastPenaltyTeam).name} PENALTY`, W/2, H/2);
  }

  // Period end overlay
  if (state === 'periodEnd') {
    ctx.fillStyle = 'rgba(5,5,20,0.6)';
    ctx.fillRect(-RINK_X, H/2 - 30*S, CANVAS_W, 60*S);
    ctx.fillStyle = '#ffcc00';
    ctx.font = `${10*S}px 'Press Start 2P', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const endText = (overtime || (period === TOTAL_PERIODS && score[0] === score[1]))
      ? 'OVERTIME' : `END P${period}`;
    ctx.fillText(endText, W/2, H/2);
  }

  // Game over overlay
  if (state === 'gameOver') {
    ctx.fillStyle = 'rgba(5,5,20,0.75)';
    ctx.fillRect(-RINK_X, H/2 - 50*S, CANVAS_W, 100*S);
    ctx.fillStyle = '#ffcc00';
    ctx.font = `${8*S}px 'Press Start 2P', monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W/2, H/2 - 18*S);
    ctx.font = `${12*S}px 'Press Start 2P', monospace`;
    ctx.fillText(`${score[0]} - ${score[1]}`, W/2, H/2 + 5*S);
    let winner;
    if (score[0] > score[1]) winner = overtime ? `${teamOf(0).name} WINS (OT)!` : `${teamOf(0).name} WINS!`;
    else if (score[1] > score[0]) winner = overtime ? `${teamOf(1).name} WINS (OT)!` : `${teamOf(1).name} WINS!`;
    else winner = 'TIE!';
    ctx.font = `${7*S}px 'Press Start 2P', monospace`;
    ctx.fillStyle = score[0] > score[1] ? teamOf(0).light : score[1] > score[0] ? teamOf(1).light : '#fff';
    ctx.fillText(winner, W/2, H/2 + 28*S);
    ctx.font = `${4*S}px 'Press Start 2P', monospace`;
    ctx.fillStyle = '#888';
    ctx.fillText(franchise ? 'TAP TO CONTINUE' : 'TAP TO RESTART', W/2, H/2 + 42*S);
  }

  // Active penalty indicators on canvas
  const activePen = players ? players.filter(p => p.penalized) : [];
  if (activePen.length > 0 && state === 'playing') {
    ctx.font = `${3.5*S}px 'Press Start 2P', monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    for (let i = 0; i < activePen.length; i++) {
      const p = activePen[i];
      ctx.fillStyle = teamOf(p.team).light;
      ctx.fillText(`PEN ${Math.ceil(p.penaltyTimer)}s`, W - 6*S, 6*S + i * 9*S);
    }
  }
}

function showGoalFlash(team) {
  playSound('goal');
  const el = document.getElementById('goal-flash');
  const span = el.querySelector('span');
  const t = teamOf(team);
  span.textContent = `${t.name} GOAL!`;
  span.style.color = t.light;
  el.style.background = t.bg;
  el.style.display = 'flex';
  span.style.animation = 'none';
  void span.offsetWidth;
  span.style.animation = 'goalPulse 0.6s ease-out';
  setTimeout(() => { el.style.display = 'none'; }, 1500);
}
