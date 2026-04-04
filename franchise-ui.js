// ─── FRANCHISE UI ──────────────────────────────────────
function renderFranchiseScreen() {
  const el = document.getElementById('franchise-content');
  const overlay = document.getElementById('franchise-screen');
  overlay.classList.remove('hidden');

  switch (screenState) {
    case 'title': renderTitleScreen(el); break;
    case 'teamSelect': renderTeamSelect(el); break;
    case 'seasonHub': renderSeasonHub(el); break;
    case 'roster': renderRoster(el); break;
    case 'preMatch': renderPreMatch(el); break;
    case 'postMatch': renderPostMatch(el); break;
    case 'playoffBracket': renderPlayoffBracket(el); break;
    case 'seasonEnd': renderSeasonEnd(el); break;
  }
}

function renderTitleScreen(el) {
  const hasSave = !!loadFranchise();
  el.innerHTML = `
    <div class="fr-title">PIXEL HOCKEY<br>FRANCHISE</div>
    <div class="fr-subtitle">Season Mode</div>
    <div>
      <button class="fr-btn primary" onclick="screenState='teamSelect'; renderFranchiseScreen()">NEW GAME</button><br>
      <button class="fr-btn ${hasSave ? '' : 'disabled'}" onclick="continueFranchise()">CONTINUE</button>
    </div>
  `;
}

function continueFranchise() {
  const data = loadFranchise();
  if (!data) return;
  franchise = data;
  // Initialize seasonStats if missing (old saves)
  if (!franchise.seasonStats) initSeasonStats();
  screenState = 'seasonHub';
  renderFranchiseScreen();
}

function renderTeamSelect(el) {
  let btns = '';
  for (let i = 0; i < TEAMS.length; i++) {
    const t = TEAMS[i];
    btns += `<button class="fr-btn team-btn" style="color:${t.light}; border-color:${t.body}" onclick="selectTeam(${i})">${t.name}</button> `;
  }
  el.innerHTML = `
    <div class="fr-title">CHOOSE YOUR TEAM</div>
    <div style="margin: 20px 0">${btns}</div>
    <div class="fr-subtitle">You will manage this team's roster and upgrades</div>
    <button class="fr-btn" onclick="screenState='title'; renderFranchiseScreen()" style="margin-top:16px">BACK</button>
  `;
}

function selectTeam(idx) {
  createNewFranchise(idx);
  saveFranchise();
  screenState = 'seasonHub';
  renderFranchiseScreen();
}

function renderSeasonHub(el) {
  const standings = getSortedStandings();
  const totalGames = franchise.schedule.length;
  const played = franchise.schedule.filter(g => g.result).length;
  const inPlayoffs = !!franchise.playoffState;

  // Check for unspent points
  const myRoster = franchise.rosters[franchise.playerTeam];
  const hasUpgrades = myRoster.some(p => p.unspentPoints > 0);

  let standingsHtml = `<table class="fr-table"><tr><th>#</th><th>TEAM</th><th>W</th><th>L</th><th>OT</th><th>PTS</th><th>GD</th></tr>`;
  standings.forEach((s, i) => {
    const isMine = s.team === franchise.playerTeam;
    const isPlayoffLine = i === 3;
    const cls = (isMine ? ' my-team' : '') + (isPlayoffLine ? ' playoff-line' : '');
    standingsHtml += `<tr class="${cls}"><td>${i+1}</td><td>${TEAMS[s.team].name}</td><td>${s.w + s.otw}</td><td>${s.l}</td><td>${s.otl}</td><td>${s.pts}</td><td>${s.gd >= 0 ? '+' : ''}${s.gd}</td></tr>`;
  });
  standingsHtml += '</table>';

  // Recent results
  const recentGames = franchise.schedule.filter(g => g.result).slice(-4);
  let resultsHtml = '';
  for (const g of recentGames) {
    const r = g.result;
    const isMine = g.home === franchise.playerTeam || g.away === franchise.playerTeam;
    const myWin = isMine && ((g.home === franchise.playerTeam && r.home > r.away) || (g.away === franchise.playerTeam && r.away > r.home));
    const myLoss = isMine && !myWin;
    const cls = isMine ? (myWin ? 'win' : (r.ot ? 'otl' : 'loss')) : '';
    resultsHtml += `<span class="${cls}">${TEAMS[g.home].name} ${r.home} - ${r.away} ${TEAMS[g.away].name}${r.ot ? ' (OT)' : ''}</span><br>`;
  }

  let actionBtn = '';
  if (franchise.currentRound < franchise.schedule.length) {
    actionBtn = `<button class="fr-btn primary" onclick="advanceToNextRound()">NEXT</button>`;
  } else if (!franchise.playoffState) {
    actionBtn = `<button class="fr-btn primary" onclick="startPlayoffs()">PLAYOFFS</button>`;
  } else {
    actionBtn = `<button class="fr-btn primary" onclick="advancePlayoff()">PLAYOFF</button>`;
  }

  el.innerHTML = `
    <div class="fr-title">SEASON ${franchise.season}</div>
    <div class="fr-subtitle">Round ${played} / ${totalGames}</div>
    ${standingsHtml}
    ${resultsHtml ? `<div class="fr-section-title">RECENT</div><div class="fr-results">${resultsHtml}</div>` : ''}
    <div style="margin-top: 10px">
      ${actionBtn}
      <button class="fr-btn ${hasUpgrades ? 'primary' : ''}" onclick="screenState='roster'; renderFranchiseScreen()">ROSTER${hasUpgrades ? ' (!)' : ''}</button>
    </div>
  `;
}

// Pending upgrade tracking: { "rosterIdx:stat": delta, ... }
let pendingUpgrades = {};

function getPendingDelta(rosterIdx, stat) {
  return pendingUpgrades[`${rosterIdx}:${stat}`] || 0;
}

function getTotalPendingPoints(rosterIdx) {
  let total = 0;
  for (const [key, delta] of Object.entries(pendingUpgrades)) {
    if (key.startsWith(`${rosterIdx}:`)) total += delta;
  }
  return total;
}

function renderRoster(el) {
  const roster = franchise.rosters[franchise.playerTeam];
  const teamName = TEAMS[franchise.playerTeam].name;
  const roleOrder = { fwd: 0, def: 1, center: 2, goalie: 3 };
  const sortedIndices = roster.map((_, i) => i).sort((a, b) => (roleOrder[roster[a].role] ?? 9) - (roleOrder[roster[b].role] ?? 9));
  let cardsHtml = '';
  for (const ri of sortedIndices) {
    const p = roster[ri];
    const pendingSpent = getTotalPendingPoints(ri);
    const availablePoints = p.unspentPoints - pendingSpent;
    const hasPoints = availablePoints > 0;
    const statNames = p.role === 'goalie' ? STAT_NAMES_GOALIE : STAT_NAMES_SKATER;
    const xpNext = xpForNextLevel(p);
    const xpPrev = p.level > 1 ? LEVEL_THRESHOLDS[p.level - 1] : 0;
    const xpProgress = xpNext === Infinity ? 100 : ((p.xp - xpPrev) / (xpNext - xpPrev) * 100);

    let statsHtml = '';
    for (const stat of statNames) {
      const baseVal = p.stats[stat];
      const delta = getPendingDelta(ri, stat);
      const effectiveVal = baseVal + delta;
      let pips = '';
      for (let i = 1; i <= 10; i++) {
        const filled = i <= effectiveVal;
        const high = filled && effectiveVal >= 8;
        const isPending = filled && i > baseVal;
        pips += `<div class="fr-stat-pip ${filled ? 'filled' : ''} ${high ? 'high' : ''} ${isPending ? 'pending' : ''}"></div>`;
      }
      const canUpgrade = p.unspentPoints > 0;
      const downBtn = delta > 0
        ? `<button class="fr-upgrade-btn fr-downgrade-btn" onclick="doDowngrade(${ri},'${stat}')">-</button>`
        : `<span class="fr-btn-placeholder"></span>`;
      const upBtn = hasPoints && effectiveVal < 10
        ? `<button class="fr-upgrade-btn" onclick="doUpgrade(${ri},'${stat}')">+</button>`
        : (canUpgrade ? `<span class="fr-btn-placeholder"></span>` : '');
      const STAT_LABELS = { speed:'SPEED', shot:'SHOT', pass:'PASS', check:'CHECK', defense:'DEF', save:'SAVE', positioning:'POS.' };
      const label = STAT_LABELS[stat] || stat.toUpperCase();
      statsHtml += `<div class="fr-stat-row"><span class="fr-stat-label">${label}</span><div class="fr-stat-bar">${pips}</div><span class="fr-stat-val">${effectiveVal}${delta > 0 ? `<span class="fr-pending-delta">+${delta}</span>` : ''}</span>${downBtn}${upBtn}</div>`;
    }

    const showPoints = p.unspentPoints > 0;

    cardsHtml += `
      <div class="fr-roster-card ${hasPoints || pendingSpent > 0 ? 'has-points' : ''}">
        <span class="fr-player-name">${p.name}</span>
        <span class="fr-player-role">${p.role.toUpperCase()}</span>
        <span class="fr-player-level">Lv.${p.level}${showPoints ? ` (+${availablePoints})` : ''}</span>
        <div class="fr-stats">${statsHtml}</div>
        <div class="fr-xp-bar"><div class="fr-xp-fill" style="width:${xpProgress}%"></div></div>
      </div>`;
  }

  const saveButtons = hasPendingUpgrades()
    ? `<button class="fr-btn fr-save-btn" onclick="savePendingUpgrades()">SAVE</button><button class="fr-btn fr-cancel-btn" onclick="cancelPendingUpgrades()">CANCEL</button>`
    : '';

  el.innerHTML = `
    <div class="fr-title" style="color:${TEAMS[franchise.playerTeam].light}">${teamName} ROSTER</div>
    <div class="fr-scroll">${cardsHtml}</div>
    <div class="fr-roster-actions">
      <button class="fr-btn" onclick="cancelPendingUpgrades(); screenState='seasonHub'; renderFranchiseScreen()">BACK</button>
      ${saveButtons}
    </div>
  `;
}

function doUpgrade(rosterIdx, stat) {
  const p = franchise.rosters[franchise.playerTeam][rosterIdx];
  const delta = getPendingDelta(rosterIdx, stat);
  const effectiveVal = p.stats[stat] + delta;
  const availablePoints = p.unspentPoints - getTotalPendingPoints(rosterIdx);
  if (availablePoints <= 0 || effectiveVal >= 10) return;
  const key = `${rosterIdx}:${stat}`;
  pendingUpgrades[key] = delta + 1;
  renderFranchiseScreen();
}

function doDowngrade(rosterIdx, stat) {
  const delta = getPendingDelta(rosterIdx, stat);
  if (delta <= 0) return;
  const key = `${rosterIdx}:${stat}`;
  pendingUpgrades[key] = delta - 1;
  if (pendingUpgrades[key] === 0) delete pendingUpgrades[key];
  renderFranchiseScreen();
}

function hasPendingUpgrades() {
  return Object.keys(pendingUpgrades).length > 0;
}

function savePendingUpgrades() {
  for (const [key, delta] of Object.entries(pendingUpgrades)) {
    const [ri, stat] = key.split(':');
    const player = franchise.rosters[franchise.playerTeam][parseInt(ri)];
    player.stats[stat] += delta;
    player.unspentPoints -= delta;
  }
  pendingUpgrades = {};
  saveFranchise();
  renderFranchiseScreen();
}

function cancelPendingUpgrades() {
  pendingUpgrades = {};
  renderFranchiseScreen();
}

function renderPreMatch(el) {
  let homeIdx, awayIdx;
  if (franchise.playoffState && franchise._playoffMatchIdx !== undefined) {
    const ps = franchise.playoffState;
    if (franchise._playoffMatchIdx === 'final') {
      const w0 = getPlayoffWinner(ps.semi[0]);
      const w1 = getPlayoffWinner(ps.semi[1]);
      homeIdx = w0; awayIdx = w1;
    } else {
      const pairs = [[ps.teams[0], ps.teams[3]], [ps.teams[1], ps.teams[2]]];
      [homeIdx, awayIdx] = pairs[franchise._playoffMatchIdx];
    }
  } else {
    const game = franchise.schedule[franchise.currentRound];
    homeIdx = game.home; awayIdx = game.away;
  }

  const hStr = teamStrength(homeIdx).toFixed(1);
  const aStr = teamStrength(awayIdx).toFixed(1);
  const isPlayoff = !!franchise.playoffState;
  const roundLabel = isPlayoff
    ? (franchise._playoffMatchIdx === 'final' ? 'FINAL' : 'SEMIFINAL')
    : `ROUND ${franchise.currentRound + 1}`;

  // Roll random event
  const event = rollRandomEvent();
  let eventHtml = '';
  if (event) {
    event.apply();
    eventHtml = `<div class="fr-event-card">${event.text}</div>`;
  }

  el.innerHTML = `
    <div class="fr-subtitle">${roundLabel}</div>
    <div class="fr-matchup">
      <div class="fr-matchup-team" style="color:${TEAMS[homeIdx].light}">${TEAMS[homeIdx].name}<br><span style="font-size:8px;color:#888">Avg ${hStr}</span></div>
      <div class="fr-matchup-vs">vs</div>
      <div class="fr-matchup-team" style="color:${TEAMS[awayIdx].light}">${TEAMS[awayIdx].name}<br><span style="font-size:8px;color:#888">Avg ${aStr}</span></div>
    </div>
    ${eventHtml}
    <button class="fr-btn primary" onclick="launchMatch(${homeIdx}, ${awayIdx})">START MATCH</button>
    <button class="fr-btn" onclick="screenState='roster'; renderFranchiseScreen()">ROSTER</button>
  `;
}

function launchMatch(homeIdx, awayIdx) {
  applyTempBoosts();
  startMatch(homeIdx, awayIdx);
}

function renderPostMatch(el) {
  if (!matchStats) { screenState = 'seasonHub'; renderFranchiseScreen(); return; }

  const lastGameIdx = franchise.currentRound - 1;
  const game = franchise.schedule[lastGameIdx];
  if (!game || !game.result) { screenState = 'seasonHub'; renderFranchiseScreen(); return; }
  const r = game.result;

  let playersHtml = '';
  for (let slot = 0; slot < 2; slot++) {
    const teamIdx = activeTeams[slot];
    const teamColor = TEAMS[teamIdx].light;
    playersHtml += `<div class="fr-section-title" style="color:${teamColor}">${TEAMS[teamIdx].name}</div>`;
    for (let ri = 0; ri < 6; ri++) {
      const pi = slot * 6 + ri;
      const ms = matchStats[pi];
      const rp = franchise.rosters[teamIdx][ri];
      let icons = '';
      for (let g = 0; g < ms.goals; g++) icons += 'G ';
      for (let a = 0; a < ms.assists; a++) icons += 'A ';
      for (let c = 0; c < ms.bodyChecks; c++) icons += 'H ';
      const totalXp = 20 + (activeTeams[slot === 0 ? 0 : 1] === (r.home > r.away ? game.home : game.away) ? 20 : 5) + ms.goals * 30 + ms.assists * 20 + ms.bodyChecks * 10;
      playersHtml += `<div class="fr-post-player">${rp.name} <span style="color:${teamColor}">${rp.role.toUpperCase()}</span> ${icons ? icons : ''}<span class="xp">+${totalXp} XP</span></div>`;
    }
  }

  revertTempBoosts();

  el.innerHTML = `
    <div class="fr-title">${TEAMS[game.home].name} ${r.home} - ${r.away} ${TEAMS[game.away].name}</div>
    <div class="fr-subtitle">${r.ot ? 'OVERTIME' : 'FINAL'}</div>
    <div class="fr-scroll">${playersHtml}</div>
    <button class="fr-btn primary" onclick="screenState='seasonHub'; renderFranchiseScreen()" style="margin-top:10px">CONTINUE</button>
  `;
  matchStats = null;
}

function renderPlayoffBracket(el) {
  const ps = franchise.playoffState;
  if (!ps) { screenState = 'seasonHub'; renderFranchiseScreen(); return; }

  const pairs = [[ps.teams[0], ps.teams[3]], [ps.teams[1], ps.teams[2]]];

  let semiHtml = '';
  for (let i = 0; i < 2; i++) {
    const [a, b] = pairs[i];
    const result = ps.semi[i];
    if (result) {
      const winner = getPlayoffWinner(result);
      semiHtml += `<div class="fr-bracket-game"><span class="${winner === a ? 'fr-bracket-winner' : ''}">${TEAMS[a].name} ${result.home}</span> - <span class="${winner === b ? 'fr-bracket-winner' : ''}">${result.away} ${TEAMS[b].name}</span>${result.ot ? ' OT' : ''}</div>`;
    } else {
      semiHtml += `<div class="fr-bracket-game">${TEAMS[a].name} vs ${TEAMS[b].name}</div>`;
    }
  }

  let finalHtml = '';
  if (ps.stage === 'final' || ps.stage === 'done') {
    const w0 = getPlayoffWinner(ps.semi[0]);
    const w1 = getPlayoffWinner(ps.semi[1]);
    if (ps.final) {
      const fWinner = getPlayoffWinner(ps.final);
      finalHtml = `<div class="fr-bracket-game"><span class="${fWinner === (ps.final.homeTeam||w0) ? 'fr-bracket-winner' : ''}">${TEAMS[ps.final.homeTeam||w0].name} ${ps.final.home}</span> - <span class="${fWinner === (ps.final.awayTeam||w1) ? 'fr-bracket-winner' : ''}">${ps.final.away} ${TEAMS[ps.final.awayTeam||w1].name}</span>${ps.final.ot ? ' OT' : ''}</div>`;
    } else {
      finalHtml = `<div class="fr-bracket-game">${TEAMS[w0].name} vs ${TEAMS[w1].name}</div>`;
    }
  }

  let actionBtn = '';
  if (ps.stage === 'done') {
    actionBtn = `<button class="fr-btn primary" onclick="screenState='seasonEnd'; renderFranchiseScreen()">RESULTS</button>`;
  } else {
    actionBtn = `<button class="fr-btn primary" onclick="advancePlayoff()">NEXT GAME</button>`;
  }

  el.innerHTML = `
    <div class="fr-title">PLAYOFFS</div>
    <div class="fr-bracket">
      <div class="fr-section-title">SEMIFINALS</div>
      <div class="fr-bracket-round">${semiHtml}</div>
      <div class="fr-section-title">FINAL</div>
      <div class="fr-bracket-round">${finalHtml || '<div class="fr-bracket-game">TBD vs TBD</div>'}</div>
    </div>
    ${actionBtn}
  `;
}

function renderSeasonEnd(el) {
  const ps = franchise.playoffState;
  const champion = ps ? ps.champion : null;

  // Find MVP (most goals+assists across season)
  let mvp = null, mvpScore = -1;
  for (let t = 0; t < TEAMS.length; t++) {
    if (!franchise.seasonStats[t]) continue;
    franchise.seasonStats[t].forEach((ss, ri) => {
      const sc = ss.goals * 2 + ss.assists;
      if (sc > mvpScore) {
        mvpScore = sc;
        mvp = { team: t, idx: ri, goals: ss.goals, assists: ss.assists, name: franchise.rosters[t][ri].name };
      }
    });
  }

  // Find top scorer
  let topScorer = null, topGoals = -1;
  for (let t = 0; t < TEAMS.length; t++) {
    if (!franchise.seasonStats[t]) continue;
    franchise.seasonStats[t].forEach((ss, ri) => {
      if (ss.goals > topGoals) {
        topGoals = ss.goals;
        topScorer = { team: t, name: franchise.rosters[t][ri].name, goals: ss.goals };
      }
    });
  }

  el.innerHTML = `
    <div class="fr-title">${champion !== null ? `${TEAMS[champion].name} WINS!` : 'SEASON OVER'}</div>
    <div class="fr-subtitle">Season ${franchise.season} Complete</div>
    ${champion !== null ? `<div style="font-size:24px; margin:10px 0; color:${TEAMS[champion].light}">CHAMPION</div>` : ''}
    ${mvp ? `<div class="fr-event-card">MVP: ${mvp.name} (${TEAMS[mvp.team].name})<br>${mvp.goals} G, ${mvp.assists} A</div>` : ''}
    ${topScorer ? `<div class="fr-event-card">Top Scorer: ${topScorer.name} (${TEAMS[topScorer.team].name})<br>${topScorer.goals} Goals</div>` : ''}
    <button class="fr-btn primary" onclick="startNextSeason()" style="margin-top:16px">NEXT SEASON</button>
  `;
}

function startNextSeason() {
  franchise.season++;
  franchise.playoffState = null;
  franchise._playoffMatchIdx = undefined;
  generateSchedule();
  initStandings();
  initSeasonStats();
  saveFranchise();
  screenState = 'seasonHub';
  renderFranchiseScreen();
}
