import React, { useCallback, useEffect, useRef, useState } from "react";
import { initializeGame } from "./game.js";

const initialGameState = {
  score: 0,
  hp: 3,
  highScore: 0,
  state: "ready",
};

const controlKeys = ["fire"];

function formatScore(value) {
  return String(value).padStart(6, "0");
}

function App() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const controlsRef = useRef({
    moveX: 0,
    moveY: 0,
    ...Object.fromEntries(controlKeys.map((key) => [key, false])),
  });
  const joystickPointerRef = useRef(null);
  const [gameState, setGameState] = useState(initialGameState);
  const [pressedControls, setPressedControls] = useState({});
  const [joystick, setJoystick] = useState({ x: 0, y: 0, active: false });

  const updateGameState = useCallback((nextState) => {
    setGameState(nextState);
  }, []);

  useEffect(() => {
    gameRef.current = initializeGame(
      canvasRef.current,
      updateGameState,
      () => controlsRef.current,
    );
    return () => {
      gameRef.current?.dispose();
      gameRef.current = null;
    };
  }, [updateGameState]);

  const setControl = (control, pressed) => {
    controlsRef.current[control] = pressed;
    setPressedControls((current) => ({ ...current, [control]: pressed }));
  };

  const releaseAllControls = () => {
    controlsRef.current = {
      moveX: 0,
      moveY: 0,
      ...Object.fromEntries(controlKeys.map((key) => [key, false])),
    };
    joystickPointerRef.current = null;
    setJoystick({ x: 0, y: 0, active: false });
    setPressedControls({});
  };

  const updateJoystick = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const travel = bounds.width * 0.32;
    const offsetX = event.clientX - (bounds.left + bounds.width / 2);
    const offsetY = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(offsetX, offsetY);
    const scale = Math.min(1, travel / (distance || 1));
    const x = offsetX * scale;
    const y = offsetY * scale;
    const normalizedDistance = Math.min(distance / travel, 1);
    const deadZone = 0.12;
    const intensity = normalizedDistance <= deadZone
      ? 0
      : (normalizedDistance - deadZone) / (1 - deadZone);

    controlsRef.current.moveX = distance ? (offsetX / distance) * intensity : 0;
    controlsRef.current.moveY = distance ? (offsetY / distance) * intensity : 0;
    setJoystick({ x, y, active: true });
  };

  const resetJoystick = () => {
    joystickPointerRef.current = null;
    controlsRef.current.moveX = 0;
    controlsRef.current.moveY = 0;
    setJoystick({ x: 0, y: 0, active: false });
  };

  const bindJoystick = {
    onPointerDown: (event) => {
      event.preventDefault();
      joystickPointerRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      updateJoystick(event);
    },
    onPointerMove: (event) => {
      if (joystickPointerRef.current === event.pointerId) updateJoystick(event);
    },
    onPointerUp: (event) => {
      if (joystickPointerRef.current === event.pointerId) resetJoystick();
    },
    onPointerCancel: resetJoystick,
    onLostPointerCapture: resetJoystick,
    "aria-label": "移動ジョイスティック",
  };

  const bindControl = (control) => ({
    onPointerDown: (event) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setControl(control, true);
    },
    onPointerUp: () => setControl(control, false),
    onPointerCancel: () => setControl(control, false),
    onLostPointerCapture: () => setControl(control, false),
    "aria-label": control === "fire" ? "射撃" : `移動 ${control}`,
    "aria-pressed": Boolean(pressedControls[control]),
  });

  const handleStart = () => {
    releaseAllControls();
    gameRef.current?.start();
  };

  const isGameOver = gameState.state === "gameover";
  const isOverlayVisible = gameState.state !== "playing";

  return (
    <main className="game-shell">
      <header className="game-header">
        <a className="wordmark" href="#" aria-label="STARFALL ホーム">STARFALL<span>///</span></a>
        <p className="header-note">DEEP SPACE DEFENSE · SECTOR 07</p>
      </header>

      <section className="game-frame" aria-label="STARFALL ゲーム画面">
        <div className="hud" aria-live="polite">
          <div className="hud-item">
            <span className="hud-label">SCORE</span>
            <strong>{formatScore(gameState.score)}</strong>
          </div>
          <div className="hud-item hp-display">
            <span className="hud-label">HP</span>
            <strong>{`${"♥ ".repeat(gameState.hp).trim()}${gameState.hp < 3 ? `  ${"· ".repeat(3 - gameState.hp).trim()}` : ""}`}</strong>
          </div>
          <div className="hud-item hud-right">
            <span className="hud-label">BEST</span>
            <strong>{formatScore(gameState.highScore)}</strong>
          </div>
        </div>

        <div className="game-stage">
          <div className="canvas-wrap">
            <canvas ref={canvasRef} width="480" height="720" aria-label="ゲームフィールド" />
            {isOverlayVisible && (
              <div className="screen-overlay">
                <div className="overlay-content">
                  <span className="eyebrow">A SIGNAL FROM THE VOID</span>
                  <h1>{isGameOver ? "GAME OVER" : "STARFALL"}</h1>
                  <p>{isGameOver
                    ? `SCORE  ${formatScore(gameState.score)}`
                    : "星々のあいだを駆け抜け、宙域を守り抜け。"}</p>
                  <button type="button" className="start-button" onClick={handleStart}>
                    {isGameOver ? "RETRY" : "START GAME"} <span>→</span>
                  </button>
                  {!isGameOver && (
                    <p className="control-hint">
                      MOVE <kbd>WASD</kbd> / <kbd>← ↑ ↓ →</kbd><br />
                      FIRE <kbd>SPACE</kbd> / <kbd>画面内ボタン</kbd>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="touch-controls" aria-label="画面内コントローラー">
          <div
            {...bindJoystick}
            className={`joystick${joystick.active ? " is-active" : ""}`}
            style={{
              "--stick-x": `${joystick.x}px`,
              "--stick-y": `${joystick.y}px`,
            }}
            role="group"
          >
            <span className="joystick-knob" aria-hidden="true" />
          </div>
          <button type="button" {...bindControl("fire")} className={`control-button fire-button${pressedControls.fire ? " is-pressed" : ""}`}>FIRE</button>
        </div>
      </section>

      <footer className="game-footer">
        <span>INDEPENDENT FLIGHT SYSTEM</span><span>NO SIGNAL TOO FAR</span>
      </footer>
    </main>
  );
}

export default App;
