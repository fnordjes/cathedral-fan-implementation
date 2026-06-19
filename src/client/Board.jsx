import React, { useState, useEffect } from 'react';
import { pieceOrientations, PIECE_NAMES, ROSTER, pieceSize } from '../game/pieces.js';
import { canPlaceCells } from '../game/logic.js';

const PLAYER_COLOR = { 0: 'light', 1: 'dark' };
const SIZE = 10;
const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

// Small visual of a piece shape, used in the tray and orientation preview.
function PieceGlyph({ shape, color, cell = 14 }) {
  const w = Math.max(...shape.map((c) => c[0])) + 1;
  const h = Math.max(...shape.map((c) => c[1])) + 1;
  const set = new Set(shape.map(([x, y]) => `${x},${y}`));
  const rows = [];
  for (let y = 0; y < h; y++) {
    const cells = [];
    for (let x = 0; x < w; x++) {
      const on = set.has(`${x},${y}`);
      cells.push(
        <div
          key={x}
          className={`glyph-cell ${on ? 'on ' + color : 'off'}`}
          style={{ width: cell, height: cell }}
        />,
      );
    }
    rows.push(
      <div key={y} className="glyph-row">
        {cells}
      </div>,
    );
  }
  return <div className="glyph">{rows}</div>;
}

function scoreOf(stock) {
  return stock.reduce((s, p) => s + (p.size ?? pieceSize(p.id)), 0);
}

export default function CathedralBoard({
  G,
  ctx,
  moves,
  playerID,
  isActive,
  isConnected,
  matchData,
}) {
  const myColor = PLAYER_COLOR[playerID] || null; // null => spectator
  const phase = ctx.phase;
  const isCathedralPhase = phase === 'placeCathedral';

  const [selected, setSelected] = useState(null); // 'cathedral' | { id, instance }
  const [orientation, setOrientation] = useState(0);
  const [hover, setHover] = useState(null); // { x, y }

  // Auto-select the Cathedral for Light during the opening.
  useEffect(() => {
    if (isCathedralPhase && myColor === 'light') {
      setSelected('cathedral');
      setOrientation(0);
    } else if (!isCathedralPhase && selected === 'cathedral') {
      setSelected(null);
    }
  }, [isCathedralPhase, myColor]); // eslint-disable-line

  // Rotate with the R key.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'r' || e.key === 'R') setOrientation((o) => o + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selColor = selected === 'cathedral' ? 'light' : myColor || 'light';
  const selId = selected === 'cathedral' ? 'cathedral' : selected?.id;
  const orients = selId ? pieceOrientations(selId, selColor) : null;
  const oIdx = orients ? orientation % orients.length : 0;
  const shape = orients ? orients[oIdx] : null;

  let preview = [];
  let previewLegal = false;
  if (shape && hover) {
    preview = shape.map(([x, y]) => [x + hover.x, y + hover.y]);
    previewLegal = canPlaceCells(G.board, selColor, preview);
  }
  const previewSet = new Set(preview.map(([x, y]) => `${x},${y}`));
  const onBoardPreview = preview.every(([x, y]) => x >= 0 && x < SIZE && y >= 0 && y < SIZE);

  function handleCellClick(x, y) {
    if (!isActive || !selected || !shape) return;
    if (selected === 'cathedral') {
      moves.placeCathedral(oIdx, x, y);
    } else {
      moves.placePiece(selected.id, selected.instance, oIdx, x, y);
    }
    setHover(null);
  }

  function selectPiece(id) {
    if (!myColor) return;
    const inst = G.stock[myColor].find((p) => p.id === id);
    if (!inst) return;
    setSelected({ id, instance: inst.instance });
    setOrientation(0);
  }

  // ---- derived display ----
  const lightScore = scoreOf(G.stock.light);
  const darkScore = scoreOf(G.stock.dark);
  const currentColor = PLAYER_COLOR[ctx.currentPlayer];

  let turnMsg;
  if (ctx.gameover) {
    turnMsg = 'Game over';
  } else if (isCathedralPhase) {
    turnMsg = 'Light places the Cathedral';
  } else {
    turnMsg = `${currentColor === 'light' ? 'Light' : 'Dark'} to move`;
  }

  // remaining counts per piece id for my colour
  const myCounts = {};
  if (myColor) {
    for (const id of Object.keys(ROSTER)) myCounts[id] = 0;
    for (const p of G.stock[myColor]) myCounts[p.id] = (myCounts[p.id] || 0) + 1;
  }

  return (
    <div className="game">
      <div className="board-panel">
        <div className="status-line">
          <span className={`turn-pill ${ctx.gameover ? 'over' : currentColor}`}>{turnMsg}</span>
          {myColor && (
            <span className="you">
              You are <strong className={myColor}>{myColor}</strong>
            </span>
          )}
          {!myColor && <span className="you">Spectating</span>}
          <span className={`conn ${isConnected ? 'ok' : 'bad'}`}>
            {isConnected ? '● connected' : '● offline'}
          </span>
        </div>

        <div className="board-grid">
          <div className="corner" />
          {COLS.map((c) => (
            <div key={c} className="col-label">
              {c}
            </div>
          ))}
          {Array.from({ length: SIZE }).map((_, y) => (
            <React.Fragment key={y}>
              <div className="row-label">{y + 1}</div>
              {Array.from({ length: SIZE }).map((_, x) => {
                const occ = G.board.cells[y][x];
                const owner = G.board.owner[y][x];
                const key = `${x},${y}`;
                const inPreview = previewSet.has(key);
                let cls = 'cell';
                if (occ?.kind === 'building') cls += ` b-${occ.color}`;
                else if (occ?.kind === 'cathedral') cls += ' b-cathedral';
                else if (owner) cls += ` claim-${owner}`;
                if (inPreview && onBoardPreview) cls += previewLegal ? ' prev-ok' : ' prev-bad';
                return (
                  <div
                    key={x}
                    className={cls}
                    onMouseEnter={() => setHover({ x, y })}
                    onMouseLeave={() => setHover((h) => (h && h.x === x && h.y === y ? null : h))}
                    onClick={() => handleCellClick(x, y)}
                    title={`${COLS[x]}${y + 1}`}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>

        <div className="scores">
          <div className="score light">
            Light remaining: <strong>{lightScore}</strong> sq
          </div>
          <div className="score dark">
            Dark remaining: <strong>{darkScore}</strong> sq
          </div>
        </div>

        {ctx.gameover && (
          <div className="gameover">
            {ctx.gameover.draw ? (
              <strong>Draw.</strong>
            ) : (
              <strong>
                {ctx.gameover.winner === '0' ? 'Light' : 'Dark'} wins!
              </strong>
            )}
            {ctx.gameover.scores && (
              <span>
                {' '}
                (Light {ctx.gameover.scores.light} vs Dark {ctx.gameover.scores.dark} — lower wins)
              </span>
            )}
          </div>
        )}
      </div>

      <aside className="side-panel">
        {myColor ? (
          <>
            <h3>Your pieces ({myColor})</h3>
            <div className="tray">
              {Object.keys(ROSTER).map((id) => {
                const count = myCounts[id] || 0;
                const isSel = selected !== 'cathedral' && selected?.id === id;
                return (
                  <button
                    key={id}
                    className={`tray-piece ${isSel ? 'sel' : ''} ${count === 0 ? 'empty' : ''}`}
                    disabled={count === 0}
                    onClick={() => selectPiece(id)}
                    title={PIECE_NAMES[id]}
                  >
                    <PieceGlyph shape={pieceOrientations(id, myColor)[0]} color={myColor} cell={10} />
                    <span className="tray-name">{PIECE_NAMES[id]}</span>
                    <span className="tray-count">×{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="controls">
              <h4>Selected</h4>
              {shape ? (
                <div className="sel-preview">
                  <PieceGlyph shape={shape} color={selColor} cell={16} />
                  <button className="rotate" onClick={() => setOrientation((o) => o + 1)}>
                    ⟳ Rotate (R)
                  </button>
                </div>
              ) : (
                <p className="muted">Pick a piece, rotate it, then click the board.</p>
              )}
              <p className="muted small">
                Pieces rotate but cannot be flipped. Hover the board to preview; green = legal.
              </p>
            </div>
          </>
        ) : (
          <div className="controls">
            <h3>Spectator</h3>
            <p className="muted">You are watching this match. Scores update live.</p>
          </div>
        )}

        <div className="howto">
          <h4>How to win</h4>
          <p className="muted small">
            Place all your buildings inside the city while blocking your opponent. Enclose empty
            space with your buildings + the wall to claim it; trap a lone enemy piece (or the
            Cathedral) to capture it. When neither side can move, the player with fewer leftover
            squares wins.
          </p>
        </div>
      </aside>
    </div>
  );
}
