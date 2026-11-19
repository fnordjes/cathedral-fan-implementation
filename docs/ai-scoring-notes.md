# Notes: a better scoring formula for the AI

Status: ideas, not implemented. Collected 2026-11-18 after two human-vs-Claude
games, which showed which moves decide a game and why the current agents miss
them.

## The current formula and its limit

`evaluate()` in `src/ai/features.js` (used by greedy, and as priors and
pruning for `mcts-r`) scores a position from one side's view as:

    placed * (oppRemaining - myRemaining)
      + territory * (myTerritory - oppTerritory)
      - oppSpace * (empty squares the opponent may still use)

It counts squares, not shapes, and looks at the position only after one move.
Early on it rates ~190 opening moves equally (every 5-square placement scores
the same), and it cannot see any of the three things below. Because `mcts-r`
prunes to the formula's top 5 moves (`topK`), a better formula raises the
ceiling for every agent, not just greedy. More simulations did not help much
(+1–2.5 squares per game going from 80 to 800 sims), which points at the
formula as the bottleneck.

## 1. Shape fit: can each remaining piece still be placed?

What decided game 1: one Manor on B2 took the last square that Light's Square
could use and broke up the last area big enough for its Abbey. Light ended
with exactly those 8 squares unplaced. The formula saw "4 squares placed", not
"opponent just lost 8 squares of future placements".

Idea: for each side, sum the sizes of remaining pieces that have **no legal
placement** (or no placement outside the opponent's territory). These squares
are effectively already lost.

- `stuck(color) = sum(size of piece p in stock[color] if no legal placement)`
- Reward `stuck(opp) - stuck(me)`, weighted close to `placed` (stuck squares
  count against the final score just like unplaced ones).
- Cheap version: check one instance per piece id with `hasLegalMove`-style
  early exit (`enumeratePlacements(...).next()`).
- Refinement: a piece that only fits in contested neutral space is at risk;
  one that fits in own territory is safe.

## 2. One-move capture threats (both directions)

What decided game 2: Dark's Academy captured Light's Infirmary on Dark's
second move. Later, a Dark Tavern on G3 would have captured Light's Castle,
and a Dark Stable on A4–B4 would have captured Light's Academy. Claude only
caught these with a script that tried every opponent reply.

The greedy agent sees a capture only when its own move makes one. It does not
see that its move leaves a piece where the opponent's **next** move captures it.

Idea: after a candidate move, look for opponent replies that capture.

- Exact but costly: run the opponent's `buildingMoves` + `resolveTerritory`
  (~hundreds of replies). Fine for the final ranking of the top few moves
  (e.g. inside `topK` pruning), too slow for every node.
- Cheaper proxy: for each own piece, check whether its open component
  (from the opponent's view) is "one cell from sealed": small, contains no
  other piece of ours, and has a boundary gap of 1–3 cells. The size of a
  captured piece (5 squares back into stock) plus the territory the opponent
  gains is the penalty.
- Same check the other way round = attacking chances: opponent pieces that a
  single move of ours could capture.

## 3. Usable territory, not raw territory

Territory only helps if remaining pieces fit into it. In game 1 Dark's 8-square
pocket was worth exactly 8 because Abbey + Bridge + Tavern filled it; a
5-square pocket shaped so that only Taverns fit is worth much less.

Idea: value territory as `min(territory squares, squares of own remaining pieces
that fit inside it)`, ideally per pocket and per shape (a small packing check:
pockets are small, stocks are small). Territory beyond what you can fill is
worth ~0; territory that absorbs pieces with no other legal spot is worth the
most.

## 4. Smaller observations

- **Sealing potential:** moves that leave a pocket one placement away from
  closing (e.g. a 6-square pocket needing a 2-cell wall) are strong, but only
  if the opponent cannot cheaply block or drop two pieces inside. Worth a
  small bonus; risky to overweight.
- **Pieces touching each other are safe:** a piece connected to another own
  piece cannot be captured alone (a pocket with 2+ pieces is not captured).
  Isolated pieces near the opponent's walls are the ones at risk.
- **The Cathedral blocks capture tricks:** a pocket that touches the Cathedral
  contains it, so an opponent piece next to the Cathedral can rarely be
  captured (seen when Dark's Manor sat at F3 next to it).
- **Cathedral placement is random** for every agent today (`act()` returns
  `rng.pick(moves)` in the opening). Light's only compensation for moving
  second is wasted; see the colour data below.

## Colour balance: Dark has a clear edge

Self-play with the same agent on both sides (2026-11-18):

| Self-play | Dark wins | Light wins | Draws | Dark's avg lead |
|---|---|---|---|---|
| greedy (200 games) | 62% | 30% | 17 | +2.4 squares |
| mcts-r (60 games) | 60% | 22% | 11 | +2.4 squares |
| random (400 games) | 53% | 32% | 61 | +1.1 squares |

Dark places the first building; Light only gets to place the Cathedral, and
the agents place it randomly. Open question: how much of the gap a deliberate
Cathedral placement recovers. Worth measuring before and after giving the
opening a real policy (e.g. evaluate candidate Cathedral spots by self-play).
Also relevant for measurements: always alternate colours (the tournament
harness already does).

## Experiment: a hand-written value network (2026-11-19)

Inspired by "weight-space programming" (an LLM reading and writing network
weights directly, without gradients). `src/ai/handwritten.js` writes every
weight of the existing value-net architecture (602 -> 256 -> 128 -> 64 -> 1)
by hand; `test/handwritten.test.js` checks the network computes the intended
formula exactly (max deviation < 1e-4 on 368 positions).

- Greedy's evaluation is linear in the net's input, so it can be written into
  the weights exactly (a signed value passes through ReLU layers as the pair
  relu(x), relu(-x)). This control plays at greedy's level: 31-24-5, +1.7
  squares over 60 games. The gradient-trained net in `src/ai/model` loses to
  greedy 2-17.
- Added nonlinear feature: one first-layer unit per 2x2 window that fires
  only when all four cells are usable (relu(sum - 3)), counted for both sides.
  It did not help: alpha 0.1 +1.6, 0.3 +0.6, 1.0 +0.2 squares vs greedy.
- **Main finding: the input encoding is the bottleneck.** The net only sees
  each side's remaining square *count*, not which pieces remain, so it cannot
  compute "the opponent's Square no longer fits", the idea that decided the
  human-vs-Claude games (section 1). Next step for this line: add per-piece
  stock (and maybe "piece has a legal spot") to `encode()`; hand-written units
  can then implement section 1 directly.

### Follow-up: extended input (v2) with a shape-fit term

`encodeV2()` in `features.js` adds, per side and piece type, the count left and
whether it still has a legal placement (646 inputs). `neuralNet.js` picks the
encoder from the model's input size, so the trained v1 model still loads. The
hand-written v2 net (`--v2 1 --beta B`) adds `beta * (stuck_opp - stuck_me)`,
where stuck = squares of pieces with no legal placement, via one ReLU unit per
side and piece type: relu(count - 2*fits).

| v2 vs greedy (60 games) | W-L-D | Avg margin |
|---|---|---|
| beta 0 (control, = v1) | 31-24-5 | +1.72 |
| beta 0.5 | 37-18-5 | +0.73 |
| beta 1 | 31-27-2 | -0.42 |
| beta 2 | 38-22-0 | +0.82 |

No measurable gain, and ~50% slower. Likely reason: the term only rewards a
move that makes an opponent piece unplaceable *immediately*; what decided the
human games was steering toward that over several moves, which a 1-ply agent
cannot do. Next candidate: use the shape-fit term inside `mcts-r`'s heuristic
(search can plan toward it), watching the extra cost per expansion.

## How to measure changes

What worked for the `topK` change (commit aee3019):

- Head-to-head vs the current agent, alternating colours, at least 60 games
  per setting with fresh seeds; plus a control run (same settings both sides,
  should be roughly even) to see the noise level. 20 games was misleading
  more than once.
- Also check vs greedy over 60 games, since a change can beat the previous
  version without beating greedy by more.
- Track average score margin, not just wins: it is less noisy.
- Watch time per move: the browser opponent needs to stay around a second.
