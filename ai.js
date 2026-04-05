// ─── PULLED GOALIE ──────────────────────────────────────
function getBenchPos() { return { x: -30 * S, y: H / 2 }; }

function updatePulledGoalie() {
  for (let team = 0; team < 2; team++) {
    const opp = 1 - team;
    const trailing = score[opp] - score[team]; // how many goals behind
    const shouldPull = !overtime
      && period === TOTAL_PERIODS
      && trailing >= 1 && trailing <= 2
      && clock <= (trailing === 1 ? 60 : 90)
      && !players.find(p => p.team === team && p.penalized && p.role !== 'goalie');

    if (shouldPull && !pulledGoalie[team]) {
      pulledGoalie[team] = true;
    } else if (!shouldPull && pulledGoalie[team]) {
      // Restore goalie (tied up, scored, period changed, etc.)
      pulledGoalie[team] = false;
      const goalie = players.find(p => p.team === team && p.role === 'goalie');
      if (goalie) {
        goalie.pulledOff = false;
      }
    }
  }
}

function isGoaliePulled(team) {
  return pulledGoalie[team];
}

// ─── AI ─────────────────────────────────────────────────
function aiUpdate(dt) {
  updatePulledGoalie();
  const carrier = players.find(p => p.hasPuck);

  for (const p of players) {
    // Tick penalty timer during play
    if (p.penalized) {
      p.penaltyTimer -= dt;
      if (p.penaltyTimer <= 0) {
        p.penalized = false;
        p.penaltyTimer = 0;
        delete p.reachedGate;
        // Restore home position
        const positions = [...getTeamPositions(0), ...getTeamPositions(1)];
        const idx = players.indexOf(p);
        p.hx = positions[idx].hx;
        p.hy = positions[idx].hy;
      }
    }

    // Penalized: go to gate opening first, then into penalty box
    if (p.penalized) {
      const gate = PENALTY_GATE[p.team];
      const penTeammates = players.filter(o => o.penalized && o.team === p.team);
      const seatIdx = penTeammates.indexOf(p);
      const seatOffset = (seatIdx - (penTeammates.length - 1) / 2) * 16 * S;
      const box = { x: PENALTY_BOX[p.team].x, y: PENALTY_BOX[p.team].y + seatOffset };
      const target = (!p.reachedGate) ? gate : box;
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 3) {
        p.vx = (dx / d) * 100 * S;
        p.vy = (dy / d) * 100 * S;
      } else if (!p.reachedGate) {
        p.reachedGate = true;
        p.vx = 0; p.vy = 0;
      } else {
        p.vx = 0; p.vy = 0;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      continue;
    }

    // Pulled goalie: skate off to bench
    if (p.role === 'goalie' && isGoaliePulled(p.team)) {
      const benchTarget = getBenchPos();
      const dx = benchTarget.x - p.x;
      const dy = benchTarget.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 5) {
        const benchSpd = 80 * S;
        p.vx = (dx / d) * benchSpd;
        p.vy = (dy / d) * benchSpd;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.hasPuck) {
          // Drop puck before leaving
          p.hasPuck = false;
          puck.vx = 0; puck.vy = 0;
        }
      } else {
        p.x = benchTarget.x;
        p.y = benchTarget.y;
        p.vx = 0; p.vy = 0;
        p.pulledOff = true;
      }
      continue;
    }
    // Goalie returning from being pulled
    if (p.role === 'goalie' && p.pulledOff) {
      p.pulledOff = false;
      const defTop = defendsTop(p.team);
      p.hx = W / 2;
      p.hy = defTop ? 30 * S : H - 30 * S;
    }

    let tx = p.hx, ty = p.hy;
    const spdStat = getPlayerStat(p, 'speed');
    let spd = p.role === 'goalie' ? (30 + spdStat * 2.25) * S : (67 + spdStat * 6) * S;
    if (p.stunTimer > 0) spd *= 0.2;

    // Goalie positioning: lerp tracking toward puck.x based on positioning stat
    if (p.role === 'goalie') {
      const posStat = getPlayerStat(p, 'positioning');
      const trackSpeed = 1 + posStat * 0.6; // 1.6 (pos=1) to 7 (pos=10) per second
      const target = clamp(puck.x, GOAL_X + 10*S, GOAL_X + GOAL_W - 10*S);
      const diff = target - p.goalieTrackX;
      p.goalieTrackX += diff * Math.min(1, trackSpeed * dt);
    }
    const defTop = defendsTop(p.team);
    const attackDir = defTop ? 1 : -1;
    const ownGoalY = defTop ? 0 : H;
    const oppGoalY = defTop ? H : 0;

    p.shootCooldown = Math.max(0, p.shootCooldown - dt);
    p.puckShield = Math.max(0, p.puckShield - dt);
    p.pickupCooldown = Math.max(0, p.pickupCooldown - dt);
    p.shoveCooldown = Math.max(0, p.shoveCooldown - dt);
    p.stunTimer = Math.max(0, p.stunTimer - dt);

    if (p.hasPuck) {
      if (p.role === 'goalie') {
        const target = bestGoaliePassTarget(p);
        if (target) {
          const lead = getPassLead(p, target);
          const n = norm(lead.x - p.x, lead.y - p.y);
          const aimDist = dist(p, lead);
          const power = clamp(aimDist * 0.85, 100 * S, 230 * S);
          puck.vx = n.x * power;
          puck.vy = n.y * power;
          p.hasPuck = false;
          p.shootCooldown = 0.3;
          p.pickupCooldown = 0.6;
          playSound('pass');
        }
        tx = p.goalieTrackX;
        ty = ownGoalY + (defTop ? 25*S : -25*S);
      } else {
        p.holdTimer += dt;

        const goalX = W / 2;
        const goalY = oppGoalY;
        const dg = dist(p, { x: goalX, y: goalY });
        const shotStat = getPlayerStat(p, 'shot');
        const oppTeam = 1 - p.team;
        const emptyNet = isGoaliePulled(oppTeam);
        const shotRange = emptyNet ? (160 + shotStat * 10) * S : (70 + shotStat * 8) * S;
        const shotPower = (220 + shotStat * 20) * S;

        if (dg < shotRange && p.shootCooldown <= 0) {
          const spread = emptyNet ? rand(-8*S, 8*S) : rand(-20*S, 20*S);
          let n = norm(goalX - p.x + spread, goalY - p.y);
          const defAngle = getDefensePenalty(p);
          if (defAngle) {
            const cos = Math.cos(defAngle), sin = Math.sin(defAngle);
            n = { x: n.x * cos - n.y * sin, y: n.x * sin + n.y * cos };
          }
          puck.vx = n.x * shotPower;
          puck.vy = n.y * shotPower;
          p.hasPuck = false;
          p.shootCooldown = 1.0;
          p.pickupCooldown = 0.6;
          p.holdTimer = 0;
          spawnParticles(puck.x, puck.y, '#ffcc00', 8, 80 * S);
          playSound('shot');
        } else {
          tx = goalX + Math.sin(Date.now() * 0.003 + p.hx) * 40 * S;
          ty = p.y + attackDir * 50 * S;

          const nearestOpp = closestOpponent(p);
          const oppDist = nearestOpp ? dist(p, nearestOpp) : 999;
          const teammate = bestPassTarget(p);

          if (teammate) {
            let doPass = false;
            const myGoaliePulled = isGoaliePulled(p.team);

            if (p.holdTimer > 2.5) doPass = true;
            if (oppDist < 35 * S && p.holdTimer > 0.8) doPass = true;
            if (oppDist < 20 * S && p.holdTimer > 0.4) doPass = true;
            if (p.role === 'def' && p.holdTimer > 1.2) doPass = true;
            if (p.holdTimer > 1.0 && Math.random() < 0.015) doPass = true;
            // Desperate passing when our goalie is pulled
            if (myGoaliePulled && p.holdTimer > 0.6) doPass = true;

            if (doPass && p.shootCooldown <= 0) {
              const lead = getPassLead(carrier, teammate);
              const n = norm(lead.x - p.x, lead.y - p.y);
              const aimDist = dist(p, lead);
              const power = clamp(aimDist * 0.85, 100 * S, 230 * S);
              puck.vx = n.x * power;
              puck.vy = n.y * power;
              p.hasPuck = false;
              p.shootCooldown = 0.3;
              p.pickupCooldown = 0.6;
              p.holdTimer = 0;
              playSound('pass');
            }
          }
        }
      }
    } else if (carrier && carrier.team === p.team) {
      p.holdTimer = 0;
      const pulled = isGoaliePulled(p.team);
      if (p.role === 'goalie') {
        tx = p.goalieTrackX;
        ty = ownGoalY + (defTop ? 20*S : -20*S);
      } else if (p.role === 'def') {
        const side = (p.hx < W/2) ? -1 : 1;
        tx = W/2 + side * 80 * S;
        // When goalie pulled, defenders push up like extra forwards
        ty = pulled
          ? carrier.y + attackDir * 30 * S
          : carrier.y - attackDir * 70 * S;
        ty = clamp(ty, 35*S, H - 35*S);
      } else if (p.role === 'fwd') {
        const side = (p.hx < W/2) ? -1 : 1;
        tx = W/2 + side * 75 * S;
        ty = carrier.y + attackDir * 90 * S;
        ty = clamp(ty, 35*S, H - 35*S);
      } else {
        const carrierSide = carrier.x < W/2 ? 1 : -1;
        tx = W/2 + carrierSide * 20 * S;
        ty = carrier.y + attackDir * 50 * S;
        ty = clamp(ty, 35*S, H - 35*S);
      }
      tx += Math.sin(Date.now() * 0.003 + p.hx * 0.1) * 12 * S;
    } else if (carrier && carrier.team !== p.team) {
      p.holdTimer = 0;
      if (p.role === 'goalie') {
        tx = p.goalieTrackX;
        ty = ownGoalY + (defTop ? 20*S : -20*S);
      } else {
        const closest = closestToPuck(p.team);
        if (p === closest) {
          tx = puck.x + puck.vx * 0.15;
          ty = puck.y + puck.vy * 0.15;
        } else if (p.role === 'def') {
          const side = (p.hx < W/2) ? -1 : 1;
          tx = W/2 + side * 55 * S;
          const midY = (puck.y + ownGoalY) / 2;
          ty = clamp(midY, defTop ? 50*S : H - 180*S, defTop ? 180*S : H - 50*S);
        } else {
          const side = (p.hx < W/2) ? -1 : 1;
          tx = clamp(puck.x + side * 50 * S, 30*S, W - 30*S);
          ty = p.hy + (puck.y - H/2) * 0.3;
          ty = clamp(ty, 50*S, H - 50*S);
        }
      }
    } else {
      if (p.role === 'goalie') {
        tx = p.goalieTrackX;
        ty = ownGoalY + (defTop ? 20*S : -20*S);
      } else {
        const closest = closestToPuck(p.team);
        if (p === closest) {
          tx = puck.x; ty = puck.y;
        } else {
          tx = p.hx; ty = p.hy;
        }
      }
    }

    // Goalie constraints
    if (p.role === 'goalie') {
      const gyMin = defTop ? 8*S : H - 45*S;
      const gyMax = defTop ? 45*S : H - 8*S;
      ty = clamp(ty, gyMin, gyMax);
      tx = clamp(tx, GOAL_X - 5*S, GOAL_X + GOAL_W + 5*S);
    }

    // Move toward target
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);

    // Snow spray: braking while fast
    const spBefore = Math.hypot(p.vx, p.vy);
    if (d > 2 && spBefore > 60 * S) {
      const dotProd = dx * p.vx + dy * p.vy;
      if (dotProd < -0.5 && Math.random() < 0.08) {
        spawnParticles(p.x, p.y, '#e0e8f0', 3, 30 * S);
      }
    }

    if (d > 2 && p.stunTimer <= 0) {
      const acc = spd * 4;
      p.vx += (dx / d) * acc * dt;
      p.vy += (dy / d) * acc * dt;
    }

    // Separation
    if (p.role !== 'goalie') {
      for (const other of players) {
        if (other === p || other.team !== p.team || other.role === 'goalie' || other.penalized) continue;
        const sep = dist(p, other);
        const minSep = 55 * S;
        if (sep < minSep && sep > 0) {
          const pushStr = (minSep - sep) / minSep * spd * 3.5;
          const nx = (p.x - other.x) / sep;
          const ny = (p.y - other.y) / sep;
          p.vx += nx * pushStr * dt;
          p.vy += ny * pushStr * dt;
        }
      }
    }

    // Friction
    const fric = 0.94;
    p.vx *= fric; p.vy *= fric;

    // Speed limit (stunned players coast freely from knockback)
    const sp = Math.hypot(p.vx, p.vy);
    if (p.stunTimer <= 0 && sp > spd) { p.vx *= spd/sp; p.vy *= spd/sp; }

    // Move
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Rink bounds
    const margin = p.r;
    p.x = clamp(p.x, margin, W - margin);
    p.y = clamp(p.y, margin, H - margin);

    // Update facing angle when moving
    if (sp > 20 * S) {
      p.facing = Math.atan2(p.vy, p.vx);
    }

    // Ice trail
    if (sp > 30 * S) {
      p.iceTrail.push({ x: p.x, y: p.y });
      if (p.iceTrail.length > 40) p.iceTrail.shift();
    }

    // Pick up puck
    if (!carrier && !p.hasPuck && p.pickupCooldown <= 0 && dist(p, puck) < p.r + puck.r + 2*S) {
      const puckSpeed = Math.hypot(puck.vx, puck.vy);

      if (p.role === 'goalie') {
        // Goalie: catch, rebound, or miss (goes through)
        const saveStat = getPlayerStat(p, 'save');
        const catchChance = puckSpeed < 80 * S
          ? (0.35 + saveStat * 0.05)  // slow: 40%-85%
          : (0.08 + saveStat * 0.04); // fast: 12%-48%
        const blockChance = puckSpeed < 80 * S
          ? (0.4 + saveStat * 0.04)   // slow: 44%-80%
          : (0.25 + saveStat * 0.05); // fast: 30%-75%
        const roll = Math.random();
        if (roll < catchChance) {
          // Clean catch
          p.hasPuck = true;
          p.holdTimer = 0;
          p.puckShield = 0.5;
          puck.vx = 0; puck.vy = 0;
          p.shootCooldown = 0;
          const pi = players.indexOf(p);
          const history = puckCarrierHistory[p.team];
          if (history[0] !== pi) { history.unshift(pi); if (history.length > 3) history.pop(); }
        } else if (roll < catchChance + blockChance) {
          // Rebound — block but don't catch
          const d = dist(p, puck) || 1;
          const nx = (puck.x - p.x) / d;
          const ny = (puck.y - p.y) / d;
          const reboundSpeed = puckSpeed * rand(0.25, 0.55);
          const angle = Math.atan2(ny, nx) + rand(-0.8, 0.8);
          puck.vx = Math.cos(angle) * reboundSpeed;
          puck.vy = Math.sin(angle) * reboundSpeed;
          puck.x = p.x + nx * (p.r + puck.r + 2);
          puck.y = p.y + ny * (p.r + puck.r + 2);
          p.pickupCooldown = 0.35;
          spawnParticles(puck.x, puck.y, '#e0e8f0', 5, 50 * S);
          playSound('board');
        }
        // else: miss — puck goes straight through
      } else {
        // Skater pickup
        if (puckSpeed < 200 * S || Math.random() < 0.4) {
          p.hasPuck = true;
          p.holdTimer = 0;
          p.puckShield = 0.5;
          const pi = players.indexOf(p);
          const history = puckCarrierHistory[p.team];
          if (history[0] !== pi) { history.unshift(pi); if (history.length > 3) history.pop(); }

          // One-timer: receive pass near goal → instant shot
          const oppGoalDist = dist(p, { x: W/2, y: oppGoalY });
          if (puckSpeed > 80 * S && oppGoalDist < 120 * S) {
            const otPower = (240 + getPlayerStat(p, 'shot') * 22) * S;
            let n = norm(W/2 - p.x + rand(-15*S, 15*S), oppGoalY - p.y);
            const defAngle = getDefensePenalty(p);
            if (defAngle) {
              const cos = Math.cos(defAngle), sin = Math.sin(defAngle);
              n = { x: n.x * cos - n.y * sin, y: n.x * sin + n.y * cos };
            }
            puck.vx = n.x * otPower;
            puck.vy = n.y * otPower;
            p.hasPuck = false;
            p.shootCooldown = 1.0;
            p.pickupCooldown = 0.6;
            spawnParticles(puck.x, puck.y, '#ffcc00', 10, 100 * S);
            playSound('shot');
          } else {
            puck.vx = 0; puck.vy = 0;
          }
        }
      }
    }

    // Body check
    if (carrier && carrier.team !== p.team && carrier.puckShield <= 0 && carrier.role !== 'goalie' && p.role !== 'goalie' && !p.penalized && dist(p, carrier) < p.r * 2.2) {
      const checkRate = 0.04 + getPlayerStat(p, 'check') * 0.016;
      if (Math.random() < checkRate) {
        carrier.hasPuck = false;
        carrier.pickupCooldown = 0.6;
        puck.vx = rand(-60, 60) * S;
        puck.vy = rand(-60, 60) * S;
        spawnParticles(carrier.x, carrier.y, '#fff', 6, 60 * S);
        playSound('body_check');
        if (matchStats) { const pi = players.indexOf(p); matchStats[pi].bodyChecks++; }

        // Penalty chance
        if (Math.random() < 0.25 && !pendingPenalty) {
          p.penalized = true;
          p.penaltyTimer = PENALTY_DURATION;
          const defTop2 = defendsTop(p.team);
          const side = Math.random() < 0.5 ? 0.25 : 0.75;
          pendingPenalty = {
            team: p.team,
            faceoffPos: {
              x: W * side,
              y: defTop2 ? H * 0.2 : H * 0.8,
            },
          };
        }
      }
    }

    // Shove — any skater can shove any nearby opponent
    if (p.role !== 'goalie' && !p.penalized && p.shoveCooldown <= 0) {
      for (const opp of players) {
        if (opp.team === p.team || opp.role === 'goalie' || opp.penalized || opp.stunTimer > 0) continue;
        const d = dist(p, opp);
        if (d < p.r * 3 && d > 0) {
          const checkStat = getPlayerStat(p, 'check');
          let shoveChance;
          const bothNearLoosePuck = !carrier && dist(p, puck) < 40 * S && dist(opp, puck) < 40 * S;
          if (opp.hasPuck) {
            shoveChance = 0.004 + checkStat * 0.002;
          } else if (bothNearLoosePuck) {
            shoveChance = 0.002 + checkStat * 0.001;
          } else {
            shoveChance = 0.0004 + checkStat * 0.0002;
          }
          if (Math.random() < shoveChance) {
            // Direction: shover → shoved
            const nx = (opp.x - p.x) / d;
            const ny = (opp.y - p.y) / d;
            const knockback = (115 + checkStat * 14) * S;

            // Save shoved player's velocity before hit (for puck)
            const prevVx = opp.vx;
            const prevVy = opp.vy;

            // Apply knockback
            opp.vx = nx * knockback;
            opp.vy = ny * knockback;
            opp.stunTimer = 2.2 - getPlayerStat(opp, 'defense') * 0.1;
            p.shoveCooldown = 2.0;

            // Puck: follows shoved player's pre-shove velocity with slight random offset
            if (opp.hasPuck) {
              opp.hasPuck = false;
              opp.pickupCooldown = 0.6;
              puck.vx = prevVx + rand(-30, 30) * S;
              puck.vy = prevVy + rand(-30, 30) * S;
            }

            // Particles + screen shake + sound
            spawnParticles(opp.x, opp.y, '#fff', 8, 80 * S);
            shakeAmount = 4 * S;
            playSound('body_check');
            if (matchStats) { const pi = players.indexOf(p); matchStats[pi].bodyChecks++; }

            // Contextual penalty chance
            let penaltyChance = 0.10; // base 10%

            // Away from puck: +15-20%
            const puckDist = dist(opp, puck);
            if (puckDist > 80 * S) penaltyChance += 0.15 + Math.random() * 0.05;

            // From behind: +10-15%
            const shoveAngle = Math.atan2(ny, nx);
            const facingDiff = Math.abs(shoveAngle - opp.facing);
            const angleDelta = Math.min(facingDiff, Math.PI * 2 - facingDiff);
            if (angleDelta < Math.PI * 0.4) penaltyChance += 0.10 + Math.random() * 0.05;

            // Into the boards: +20-25%
            const margin = opp.r + 5 * S;
            const nearBoard = opp.x < margin || opp.x > W - margin || opp.y < margin || opp.y > H - margin;
            if (nearBoard) penaltyChance += 0.20 + Math.random() * 0.05;

            // Check stat reduces penalty slightly
            penaltyChance -= checkStat * 0.008;
            penaltyChance = Math.max(penaltyChance, 0.05);

            if (Math.random() < penaltyChance && !pendingPenalty) {
              p.penalized = true;
              p.penaltyTimer = PENALTY_DURATION;
              const defTop2 = defendsTop(p.team);
              const side = Math.random() < 0.5 ? 0.25 : 0.75;
              pendingPenalty = {
                team: p.team,
                faceoffPos: {
                  x: W * side,
                  y: defTop2 ? H * 0.2 : H * 0.8,
                },
              };
            }

            break; // one shove per frame per player
          }
        }
      }
    }

    // Crease avoidance
    if (p.role !== 'goalie') {
      const creaseR = 30 * S;
      const topDefTeam = defendsTop(0) ? 0 : 1;
      if (p.team !== topDefTeam) {
        const dc = Math.hypot(p.x - W/2, p.y);
        if (dc < creaseR) {
          const cn = norm(p.x - W/2, p.y);
          p.x = W/2 + cn.x * creaseR;
          p.y = cn.y * creaseR;
        }
      }
      if (p.team !== (1 - topDefTeam)) {
        const dc = Math.hypot(p.x - W/2, p.y - H);
        if (dc < creaseR) {
          const cn = norm(p.x - W/2, p.y - H);
          p.x = W/2 + cn.x * creaseR;
          p.y = H + cn.y * creaseR;
        }
      }
    }
  }

  // Player-player collision
  for (let i = 0; i < players.length; i++) {
    for (let j = i+1; j < players.length; j++) {
      const a = players[i], b = players[j];
      if (a.penalized || b.penalized) continue;
      if (a.pulledOff || b.pulledOff) continue;
      const d = dist(a, b);
      const minD = a.r + b.r;
      if (d < minD && d > 0) {
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        const overlap = (minD - d) / 2;
        const aIsGoalie = a.role === 'goalie';
        const bIsGoalie = b.role === 'goalie';
        if (aIsGoalie) {
          b.x += nx * overlap * 2; b.y += ny * overlap * 2;
        } else if (bIsGoalie) {
          a.x -= nx * overlap * 2; a.y -= ny * overlap * 2;
        } else {
          a.x -= nx * overlap; a.y -= ny * overlap;
          b.x += nx * overlap; b.y += ny * overlap;
        }
        if ((aIsGoalie && b.team !== a.team) || (bIsGoalie && a.team !== b.team)) {
          const pushF = 1.2;
          if (aIsGoalie) { b.vx += nx * pushF; b.vy += ny * pushF; }
          else { a.vx -= nx * pushF; a.vy -= ny * pushF; }
        } else {
          const dvx = a.vx - b.vx;
          const dvy = a.vy - b.vy;
          const dot = dvx * nx + dvy * ny;
          a.vx -= dot * nx * 0.5;
          a.vy -= dot * ny * 0.5;
          b.vx += dot * nx * 0.5;
          b.vy += dot * ny * 0.5;
        }
      }
    }
  }
}

function getDefensePenalty(shooter) {
  if (shooter.isGoalie) return 0;
  const radius = 50 * S;
  let bestDef = 0;
  for (const d of players) {
    if (d.team === shooter.team || d.role === 'goalie' || d.penalized) continue;
    if (dist(shooter, d) < radius) {
      const def = getPlayerStat(d, 'defense');
      if (def > bestDef) bestDef = def;
    }
  }
  // Shooter's shot skill reduces effective defense:
  // shot 1-3 → 0, 4-5 → 1, 6-7 → 2, 8-9 → 3, 10 → 4
  // e.g. def=8 vs shot=7 → eff=6, 35% chance, max ±30°
  //      def=8 vs shot=10 → eff=4, 21% chance, max ±20°
  const shotStat = getPlayerStat(shooter, 'shot');
  const shotReduce = shotStat >= 10 ? 4 : shotStat >= 8 ? 3 : shotStat >= 6 ? 2 : shotStat >= 4 ? 1 : 0;
  const effective = bestDef - shotReduce;
  if (effective <= 1) return 0;
  if (Math.random() > 0.07 * (effective - 1)) return 0;
  const maxDeg = 5 * effective;
  return (Math.random() * 2 - 1) * maxDeg * (Math.PI / 180);
}

function closestOpponent(p) {
  let best = null, bestD = Infinity;
  for (const o of players) {
    if (o.team === p.team || o.penalized) continue;
    const d = dist(p, o);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

function closestToPuck(team) {
  let best = null, bestD = Infinity;
  for (const p of players) {
    if (p.team !== team || p.role === 'goalie' || p.penalized) continue;
    const d = dist(p, puck);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function passingLaneClear(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return false;
  const nx = dx / len;
  const ny = dy / len;
  for (const opp of players) {
    if (opp.team === from.team || opp.penalized) continue;
    const ox = opp.x - from.x;
    const oy = opp.y - from.y;
    const proj = ox * nx + oy * ny;
    if (proj < 20 * S || proj > len - 10 * S) continue;
    const perp = Math.abs(-ny * ox + nx * oy);
    if (perp < 25 * S) return false;
  }
  return true;
}

function getPassLead(from, teammate) {
  const d = dist(from, teammate);
  const passSpeed = clamp(d * 0.85, 100 * S, 230 * S);
  const travelTime = d / passSpeed;
  return {
    x: teammate.x + teammate.vx * travelTime,
    y: teammate.y + teammate.vy * travelTime,
  };
}

function bestPassTarget(carrier) {
  let best = null, bestScore = -Infinity;
  const attackDir = defendsTop(carrier.team) ? 1 : -1;
  for (const p of players) {
    if (p === carrier || p.team !== carrier.team || p.role === 'goalie' || p.penalized) continue;
    const d = dist(p, carrier);
    const lead = getPassLead(carrier, p);
    const ahead = (lead.y - carrier.y) * attackDir;

    let sc = 0;
    if (ahead > 0) sc += ahead * 2.0;
    else sc += ahead * 0.3;

    if (d > 50 * S && d < 150 * S) sc += 60;
    if (d < 30 * S) sc -= 80;
    if (d > 200 * S) sc -= 40;

    const nearOpp = closestOpponent(p);
    if (nearOpp) {
      const oppD = dist(p, nearOpp);
      if (oppD > 50 * S) sc += 60;
      else if (oppD > 30 * S) sc += 20;
      else if (oppD < 15 * S) sc -= 60;
    }

    if (!passingLaneClear(carrier, lead)) sc -= 120;

    if (p.role === 'fwd') sc += 25;

    if (sc > bestScore) { bestScore = sc; best = p; }
  }
  return best;
}

function bestGoaliePassTarget(goalie) {
  let best = null, bestScore = -Infinity;
  for (const p of players) {
    if (p === goalie || p.team !== goalie.team || p.role === 'goalie' || p.penalized) continue;
    const d = dist(goalie, p);
    let sc = -d * 0.5;
    if (p.role === 'def') sc += 80 * S;
    if (p.role === 'center') sc += 50 * S;
    const nearestOppToTarget = closestOpponent(p);
    if (nearestOppToTarget && dist(p, nearestOppToTarget) < 25 * S) sc -= 60 * S;
    if (sc > bestScore) { bestScore = sc; best = p; }
  }
  return best;
}

// ─── PHYSICS ────────────────────────────────────────────
function puckUpdate(dt) {
  const carrier = players.find(p => p.hasPuck);
  if (carrier) {
    const stickOffset = defendsTop(carrier.team) ? 6*S : -6*S;
    puck.x = carrier.x;
    puck.y = carrier.y + stickOffset;
    puck.vx = 0; puck.vy = 0;
  } else {
    puck.vx *= 0.995;
    puck.vy *= 0.995;
    puck.x += puck.vx * dt;
    puck.y += puck.vy * dt;

    // Wall bounce
    if (puck.x < puck.r) {
      puck.x = puck.r; puck.vx = Math.abs(puck.vx) * 0.8;
      if (Math.abs(puck.vx) > 30 * S) playSound('board');
    }
    if (puck.x > W - puck.r) {
      puck.x = W - puck.r; puck.vx = -Math.abs(puck.vx) * 0.8;
      if (Math.abs(puck.vx) > 30 * S) playSound('board');
    }

    // Goal check top
    if (puck.y < GOAL_DEPTH) {
      if (puck.x > GOAL_X && puck.x < GOAL_X + GOAL_W) {
        return defendsTop(0) ? 1 : 0;
      } else {
        if (Math.abs(puck.vy) > 30 * S) playSound('board');
        puck.y = GOAL_DEPTH; puck.vy = Math.abs(puck.vy) * 0.8;
      }
    }
    // Goal check bottom
    if (puck.y > H - GOAL_DEPTH) {
      if (puck.x > GOAL_X && puck.x < GOAL_X + GOAL_W) {
        return defendsTop(0) ? 0 : 1;
      } else {
        if (Math.abs(puck.vy) > 30 * S) playSound('board');
        puck.y = H - GOAL_DEPTH; puck.vy = -Math.abs(puck.vy) * 0.8;
      }
    }

    // Puck-player deflection
    for (const p of players) {
      if (p.pickupCooldown > 0 || p.penalized) continue;
      const d = dist(p, puck);
      if (d < p.r + puck.r && !p.hasPuck) {
        const nx = (puck.x - p.x) / d;
        const ny = (puck.y - p.y) / d;
        const pSpeed = Math.hypot(puck.vx, puck.vy);
        puck.vx = nx * pSpeed * 0.6 + p.vx * 0.3;
        puck.vy = ny * pSpeed * 0.6 + p.vy * 0.3;
        puck.x = p.x + nx * (p.r + puck.r + 1);
        puck.y = p.y + ny * (p.r + puck.r + 1);
      }
    }
  }

  // Trail
  puck.trail.push({ x: puck.x, y: puck.y });
  if (puck.trail.length > 8) puck.trail.shift();

  return -1;
}
