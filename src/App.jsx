import React, { useCallback, useEffect, useRef, useState } from "react";
import { initializeGame } from "./game.js";

const initialGameState = {
  score: 0,
  hp: 3,
  highScore: 0,
  state: "ready",
};

const initialNetworkState = {
  status: "connecting",
  roomCode: "",
  player: 0,
  playerCount: 0,
  error: "",
};

const controlKeys = ["fire"];

function formatScore(value) {
  return String(value).padStart(6, "0");
}

function App() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const networkRef = useRef(null);
  const networkPlayerRef = useRef(0);
  const controlsRef = useRef({
    moveX: 0,
    moveY: 0,
    ...Object.fromEntries(controlKeys.map((key) => [key, false])),
  });
  const joystickPointerRef = useRef(null);
  const [gameState, setGameState] = useState(initialGameState);
  const [pressedControls, setPressedControls] = useState({});
  const [joystick, setJoystick] = useState({ x: 0, y: 0, active: false });
  const [networkState, setNetworkState] = useState(initialNetworkState);
  const [roomCodeInput, setRoomCodeInput] = useState("");

  const updateGameState = useCallback((nextState) => {
    setGameState(nextState);
  }, []);

  const sendNetwork = useCallback((message) => {
    if (networkRef.current?.readyState === WebSocket.OPEN) {
      networkRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    gameRef.current = initializeGame(
      canvasRef.current,
      updateGameState,
      () => controlsRef.current,
      sendNetwork,
    );
    return () => {
      gameRef.current?.dispose();
      gameRef.current = null;
    };
  }, [sendNetwork, updateGameState]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    networkRef.current = socket;

    socket.addEventListener("open", () => {
      setNetworkState((current) => ({
        ...current,
        status: current.roomCode ? current.status : "connected",
      }));
    });
    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        setNetworkState((current) => ({ ...current, error: "サーバーから不正な応答を受信しました。" }));
        return;
      }

      if (message.type === "joined") {
        networkPlayerRef.current = message.player;
        setNetworkState({
          status: message.playerCount === 2 ? "ready" : "waiting",
          roomCode: message.roomCode,
          player: message.player,
          playerCount: message.playerCount,
          error: "",
        });
      } else if (message.type === "room-state") {
        setNetworkState((current) => ({
          ...current,
          status: message.started ? "playing" : message.playerCount === 2 ? "ready" : "waiting",
          roomCode: message.roomCode,
          playerCount: message.playerCount,
          error: "",
        }));
      } else if (message.type === "peer-input") {
        gameRef.current?.setRemoteInput(message.input);
      } else if (message.type === "game-start") {
        setNetworkState((current) => ({ ...current, status: "playing", error: "" }));
        gameRef.current?.start(true, networkPlayerRef.current);
      } else if (message.type === "game-snapshot") {
        gameRef.current?.applySnapshot(message.snapshot);
      } else if (message.type === "game-over") {
        setNetworkState((current) => ({ ...current, status: "ready" }));
      } else if (message.type === "peer-left") {
        if (message.reason === "guest-disconnected") {
          gameRef.current?.end();
          setNetworkState((current) => ({
            ...current,
            status: "waiting",
            playerCount: 1,
            error: "相手がルームから退出しました。",
          }));
        } else {
          networkPlayerRef.current = 0;
          gameRef.current?.end();
          setNetworkState({ ...initialNetworkState, status: "connected" });
          if (message.reason === "host-disconnected") {
            setNetworkState((current) => ({ ...current, error: "ホストとの接続が切れました。" }));
          }
        }
      } else if (message.type === "error") {
        setNetworkState((current) => ({ ...current, error: message.message }));
      }
    });
    socket.addEventListener("error", () => {
      if (networkRef.current === socket) {
        setNetworkState((current) => ({
          ...current,
          status: "disconnected",
          error: "オンラインサーバーに接続できません。",
        }));
      }
    });
    socket.addEventListener("close", () => {
      if (networkRef.current === socket) {
        networkRef.current = null;
        setNetworkState((current) => ({
          ...current,
          status: "disconnected",
          error: "オンラインサーバーとの接続が切れました。",
        }));
      }
    });
    return () => {
      networkRef.current = null;
      socket.close();
    };
  }, []);

  useEffect(() => {
    if (networkState.player !== 2 || networkState.status !== "playing") return undefined;
    const interval = window.setInterval(() => {
      sendNetwork({ type: "input", input: gameRef.current?.getLocalInput() });
    }, 33);
    return () => window.clearInterval(interval);
  }, [networkState.player, networkState.status, sendNetwork]);

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
    const deadZone = 0.03;
    const range = Math.max(0, (normalizedDistance - deadZone) / (1 - deadZone));
    const intensity = Math.sqrt(range);

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

  const handleCreateRoom = () => sendNetwork({ type: "create-room" });
  const handleJoinRoom = () => sendNetwork({ type: "join-room", roomCode: roomCodeInput });
  const handleStartOnlineGame = () => sendNetwork({ type: "start-game" });

  const isGameOver = gameState.state === "gameover";
  const isOverlayVisible = gameState.state !== "playing";

  return (
    <main className="game-shell" onContextMenu={(event) => event.preventDefault()}>
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
            <strong>{gameState.hp > 3
              ? `♥ × ${gameState.hp}`
              : `${"♥ ".repeat(gameState.hp).trim()}${gameState.hp < 3 ? `  ${"· ".repeat(3 - gameState.hp).trim()}` : ""}`}</strong>
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
                  {networkState.player === 0 && (
                    <button type="button" className="start-button" onClick={handleStart}>
                      {isGameOver ? "RETRY" : "START GAME"} <span>→</span>
                    </button>
                  )}
                  {!isGameOver && (
                    <p className="control-hint">
                      MOVE <kbd>WASD</kbd> / <kbd>← ↑ ↓ →</kbd><br />
                      FIRE <kbd>SPACE</kbd> / <kbd>画面内ボタン</kbd>
                    </p>
                  )}
                  {networkState.player === 0 ? (
                    <div className="online-lobby">
                      <span className="lobby-label">ONLINE CO-OP</span>
                      <button
                        type="button"
                        className="lobby-button"
                        onClick={handleCreateRoom}
                        disabled={networkState.status === "connecting" || networkState.status === "disconnected"}
                      >
                        ルームを作成
                      </button>
                      <div className="join-room">
                        <input
                          className="room-code-input"
                          aria-label="ルームコード"
                          autoComplete="off"
                          maxLength={5}
                          onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
                          placeholder="コード"
                          value={roomCodeInput}
                        />
                        <button
                          type="button"
                          className="lobby-button"
                          onClick={handleJoinRoom}
                          disabled={roomCodeInput.length !== 5 || networkState.status === "disconnected"}
                        >
                          参加
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="online-lobby">
                      <span className="lobby-label">ROOM {networkState.roomCode}</span>
                      <p>{networkState.player === 1
                        ? networkState.playerCount === 2 ? "相手が参加しました。" : "相手の参加を待っています…"
                        : "ホストがゲームを開始するのを待っています…"}</p>
                      {networkState.player === 1 && (
                        <button
                          type="button"
                          className="lobby-button"
                          onClick={handleStartOnlineGame}
                          disabled={networkState.playerCount !== 2
                            || (isGameOver && networkState.status !== "ready")}
                        >
                          {isGameOver ? "もう一度プレイ" : "協力プレイ開始"}
                        </button>
                      )}
                    </div>
                  )}
                  {networkState.error && <p className="network-error" role="status">{networkState.error}</p>}
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
