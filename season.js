// ─── SEASON ENGINE ─────────────────────────────────────
function generateSchedule() {
  const teams = [];
  for (let i = 0; i < TEAMS.length; i++) teams.push(i);
  const games = [];
  // Each team plays each other twice (home & away)
  for (let i = 0; i < teams.length; i++) {
    for (let j = 0; j < teams.length; j++) {
      if (i !== j) games.push({ home: teams[i], away: teams[j], result: null });
    }
  }
  // Shuffle
  for (let i = games.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [games[i], games[j]] = [games[j], games[i]];
  }
  franchise.schedule = games;
  franchise.currentRound = 0;
}

function initStandings() {
  franchise.standings = {};
  for (let i = 0; i < TEAMS.length; i++) {
    franchise.standings[i] = { w: 0, l: 0, otl: 0, otw: 0, gf: 0, ga: 0 };
  }
}

function initSeasonStats() {
  franchise.seasonStats = {};
  for (let i = 0; i < TEAMS.length; i++) {
    franchise.seasonStats[i] = franchise.rosters[i].map(() => ({ goals: 0, assists: 0 }));
  }
}

function getPoints(s) { return s.w * 3 + s.otw * 2 + s.otl * 1; }

function getSortedStandings() {
  const arr = [];
  for (let i = 0; i < TEAMS.length; i++) {
    const s = franchise.standings[i];
    arr.push({ team: i, ...s, pts: getPoints(s), gd: s.gf - s.ga });
  }
  arr.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  return arr;
}

function teamStrength(teamIdx) {
  const roster = franchise.rosters[teamIdx];
  let total = 0;
  for (const p of roster) {
    const vals = Object.values(p.stats);
    total += vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return total / roster.length;
}

function simMatch(homeIdx, awayIdx) {
  const hStr = teamStrength(homeIdx);
  const aStr = teamStrength(awayIdx);
  const diff = (hStr - aStr) * 0.4;
  let hGoals = Math.max(0, Math.round(2 + diff + (Math.random() - 0.5) * 3));
  let aGoals = Math.max(0, Math.round(2 - diff + (Math.random() - 0.5) * 3));
  let ot = false;
  if (hGoals === aGoals) {
    ot = true;
    if (Math.random() < 0.5 + diff * 0.1) hGoals++;
    else aGoals++;
  }
  return { home: hGoals, away: aGoals, ot };
}

function recordResult(homeIdx, awayIdx, hGoals, aGoals, ot) {
  const sh = franchise.standings[homeIdx];
  const sa = franchise.standings[awayIdx];
  sh.gf += hGoals; sh.ga += aGoals;
  sa.gf += aGoals; sa.ga += hGoals;
  if (hGoals > aGoals) {
    if (ot) { sh.otw++; sa.otl++; } else { sh.w++; sa.l++; }
  } else {
    if (ot) { sa.otw++; sh.otl++; } else { sa.w++; sh.l++; }
  }
}

function simXpForTeam(teamIdx, won, goalsFor) {
  const roster = franchise.rosters[teamIdx];
  for (const p of roster) {
    let xp = 20; // base
    xp += won ? 20 : 5;
    // Distribute some goal/assist xp randomly among non-goalies
    if (p.role !== 'goalie' && goalsFor > 0) {
      for (let g = 0; g < goalsFor; g++) {
        if (Math.random() < 0.35) xp += 30; // goal
        if (Math.random() < 0.35) xp += 20; // assist
      }
    }
    if (Math.random() < 0.3) xp += 10; // random body check
    addXpToPlayer(p, xp, teamIdx);
  }
}

// ─── XP & LEVELING ─────────────────────────────────────
function addXpToPlayer(player, xp, teamIdx) {
  player.xp += xp;
  const oldLevel = player.level;
  while (player.level < LEVEL_THRESHOLDS.length && player.xp >= LEVEL_THRESHOLDS[player.level]) {
    player.level++;
    if (teamIdx !== franchise.playerTeam) {
      autoAllocateStat(player);
    } else {
      player.unspentPoints++;
    }
  }
}

function autoAllocateStat(player) {
  const priority = AUTO_LEVEL_PRIORITY[player.role] || AUTO_LEVEL_PRIORITY.fwd;
  for (const stat of priority) {
    if (player.stats[stat] !== undefined && player.stats[stat] < 10) {
      player.stats[stat]++;
      return;
    }
  }
}


function xpForNextLevel(player) {
  if (player.level >= LEVEL_THRESHOLDS.length) return Infinity;
  return LEVEL_THRESHOLDS[player.level];
}

// ─── MATCH END & XP DISTRIBUTION ───────────────────────
function onMatchEnd() {
  if (!franchise || !matchStats) { screenState = 'seasonHub'; renderFranchiseScreen(); return; }

  const game = franchise.schedule[franchise.currentRound];
  const hGoals = score[0], aGoals = score[1];
  const ot = overtime;
  game.result = { home: hGoals, away: aGoals, ot };
  recordResult(game.home, game.away, hGoals, aGoals, ot);

  // Distribute XP to players from both teams
  const winnerSlot = hGoals > aGoals ? 0 : 1;
  for (let slot = 0; slot < 2; slot++) {
    const teamIdx = activeTeams[slot];
    const won = slot === winnerSlot;
    const roster = franchise.rosters[teamIdx];
    for (let ri = 0; ri < roster.length; ri++) {
      const pi = slot * 6 + ri;
      const ms = matchStats[pi];
      let xp = 20; // base
      xp += won ? 20 : 5;
      xp += ms.goals * 30;
      xp += ms.assists * 20;
      xp += ms.bodyChecks * 10;
      addXpToPlayer(roster[ri], xp, teamIdx);
      // Season stats
      if (franchise.seasonStats[teamIdx]) {
        franchise.seasonStats[teamIdx][ri].goals += ms.goals;
        franchise.seasonStats[teamIdx][ri].assists += ms.assists;
      }
    }
  }

  franchise.currentRound++;
  state = 'menu';
  screenState = 'postMatch';
  saveFranchise();
  renderFranchiseScreen();
}

// ─── ADVANCE SEASON ────────────────────────────────────
function advanceToNextRound() {
  // Sim all games until we hit one involving playerTeam or end of schedule
  while (franchise.currentRound < franchise.schedule.length) {
    const game = franchise.schedule[franchise.currentRound];
    if (game.home === franchise.playerTeam || game.away === franchise.playerTeam) {
      // Player's match — show pre-match screen
      screenState = 'preMatch';
      saveFranchise();
      renderFranchiseScreen();
      return;
    }
    // Sim this game
    const result = simMatch(game.home, game.away);
    game.result = result;
    recordResult(game.home, game.away, result.home, result.away, result.ot);
    // Sim XP for both teams
    simXpForTeam(game.home, result.home > result.away, result.home);
    simXpForTeam(game.away, result.away > result.home, result.away);
    franchise.currentRound++;
  }
  // Regular season over — go to playoffs
  startPlayoffs();
}

// ─── PLAYOFFS ──────────────────────────────────────────
function startPlayoffs() {
  const standings = getSortedStandings();
  franchise.playoffState = {
    teams: standings.slice(0, 4).map(s => s.team),
    semi: [null, null], // results
    final: null,
    champion: null,
    stage: 'semi', // semi, final, done
  };
  screenState = 'playoffBracket';
  saveFranchise();
  renderFranchiseScreen();
}

function advancePlayoff() {
  const ps = franchise.playoffState;
  if (ps.stage === 'semi') {
    // Play/sim semi-finals: #1 vs #4, #2 vs #3
    const pairs = [[ps.teams[0], ps.teams[3]], [ps.teams[1], ps.teams[2]]];
    for (let i = 0; i < 2; i++) {
      if (ps.semi[i]) continue; // already played
      const [a, b] = pairs[i];
      if (a === franchise.playerTeam || b === franchise.playerTeam) {
        // Player must play this
        screenState = 'preMatch';
        franchise._playoffMatchIdx = i;
        saveFranchise();
        renderFranchiseScreen();
        return;
      }
      const result = simMatch(a, b);
      ps.semi[i] = { home: a, away: b, ...result };
      simXpForTeam(a, result.home > result.away, result.home);
      simXpForTeam(b, result.away > result.home, result.away);
    }
    // Both semis done
    ps.stage = 'final';
    screenState = 'playoffBracket';
    saveFranchise();
    renderFranchiseScreen();
  } else if (ps.stage === 'final') {
    const w0 = ps.semi[0].home > ps.semi[0].away ? ps.semi[0].home : ps.semi[0].away;
    const w1 = ps.semi[1].home > ps.semi[1].away ? ps.semi[1].home : ps.semi[1].away;
    if (w0 === franchise.playerTeam || w1 === franchise.playerTeam) {
      screenState = 'preMatch';
      franchise._playoffMatchIdx = 'final';
      saveFranchise();
      renderFranchiseScreen();
      return;
    }
    const result = simMatch(w0, w1);
    ps.final = { home: w0, away: w1, ...result };
    ps.champion = result.home > result.away ? w0 : w1;
    ps.stage = 'done';
    simXpForTeam(w0, result.home > result.away, result.home);
    simXpForTeam(w1, result.away > result.home, result.away);
    screenState = 'seasonEnd';
    saveFranchise();
    renderFranchiseScreen();
  }
}

function onPlayoffMatchEnd() {
  const ps = franchise.playoffState;
  const hGoals = score[0], aGoals = score[1];
  const ot = overtime;

  // Distribute XP
  const winnerSlot = hGoals > aGoals ? 0 : 1;
  for (let slot = 0; slot < 2; slot++) {
    const teamIdx = activeTeams[slot];
    const won = slot === winnerSlot;
    const roster = franchise.rosters[teamIdx];
    for (let ri = 0; ri < roster.length; ri++) {
      const pi = slot * 6 + ri;
      const ms = matchStats[pi];
      let xp = 25;
      xp += won ? 30 : 5;
      xp += ms.goals * 30;
      xp += ms.assists * 20;
      xp += ms.bodyChecks * 10;
      addXpToPlayer(roster[ri], xp, teamIdx);
      if (franchise.seasonStats[teamIdx]) {
        franchise.seasonStats[teamIdx][ri].goals += ms.goals;
        franchise.seasonStats[teamIdx][ri].assists += ms.assists;
      }
    }
  }

  if (franchise._playoffMatchIdx === 'final') {
    ps.final = { home: activeTeams[0], away: activeTeams[1], home: hGoals, away: aGoals, ot };
    // Fix: store teams and scores properly
    ps.final = { homeTeam: activeTeams[0], awayTeam: activeTeams[1], home: hGoals, away: aGoals, ot };
    ps.champion = hGoals > aGoals ? activeTeams[0] : activeTeams[1];
    ps.stage = 'done';
    state = 'menu';
    screenState = 'seasonEnd';
  } else {
    const idx = franchise._playoffMatchIdx;
    ps.semi[idx] = { home: activeTeams[0], away: activeTeams[1], homeGoals: hGoals, awayGoals: aGoals, ot };
    // Determine which format to use consistently
    ps.semi[idx] = { homeTeam: activeTeams[0], awayTeam: activeTeams[1], home: hGoals, away: aGoals, ot };
    state = 'menu';
    // Check if both semis done
    if (ps.semi[0] && ps.semi[1]) {
      ps.stage = 'final';
    }
    screenState = 'playoffBracket';
  }

  delete franchise._playoffMatchIdx;
  saveFranchise();
  renderFranchiseScreen();
}

function getPlayoffWinner(game) {
  if (!game) return null;
  return game.home > game.away ? game.homeTeam : game.awayTeam;
}

// ─── RANDOM EVENTS ─────────────────────────────────────
function rollRandomEvent() {
  if (Math.random() > 0.3) return null;
  const roster = franchise.rosters[franchise.playerTeam];
  const pi = Math.floor(Math.random() * roster.length);
  const player = roster[pi];
  const STAT_LABELS = { speed:'SPEED', shot:'SHOT', pass:'PASS', check:'CHECK', defense:'DEF', save:'SAVE', positioning:'POS.' };
  const hotEligible = Object.keys(player.stats).filter(s => player.stats[s] <= 8);
  const hotStat = hotEligible.length > 0 ? hotEligible[Math.floor(Math.random() * hotEligible.length)] : null;
  const coldStat = randomStat(player);
  const events = [
    ...(hotStat ? [{ type: 'hot', text: `${player.name} is on a HOT STREAK!\n+2 ${STAT_LABELS[hotStat] || hotStat.toUpperCase()} this match`, apply: () => { player._tempBoost = { stat: hotStat, amount: 2 }; } }] : []),
    { type: 'cold', text: `${player.name} is in a cold spell...\n-2 ${STAT_LABELS[coldStat] || coldStat.toUpperCase()} this match`, apply: () => { player._tempBoost = { stat: coldStat, amount: -2 }; } },
    { type: 'practice', text: `${player.name} had a great practice! +15 XP`, apply: () => { addXpToPlayer(player, 15, franchise.playerTeam); } },
  ];
  return events[Math.floor(Math.random() * events.length)];
}

function randomStat(player) {
  const stats = Object.keys(player.stats);
  return stats[Math.floor(Math.random() * stats.length)];
}

function applyTempBoosts() {
  const roster = franchise.rosters[franchise.playerTeam];
  for (const p of roster) {
    if (p._tempBoost) {
      p.stats[p._tempBoost.stat] = clamp(p.stats[p._tempBoost.stat] + p._tempBoost.amount, 1, 10);
      p._tempRevert = { stat: p._tempBoost.stat, amount: -p._tempBoost.amount };
      delete p._tempBoost;
    }
  }
}

function revertTempBoosts() {
  const roster = franchise.rosters[franchise.playerTeam];
  for (const p of roster) {
    if (p._tempRevert) {
      p.stats[p._tempRevert.stat] = clamp(p.stats[p._tempRevert.stat] + p._tempRevert.amount, 1, 10);
      delete p._tempRevert;
    }
  }
}

// ─── PERSISTENCE ───────────────────────────────────────
function saveFranchise() {
  if (!franchise) return;
  localStorage.setItem('pixelHockeyFranchise', JSON.stringify(franchise));
}

function loadFranchise() {
  try {
    const data = localStorage.getItem('pixelHockeyFranchise');
    if (!data) return null;
    return JSON.parse(data);
  } catch (e) { return null; }
}

function deleteSave() {
  localStorage.removeItem('pixelHockeyFranchise');
}
