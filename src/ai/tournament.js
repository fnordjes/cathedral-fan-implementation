// Local tournament harness — test agents against each other quickly.
//
//   node src/ai/tournament.js <agentA> <agentB> [games] [--net src/ai/model]
//
// Agents: random | greedy | aggressive | spacious | neural
// Colours are alternated each game for fairness. Runs on the shared rule core
// (no network needed); for play THROUGH the live server use netbot.js.

import path from 'node:path';
import { playGame } from './simulate.js';
import { buildAgent } from './buildAgent.js';

async function main() {
  const args = process.argv.slice(2);
  const flags = {};
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) flags[args[i].slice(2)] = args[++i];
    else pos.push(args[i]);
  }
  const nameA = pos[0] || 'greedy';
  const nameB = pos[1] || 'random';
  const games = Number(pos[2] || 50);
  const netDir = path.resolve(process.cwd(), flags.net || 'src/ai/model');

  const agentA = await buildAgent(nameA, 1, netDir, flags);
  const agentB = await buildAgent(nameB, 2, netDir, flags);

  let aWins = 0, bWins = 0, draws = 0, marginSum = 0;
  const t0 = Date.now();
  for (let i = 0; i < games; i++) {
    const aIsLight = i % 2 === 0;
    const r = await playGame(aIsLight ? agentA : agentB, aIsLight ? agentB : agentA);
    const aColor = aIsLight ? 'light' : 'dark';
    const aScore = r.scores[aColor];
    const bScore = r.scores[aColor === 'light' ? 'dark' : 'light'];
    marginSum += bScore - aScore; // positive => A left fewer squares (better)
    if (r.winner === 'draw') draws++;
    else if (r.winner === aColor) aWins++;
    else bWins++;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n${nameA} (A) vs ${nameB} (B) — ${games} games, ${secs}s\n`);
  console.log(`  A (${nameA}) wins : ${aWins}  (${((aWins / games) * 100).toFixed(1)}%)`);
  console.log(`  B (${nameB}) wins : ${bWins}  (${((bWins / games) * 100).toFixed(1)}%)`);
  console.log(`  draws          : ${draws}`);
  console.log(`  avg score margin (A): ${(marginSum / games).toFixed(2)} squares (higher = A better)`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
