"use strict";

let context;
let GAME_WIDTH = 480;
const GAME_HEIGHT = 720;

class InputHandler {
  constructor(getControls) {
    this.keys = new Set();
    this.getControls = getControls;
    this.onKeyDown = (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
        event.preventDefault();
      }
      this.keys.add(event.key.toLowerCase());
    };
    this.onKeyUp = (event) => this.keys.delete(event.key.toLowerCase());
    this.onBlur = () => this.clear();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  isDown(...keyNames) {
    const controls = this.getControls();
    const controlAliases = {
      arrowup: "up",
      arrowdown: "down",
      arrowleft: "left",
      arrowright: "right",
      " ": "fire",
    };
    return keyNames.some((keyName) => this.keys.has(keyName)
      || Boolean(controls[controlAliases[keyName]]));
  }

  getMovement() {
    const controls = this.getControls();
    const horizontal = (controls.moveX || 0)
      + Number(this.keys.has("d")) - Number(this.keys.has("a"))
      + Number(this.keys.has("arrowright")) - Number(this.keys.has("arrowleft"));
    const vertical = (controls.moveY || 0)
      + Number(this.keys.has("s")) - Number(this.keys.has("w"))
      + Number(this.keys.has("arrowdown")) - Number(this.keys.has("arrowup"));
    const magnitude = Math.hypot(horizontal, vertical);
    const scale = magnitude > 1 ? 1 / magnitude : 1;
    return { horizontal: horizontal * scale, vertical: vertical * scale };
  }

  clear() {
    this.keys.clear();
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.clear();
  }
}

class Player {
  constructor(x = (GAME_WIDTH - 34) / 2, color = "#92f5f4") {
    this.width = 34;
    this.height = 42;
    this.speed = 480;
    this.velocityX = 0;
    this.velocityY = 0;
    this.x = x;
    this.y = GAME_HEIGHT - 92;
    this.fireCooldown = 0;
    this.invulnerableTime = 0;
    this.color = color;
  }

  update(deltaTime, input, bullets, movement = input.getMovement(), firing = input.isDown(" ")) {
    const { horizontal, vertical } = movement;
    const inputResponse = 1 - Math.exp(-16 * deltaTime);
    this.velocityX += (horizontal * this.speed - this.velocityX) * inputResponse;
    this.velocityY += (vertical * this.speed - this.velocityY) * inputResponse;
    this.x += this.velocityX * deltaTime;
    this.y += this.velocityY * deltaTime;
    this.x = Math.max(0, Math.min(GAME_WIDTH - this.width, this.x));
    this.y = Math.max(70, Math.min(GAME_HEIGHT - this.height - 12, this.y));
    if ((this.x === 0 && this.velocityX < 0)
      || (this.x === GAME_WIDTH - this.width && this.velocityX > 0)) {
      this.velocityX = 0;
    }
    if ((this.y === 70 && this.velocityY < 0)
      || (this.y === GAME_HEIGHT - this.height - 12 && this.velocityY > 0)) {
      this.velocityY = 0;
    }
    this.fireCooldown -= deltaTime;
    this.invulnerableTime = Math.max(0, this.invulnerableTime - deltaTime);
    if (firing && this.fireCooldown <= 0) {
      bullets.push(new Bullet(this.x + this.width / 2, this.y + 4, -520, "player"));
      this.fireCooldown = 0.19;
    }
  }

  takeDamage() {
    if (this.invulnerableTime > 0) return false;
    this.invulnerableTime = 1.25;
    return true;
  }

  draw() {
    if (this.invulnerableTime > 0 && Math.floor(this.invulnerableTime * 14) % 2 === 0) return;
    const center = this.x + this.width / 2;
    context.save();
    context.shadowColor = this.color;
    context.shadowBlur = 18;
    context.fillStyle = this.color;
    context.beginPath();
    context.moveTo(center, this.y);
    context.lineTo(this.x + this.width, this.y + this.height - 3);
    context.lineTo(center, this.y + this.height - 12);
    context.lineTo(this.x, this.y + this.height - 3);
    context.closePath();
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = "#253f68";
    context.beginPath();
    context.moveTo(center, this.y + 12);
    context.lineTo(center + 5, this.y + 28);
    context.lineTo(center - 5, this.y + 28);
    context.closePath();
    context.fill();
    context.fillStyle = "#ffb66e";
    context.beginPath();
    context.moveTo(center - 5, this.y + this.height - 5);
    context.lineTo(center, this.y + this.height + 6 + Math.random() * 5);
    context.lineTo(center + 5, this.y + this.height - 5);
    context.fill();
    context.restore();
  }
}

class Bullet {
  constructor(x, y, velocityY, owner, velocityX = 0) {
    this.x = x;
    this.y = y;
    this.velocityX = velocityX;
    this.velocityY = velocityY;
    this.owner = owner;
    this.radius = owner === "player" ? 3 : 4;
  }

  update(deltaTime) {
    this.x += this.velocityX * deltaTime;
    this.y += this.velocityY * deltaTime;
  }

  draw() {
    context.save();
    context.shadowColor = this.owner === "player" ? "#72f4f3" : "#ff6e91";
    context.shadowBlur = 12;
    context.fillStyle = this.owner === "player" ? "#c5ffff" : "#ff7898";
    context.beginPath();
    context.ellipse(this.x, this.y, this.radius, this.radius * 2, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

const ENEMY_TYPES = {
  scout: { width: 30, height: 31, hp: 1, score: 100, color: "#ff829a", speed: 95 },
  striker: { width: 38, height: 36, hp: 2, score: 200, color: "#ffc076", speed: 78 },
  ace: { width: 52, height: 44, hp: 5, score: 500, color: "#bf9aff", speed: 44 },
  boss: { width: 126, height: 88, hp: 80, score: 3000, color: "#ff547a", speed: 42 },
};

class Enemy {
  constructor(type, x, difficulty) {
    const settings = ENEMY_TYPES[type];
    this.type = type;
    this.width = settings.width;
    this.height = settings.height;
    this.hp = settings.hp;
    this.maxHp = settings.hp;
    this.score = settings.score;
    this.color = settings.color;
    this.x = Math.max(12, Math.min(GAME_WIDTH - this.width - 12, x - this.width / 2));
    this.y = -this.height;
    this.speed = settings.speed + difficulty * (type === "ace" ? 7 : 17);
    this.phase = Math.random() * Math.PI * 2;
    this.originX = this.x;
    this.fireCooldown = 1.1 + Math.random() * 1.1;
  }

  update(deltaTime, difficulty, player, bullets) {
    if (this.type === "boss") {
      this.y = Math.min(54, this.y + this.speed * deltaTime);
      this.phase += deltaTime * 0.8;
      this.x = Math.max(12, Math.min(
        GAME_WIDTH - this.width - 12,
        GAME_WIDTH / 2 - this.width / 2 + Math.sin(this.phase) * Math.max(0, (GAME_WIDTH - this.width) / 2 - 12),
      ));
      this.fireCooldown -= deltaTime;
      if (this.fireCooldown <= 0) {
        const centerX = this.x + this.width / 2;
        const bulletY = this.y + this.height;
        const dx = player.x + player.width / 2 - centerX;
        const dy = player.y + player.height / 2 - bulletY;
        const angle = Math.atan2(dy, dx);
        const speed = 205 + difficulty * 14;
        for (const spread of [-0.22, 0, 0.22]) {
          bullets.push(new Bullet(
            centerX,
            bulletY,
            Math.sin(angle + spread) * speed,
            "enemy",
            Math.cos(angle + spread) * speed,
          ));
        }
        this.fireCooldown = Math.max(0.72, 1.35 - difficulty * 0.08);
      }
    } else {
      this.y += this.speed * deltaTime;
    }
    if (this.type === "striker") {
      this.phase += deltaTime * 2.1;
      this.x = Math.max(8, Math.min(GAME_WIDTH - this.width - 8, this.originX + Math.sin(this.phase) * 88));
    }
    if (this.type === "ace" && this.y > 18) {
      this.fireCooldown -= deltaTime;
      if (this.fireCooldown <= 0) {
        const dx = player.x + player.width / 2 - (this.x + this.width / 2);
        const dy = player.y + player.height / 2 - (this.y + this.height);
        const length = Math.hypot(dx, dy) || 1;
        const speed = 190 + difficulty * 22;
        bullets.push(new Bullet(
          this.x + this.width / 2,
          this.y + this.height,
          (dy / length) * speed,
          "enemy",
          (dx / length) * speed,
        ));
        this.fireCooldown = Math.max(0.68, 1.65 - difficulty * 0.12) + Math.random() * 0.25;
      }
    }
  }

  draw() {
    const center = this.x + this.width / 2;
    context.save();
    context.shadowColor = this.color;
    context.shadowBlur = this.type === "boss" ? 28 : this.type === "ace" ? 19 : 11;
    context.fillStyle = this.color;
    context.beginPath();
    if (this.type === "boss") {
      context.moveTo(center, this.y + this.height);
      context.lineTo(this.x + this.width, this.y + this.height * 0.3);
      context.lineTo(this.x + this.width * 0.76, this.y + this.height * 0.38);
      context.lineTo(this.x + this.width * 0.67, this.y + 4);
      context.lineTo(center, this.y + this.height * 0.2);
      context.lineTo(this.x + this.width * 0.33, this.y + 4);
      context.lineTo(this.x + this.width * 0.24, this.y + this.height * 0.38);
      context.lineTo(this.x, this.y + this.height * 0.3);
    } else {
      context.moveTo(center, this.y + this.height);
      context.lineTo(this.x + this.width, this.y + 5);
      context.lineTo(center + this.width * 0.25, this.y + 12);
      context.lineTo(center, this.y + 2);
      context.lineTo(center - this.width * 0.25, this.y + 12);
      context.lineTo(this.x, this.y + 5);
    }
    context.closePath();
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = "#19223c";
    if (this.type === "boss") {
      context.fillRect(center - this.width * 0.1, this.y + this.height * 0.36, this.width * 0.2, this.height * 0.34);
      context.fillStyle = "#ffe4eb";
      context.fillRect(this.x + this.width * 0.2, this.y + this.height * 0.48, this.width * 0.12, 6);
      context.fillRect(this.x + this.width * 0.68, this.y + this.height * 0.48, this.width * 0.12, 6);
    } else {
      context.fillRect(center - this.width * 0.12, this.y + 12, this.width * 0.24, this.height * 0.3);
    }
    if (this.maxHp > 1) {
      context.fillStyle = "rgba(4, 8, 20, .78)";
      const barY = this.type === "boss" ? this.y - 12 : this.y - 7;
      const barHeight = this.type === "boss" ? 6 : 3;
      context.fillRect(this.x, barY, this.width, barHeight);
      context.fillStyle = this.color;
      context.fillRect(this.x, barY, this.width * (this.hp / this.maxHp), barHeight);
    }
    context.restore();
  }
}

class Explosion {
  constructor(x, y, color, amount = 12) {
    this.particles = Array.from({ length: amount }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 155;
      return {
        x,
        y,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        radius: 1 + Math.random() * 2.5,
        life: 0.22 + Math.random() * 0.32,
        maxLife: 0,
        color,
      };
    });
    for (const particle of this.particles) particle.maxLife = particle.life;
  }

  update(deltaTime) {
    for (const particle of this.particles) {
      particle.x += particle.velocityX * deltaTime;
      particle.y += particle.velocityY * deltaTime;
      particle.life -= deltaTime;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  draw() {
    for (const particle of this.particles) {
      context.globalAlpha = particle.life / particle.maxLife;
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }
}

class Starfield {
  constructor() {
    this.stars = [];
    this.resize();
  }

  resize(previousWidth = GAME_WIDTH) {
    const scale = GAME_WIDTH / previousWidth;
    for (const star of this.stars) star.x *= scale;
    const starCount = Math.round(75 * GAME_WIDTH / 480);
    while (this.stars.length < starCount) {
      this.stars.push({
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * GAME_HEIGHT,
        size: Math.random() * 1.6 + 0.3,
        speed: Math.random() * 70 + 24,
        alpha: Math.random() * 0.55 + 0.2,
      });
    }
    this.stars.length = starCount;
  }

  update(deltaTime) {
    for (const star of this.stars) {
      star.y += star.speed * deltaTime;
      if (star.y > GAME_HEIGHT) {
        star.y = 0;
        star.x = Math.random() * GAME_WIDTH;
      }
    }
  }

  draw() {
    context.fillStyle = "#080d1e";
    context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    for (const star of this.stars) {
      context.globalAlpha = star.alpha;
      context.fillStyle = "#b9d8ff";
      context.fillRect(star.x, star.y, star.size, star.size * 1.8);
    }
    context.globalAlpha = 1;
  }
}

class Game {
  constructor(canvas, onStatus, getControls, onNetwork) {
    context = canvas.getContext("2d");
    this.canvas = canvas;
    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(canvas);
    this.resizeCanvas();
    this.state = "ready";
    this.onStatus = onStatus;
    this.onNetwork = onNetwork;
    this.input = new InputHandler(getControls);
    this.player = new Player();
    this.players = [this.player];
    this.multiplayer = false;
    this.networkPlayer = 0;
    this.remoteInput = { moveX: 0, moveY: 0, fire: false };
    this.lastSnapshotTime = 0;
    this.starfield = new Starfield();
    this.bullets = [];
    this.enemies = [];
    this.explosions = [];
    this.score = 0;
    this.bossSpawned = false;
    this.hp = 3;
    this.elapsedTime = 0;
    this.spawnCooldown = 1.2;
    this.highScore = Number(window.localStorage.getItem("starfall-high-score") || 0);
    this.lastTime = 0;
    this.animationFrame = 0;
    this.frame = this.frame.bind(this);
    this.starfield.draw();
    this.player.draw();
    this.reportStatus();
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  resizeCanvas() {
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.round(bounds.width * pixelRatio);
    const height = Math.round(bounds.height * pixelRatio);
    if (this.canvas.width === width && this.canvas.height === height) return;

    const previousWidth = GAME_WIDTH;
    this.canvas.width = width;
    this.canvas.height = height;
    const scale = height / GAME_HEIGHT;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    GAME_WIDTH = width / scale;

    if (this.player) {
      const positionScale = GAME_WIDTH / previousWidth;
      for (const player of this.players) {
        player.x *= positionScale;
        player.x = Math.max(0, Math.min(GAME_WIDTH - player.width, player.x));
      }
      for (const enemy of this.enemies) {
        enemy.x *= positionScale;
        enemy.originX *= positionScale;
        enemy.x = Math.max(0, Math.min(GAME_WIDTH - enemy.width, enemy.x));
        enemy.originX = Math.max(0, Math.min(GAME_WIDTH - enemy.width, enemy.originX));
      }
      for (const bullet of this.bullets) bullet.x *= positionScale;
      for (const explosion of this.explosions) {
        for (const particle of explosion.particles) particle.x *= positionScale;
      }
      this.starfield.resize(previousWidth);
    }
  }

  start(multiplayer = false, networkPlayer = 0) {
    this.input.clear();
    this.multiplayer = multiplayer;
    this.networkPlayer = networkPlayer;
    this.remoteInput = { moveX: 0, moveY: 0, fire: false };
    this.players = multiplayer
      ? [
        new Player(GAME_WIDTH * 0.31, "#92f5f4"),
        new Player(GAME_WIDTH * 0.69 - 34, "#ffc076"),
      ]
      : [new Player()];
    this.player = this.players[0];
    this.bullets = [];
    this.enemies = [];
    this.explosions = [];
    this.score = 0;
    this.bossSpawned = false;
    this.hp = multiplayer ? 6 : 3;
    this.elapsedTime = 0;
    this.spawnCooldown = 0.8;
    this.state = "playing";
    this.reportStatus();
  }

  get difficulty() {
    return Math.min(this.elapsedTime / 28, 5);
  }

  formatScore(value) {
    return String(value).padStart(6, "0");
  }

  reportStatus() {
    this.onStatus({
      score: this.score,
      hp: this.hp,
      highScore: this.highScore,
      state: this.state,
    });
  }

  spawnEnemy() {
    const roll = Math.random();
    const type = roll < 0.13 ? "ace" : roll < 0.43 ? "striker" : "scout";
    this.enemies.push(new Enemy(type, Math.random() * (GAME_WIDTH - 56) + 28, this.difficulty));
  }

  spawnBoss() {
    this.bossSpawned = true;
    this.enemies.push(new Enemy("boss", GAME_WIDTH / 2, this.difficulty));
  }

  damagePlayer(x, y, player = this.player) {
    if (!player.takeDamage()) return;
    this.hp -= 1;
    this.explosions.push(new Explosion(x, y, "#ff718d", 16));
    this.reportStatus();
    if (this.hp <= 0) this.end();
  }

  award(enemy) {
    this.score += enemy.score;
    this.explosions.push(new Explosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.color));
    if (!this.bossSpawned && this.score > 5000) this.spawnBoss();
    if (this.score > this.highScore) {
      this.highScore = this.score;
      window.localStorage.setItem("starfall-high-score", String(this.highScore));
    }
    this.reportStatus();
  }

  update(deltaTime) {
    this.elapsedTime += deltaTime;
    this.starfield.update(deltaTime * (1 + this.difficulty * 0.12));
    this.player.update(deltaTime, this.input, this.bullets);
    if (this.multiplayer) {
      const remoteMovement = {
        horizontal: this.remoteInput.moveX,
        vertical: this.remoteInput.moveY,
      };
      this.players[1].update(
        deltaTime,
        this.input,
        this.bullets,
        remoteMovement,
        this.remoteInput.fire,
      );
    }
    this.spawnCooldown -= deltaTime;
    const bossActive = this.enemies.some((enemy) => enemy.type === "boss");
    if (!bossActive && this.spawnCooldown <= 0) {
      this.spawnEnemy();
      this.spawnCooldown = Math.max(0.38, 1.25 - this.difficulty * 0.13) + Math.random() * 0.48;
    }

    for (const bullet of this.bullets) bullet.update(deltaTime);
    for (const enemy of this.enemies) enemy.update(deltaTime, this.difficulty, this.player, this.bullets);
    for (const explosion of this.explosions) explosion.update(deltaTime);

    for (let bulletIndex = this.bullets.length - 1; bulletIndex >= 0; bulletIndex -= 1) {
      const bullet = this.bullets[bulletIndex];
      if (bullet.owner !== "player") continue;
      const enemyIndex = this.enemies.findIndex((enemy) => this.intersects(bullet, enemy));
      if (enemyIndex !== -1) {
        const enemy = this.enemies[enemyIndex];
        enemy.hp -= 1;
        this.explosions.push(new Explosion(bullet.x, bullet.y, enemy.color, 5));
        this.bullets.splice(bulletIndex, 1);
        if (enemy.hp <= 0) {
          this.award(enemy);
          this.enemies.splice(enemyIndex, 1);
        }
      }
    }

    for (let bulletIndex = this.bullets.length - 1; bulletIndex >= 0; bulletIndex -= 1) {
      const bullet = this.bullets[bulletIndex];
      const hitPlayer = bullet.owner === "enemy"
        ? this.players.find((player) => this.intersects(bullet, player))
        : null;
      if (hitPlayer) {
        this.bullets.splice(bulletIndex, 1);
        this.damagePlayer(bullet.x, bullet.y, hitPlayer);
      }
    }
    for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
      const enemy = this.enemies[enemyIndex];
      const collidedPlayer = this.players.find((player) => this.intersects(enemy, player));
      if (collidedPlayer) {
        this.enemies.splice(enemyIndex, 1);
        this.damagePlayer(
          enemy.x + enemy.width / 2,
          enemy.y + enemy.height / 2,
          collidedPlayer,
        );
      } else if (enemy.y > GAME_HEIGHT + enemy.height) {
        this.enemies.splice(enemyIndex, 1);
      }
    }

    this.bullets = this.bullets.filter((bullet) => (
      bullet.y > -16 && bullet.y < GAME_HEIGHT + 16 && bullet.x > -16 && bullet.x < GAME_WIDTH + 16
    ));
    if (bossActive && !this.enemies.some((enemy) => enemy.type === "boss")) {
      this.spawnCooldown = 1.2;
    }
    this.explosions = this.explosions.filter((explosion) => explosion.particles.length > 0);
  }

  intersects(first, second) {
    const firstLeft = first.x - (first.radius || 0);
    const firstTop = first.y - (first.radius || 0);
    const firstRight = first.x + (first.width || 0) + (first.radius || 0);
    const firstBottom = first.y + (first.height || 0) + (first.radius || 0);
    const secondLeft = second.x - (second.radius || 0);
    const secondTop = second.y - (second.radius || 0);
    const secondRight = second.x + (second.width || 0) + (second.radius || 0);
    const secondBottom = second.y + (second.height || 0) + (second.radius || 0);
    return firstLeft < secondRight && firstRight > secondLeft
      && firstTop < secondBottom && firstBottom > secondTop;
  }

  draw() {
    this.starfield.draw();
    for (const bullet of this.bullets) bullet.draw();
    for (const enemy of this.enemies) enemy.draw();
    for (const explosion of this.explosions) explosion.draw();
    if (this.state !== "gameover") {
      for (const player of this.players) player.draw();
    }
  }

  setRemoteInput(input) {
    this.remoteInput = {
      moveX: Math.max(-1, Math.min(1, Number(input?.moveX) || 0)),
      moveY: Math.max(-1, Math.min(1, Number(input?.moveY) || 0)),
      fire: Boolean(input?.fire),
    };
  }

  end() {
    if (this.state !== "playing") return;
    this.state = "gameover";
    this.input.clear();
    this.reportStatus();
  }

  getLocalInput() {
    const movement = this.input.getMovement();
    return {
      moveX: movement.horizontal,
      moveY: movement.vertical,
      fire: this.input.isDown(" "),
    };
  }

  createSnapshot() {
    return {
      width: GAME_WIDTH,
      state: this.state,
      score: this.score,
      hp: this.hp,
      highScore: this.highScore,
      elapsedTime: this.elapsedTime,
      players: this.players.map((player) => ({ ...player })),
      bullets: this.bullets.map((bullet) => ({ ...bullet })),
      enemies: this.enemies.map((enemy) => ({ ...enemy })),
      explosions: this.explosions.map((explosion) => ({
        particles: explosion.particles.map((particle) => ({ ...particle })),
      })),
    };
  }

  applySnapshot(snapshot) {
    const positionScale = GAME_WIDTH / snapshot.width;
    this.state = snapshot.state;
    this.score = snapshot.score;
    this.hp = snapshot.hp;
    this.highScore = snapshot.highScore;
    this.elapsedTime = snapshot.elapsedTime;
    this.players = snapshot.players.map((player) => (
      Object.assign(new Player(), {
        ...player,
        x: player.x * positionScale,
        velocityX: player.velocityX * positionScale,
      })
    ));
    this.player = this.players[0];
    this.bullets = snapshot.bullets.map((bullet) => (
      Object.assign(Object.create(Bullet.prototype), {
        ...bullet,
        x: bullet.x * positionScale,
        velocityX: bullet.velocityX * positionScale,
      })
    ));
    this.enemies = snapshot.enemies.map((enemy) => (
      Object.assign(Object.create(Enemy.prototype), {
        ...enemy,
        x: enemy.x * positionScale,
        originX: enemy.originX * positionScale,
      })
    ));
    this.explosions = snapshot.explosions.map((explosion) => (
      Object.assign(Object.create(Explosion.prototype), {
        ...explosion,
        particles: explosion.particles.map((particle) => ({
          ...particle,
          x: particle.x * positionScale,
          velocityX: particle.velocityX * positionScale,
        })),
      })
    ));
    this.reportStatus();
  }

  frame(timestamp) {
    const deltaTime = Math.min((timestamp - this.lastTime) / 1000 || 0, 0.05);
    this.lastTime = timestamp;
    if (this.state === "playing" && !(this.multiplayer && this.networkPlayer === 2)) {
      this.update(deltaTime);
    } else {
      this.starfield.update(deltaTime);
    }
    if (this.multiplayer && this.networkPlayer === 1 && timestamp - this.lastSnapshotTime >= 50) {
      this.lastSnapshotTime = timestamp;
      this.onNetwork?.({ type: "snapshot", snapshot: this.createSnapshot() });
    }
    this.draw();
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.input.dispose();
  }
}

export function initializeGame(canvas, onStatus, getControls, onNetwork) {
  const game = new Game(canvas, onStatus, getControls, onNetwork);
  return {
    start: (multiplayer, networkPlayer) => game.start(multiplayer, networkPlayer),
    end: () => game.end(),
    setRemoteInput: (input) => game.setRemoteInput(input),
    applySnapshot: (snapshot) => game.applySnapshot(snapshot),
    getLocalInput: () => game.getLocalInput(),
    dispose: () => game.dispose(),
  };
}
