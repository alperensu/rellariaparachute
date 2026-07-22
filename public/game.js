/* global Phaser, io */

const BOWL_SCALE = 0.58;
const PLAYER_SCALE = 0.66;
const PARACHUTE_UI_SCALE = 0.82;
const BOWL_SURFACE_Y = 1_003;
const GROUND_CONTACT_Y = 1_078;
const CHARACTER_CONTACT_OFFSET = 83;
const WORLD_WIDTH = 1_920;
const AIRBORNE_MIN_X = 70;
const AIRBORNE_MAX_X = 1_850;

class SocketBridge {
  constructor() {
    this.socket = null;
  }

  connect(handlers) {
    this.socket = io({ transports: ["websocket", "polling"] });
    let isReconnecting = false;

    this.socket.on("connect", () => {
      if (isReconnecting) {
        window.location.reload();
        return;
      }
      handlers.onConnected?.();
    });

    this.socket.on("disconnect", (reason) => {
      isReconnecting = true;
      handlers.onDisconnected?.(reason);
    });

    this.socket.on("system:reload", () => {
      window.location.reload();
    });

    this.socket.on("game:event-started", handlers.onEventStarted);
    this.socket.on("game:event-ended", handlers.onEventEnded);
    this.socket.on("drop", handlers.onDrop);
  }

  disconnect() {
    this.socket?.disconnect();
  }
}

class PinkLandingBowl {
  constructor(scene, x) {
    this.scene = scene;
    this.x = x;
    this.y = 1_045;
    this.container = scene.add.container(x, this.y).setDepth(4).setScale(0).setAlpha(0);
    this.bubbles = [];
    this.bubbleTimer = 0;
    this.build();
    this.animateIn();
  }

  build() {
    if (this.scene.textures.exists("landing_bowl_svg")) {
      this.bowlImage = this.scene.add.image(0, 0, "landing_bowl_svg");
      this.container.add(this.bowlImage);

      this.glowOverlay = this.scene.add.ellipse(0, -20, 360, 60, 0xff33b4, 0.15);
      this.container.add(this.glowOverlay);
      this.scene.tweens.add({
        targets: this.glowOverlay,
        alpha: 0.35,
        scaleX: 1.05,
        duration: 1_400,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });
    } else {
      const shadow = this.scene.add.ellipse(0, 52, 430, 52, 0x3d0b30, 0.45);
      const glow = this.scene.add.ellipse(0, 0, 470, 165, 0xff2fa4, 0.22);

      const bowlGraphics = this.scene.add.graphics();
      bowlGraphics.fillStyle(0xff80d5, 0.16);
      bowlGraphics.fillEllipse(0, 10, 430, 155);

      const liquidBack = this.scene.add.ellipse(0, -20, 396, 88, 0x8a0b5a, 0.95);
      const liquidMain = this.scene.add.ellipse(0, -26, 376, 74, 0xff1a9e, 0.96);
      const liquidGlow = this.scene.add.ellipse(-30, -36, 235, 34, 0xffc4ed, 0.4);

      const glassRim = this.scene.add.graphics();
      glassRim.lineStyle(9, 0xffd6f3, 0.96);
      glassRim.strokeEllipse(0, -22, 415, 98);
      glassRim.lineStyle(3, 0xffffff, 0.92);
      glassRim.strokeEllipse(0, -27, 384, 78);
      glassRim.lineStyle(5, 0xff99dc, 0.75);
      glassRim.strokeEllipse(0, 10, 430, 155);

      this.container.add([shadow, glow, bowlGraphics, liquidBack, liquidMain, liquidGlow, glassRim]);
    }

    for (let index = 0; index < 14; index += 1) {
      this.spawnBubble(true);
    }
  }

  spawnBubble(isInitial = false) {
    if (!this.container?.active) return;
    const localX = -155 + Math.random() * 310;
    const startY = isInitial ? -20 - Math.random() * 140 : -20;
    const radius = 3 + Math.random() * 7;
    const bubbleContainer = this.scene.add.container(localX, startY);

    const circle = this.scene.add.circle(0, 0, radius, 0xffe6f7, 0.55);
    circle.setStrokeStyle(1.5, 0xffffff, 0.9);
    const shine = this.scene.add.circle(-radius * 0.3, -radius * 0.3, radius * 0.25, 0xffffff, 0.85);
    bubbleContainer.add([circle, shine]);

    this.container.add(bubbleContainer);
    this.bubbles.push(bubbleContainer);

    const floatDistance = 140 + Math.random() * 170;
    const duration = 1_800 + Math.random() * 1_600;
    const swayAmount = 15 + Math.random() * 25;
    const swayDirection = Math.random() < 0.5 ? -1 : 1;

    this.scene.tweens.add({
      targets: bubbleContainer,
      y: startY - floatDistance,
      x: localX + swayAmount * swayDirection,
      alpha: { from: isInitial ? 0.7 : 0.88, to: 0 },
      scaleX: { from: 0.7, to: 1.3 },
      scaleY: { from: 0.7, to: 1.3 },
      duration,
      ease: "Sine.out",
      onComplete: () => {
        const index = this.bubbles.indexOf(bubbleContainer);
        if (index >= 0) this.bubbles.splice(index, 1);
        bubbleContainer.destroy();
      },
    });
  }

  update(time, delta) {
    if (!this.container?.active) return;
    this.bubbleTimer += delta;
    if (this.bubbleTimer >= 160) {
      this.bubbleTimer = 0;
      if (this.bubbles.length < 28) {
        this.spawnBubble(false);
      }
    }
  }

  animateIn() {
    const targetScale = BOWL_SCALE * 0.95;
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      scaleX: targetScale,
      scaleY: targetScale,
      y: this.y - 12,
      duration: 650,
      ease: "Back.out",
    });
  }

  contains(worldX) {
    return Math.abs(worldX - this.x) <= 112;
  }

  splash(worldX) {
    const localX = Phaser.Math.Clamp(worldX - this.x, -100, 100);
    for (let index = 0; index < 18; index += 1) {
      this.spawnSplashBubble(localX, index);
    }

    const currentScale = BOWL_SCALE * 0.95;
    this.scene.tweens.add({
      targets: this.container,
      scaleX: currentScale * 1.05,
      scaleY: currentScale * 0.93,
      duration: 120,
      yoyo: true,
      ease: "Sine.inOut",
    });
  }

  spawnSplashBubble(localX, index) {
    const droplet = this.scene.add.circle(
      this.x + localX + (-15 + Math.random() * 30),
      this.y - 45,
      4 + (index % 5),
      index % 3 === 0 ? 0xffffff : 0xff4fb5,
      0.95,
    ).setDepth(13);
    const angle = Math.PI * (0.12 + (index / 17) * 0.76);
    const distance = 60 + (index % 5) * 22;
    this.scene.tweens.add({
      targets: droplet,
      x: droplet.x + Math.cos(angle) * distance,
      y: droplet.y - Math.sin(angle) * distance,
      alpha: 0,
      scaleX: 0.2,
      scaleY: 0.2,
      duration: 550 + (index % 4) * 120,
      ease: "Quad.out",
      onComplete: () => droplet.destroy(),
    });
  }

  destroy() {
    if (!this.container?.active) return;
    for (const bubble of this.bubbles) {
      if (bubble?.active) bubble.destroy();
    }
    this.bubbles = [];
    const currentScale = BOWL_SCALE * 0.95;
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      scaleX: currentScale * 0.7,
      scaleY: currentScale * 0.7,
      y: this.y + 40,
      duration: 420,
      ease: "Back.in",
      onComplete: () => this.container.destroy(true),
    });
  }
}

class WindManager {
  constructor(scene) {
    this.scene = scene;
    this.windState = { direction: 1, speed: 0.04, active: true };
    this.particles = [];
    this.spawnTimer = 0;
  }

  setWind(windState) {
    if (windState && typeof windState.direction === "number") {
      this.windState = {
        direction: windState.direction,
        speed: windState.speed ?? 0.04,
        active: windState.active ?? true,
      };
    }
  }

  update(time, delta) {
    if (!this.windState.active) return;
    this.spawnTimer += delta;
    if (this.spawnTimer >= 180) {
      this.spawnTimer = 0;
      if (this.particles.length < 24) {
        this.spawnWindStream();
      }
    }

    const deltaSec = delta / 1_000;
    const moveSpeed = this.windState.direction * (280 + this.windState.speed * 2000) * deltaSec;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += moveSpeed;
      p.alpha -= deltaSec * 0.25;
      if (p.x < -100 || p.x > WORLD_WIDTH + 100 || p.alpha <= 0) {
        p.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  spawnWindStream() {
    const dir = this.windState.direction;
    const startX = dir > 0 ? -50 : WORLD_WIDTH + 50;
    const startY = 120 + Math.random() * 700;
    const length = 80 + Math.random() * 120;

    const stream = this.scene.add.graphics().setDepth(2);
    stream.lineStyle(2 + Math.random() * 2, 0xffffff, 0.35);
    stream.lineBetween(0, 0, dir * length, Math.sin(Math.random() * Math.PI) * 12);
    stream.setPosition(startX, startY);

    this.particles.push(stream);
  }

  applyWindToPlayer(player, deltaSeconds) {
    if (!this.windState.active || !player.isAirborne) return;
    const windPush = this.windState.direction * (this.windState.speed * 1800) * deltaSeconds;
    player.velocityX += windPush;
  }
}

class FlyingBird {
  constructor(scene, data) {
    this.scene = scene;
    this.id = data.id;
    this.type = "bird";
    this.y = data.yRatio * 1_080;
    this.speed = (140 + data.speed * 1800) * data.direction;
    this.direction = data.direction;
    this.x = data.direction > 0 ? -60 : WORLD_WIDTH + 60;
    this.radiusX = 36;
    this.radiusY = 24;
    this.container = scene.add.container(this.x, this.y).setDepth(6);
    this.wingPhase = Math.random() * Math.PI * 2;
    this.build();
  }

  build() {
    this.graphics = this.scene.add.graphics();
    this.container.add(this.graphics);
    if (this.direction < 0) this.container.setScale(-1, 1);
  }

  update(time, delta) {
    if (!this.container?.active) return;
    const deltaSec = delta / 1_000;
    this.container.x += this.speed * deltaSec;

    if (this.direction > 0 && this.container.x > WORLD_WIDTH + 100) {
      this.container.x = -100;
    } else if (this.direction < 0 && this.container.x < -100) {
      this.container.x = WORLD_WIDTH + 100;
    }

    this.wingPhase += deltaSec * 14;
    const wingY = Math.sin(this.wingPhase) * 16;

    this.graphics.clear();
    this.graphics.fillStyle(0x332244, 0.9);
    this.graphics.fillEllipse(0, 0, 24, 14);
    this.graphics.fillStyle(0x442255, 0.95);
    this.graphics.fillCircle(12, -3, 6);
    this.graphics.fillStyle(0xffaa22, 1);
    this.graphics.fillTriangle(17, -4, 23, -2, 17, 0);

    this.graphics.lineStyle(4, 0x221133, 0.95);
    this.graphics.lineBetween(-4, 0, -18, -14 + wingY);
    this.graphics.lineBetween(-18, -14 + wingY, -30, -4 + wingY * 0.5);

    this.graphics.lineStyle(4, 0x442255, 0.95);
    this.graphics.lineBetween(4, 0, 16, -16 + wingY);
    this.graphics.lineBetween(16, -16 + wingY, 26, -6 + wingY * 0.5);
  }

  onHit() {
    this.scene.tweens.add({
      targets: this.container,
      scaleY: 1.4,
      scaleX: this.direction < 0 ? -1.3 : 1.3,
      duration: 120,
      yoyo: true,
      ease: "Quad.out",
    });
  }

  destroy() {
    this.container?.destroy();
  }
}

class HotAirBalloon {
  constructor(scene, data) {
    this.scene = scene;
    this.id = data.id;
    this.type = "balloon";
    this.y = data.yRatio * 1_080;
    this.speed = (60 + data.speed * 1200) * data.direction;
    this.direction = data.direction;
    this.x = data.direction > 0 ? -100 : WORLD_WIDTH + 100;
    this.radiusX = 52;
    this.radiusY = 65;
    this.container = scene.add.container(this.x, this.y).setDepth(5);
    this.wobbleTimer = 0;
    this.build();
  }

  build() {
    const balloonG = this.scene.add.graphics();

    balloonG.fillStyle(0x5c3a21, 1);
    balloonG.fillRoundedRect(-18, 55, 36, 28, 6);
    balloonG.lineStyle(2, 0x3d2514, 1);
    balloonG.strokeRoundedRect(-18, 55, 36, 28, 6);

    balloonG.lineStyle(2, 0xd4b896, 0.9);
    balloonG.lineBetween(-14, 55, -28, 30);
    balloonG.lineBetween(14, 55, 28, 30);

    balloonG.fillStyle(0xff2a8d, 0.95);
    balloonG.fillCircle(0, -15, 52);
    balloonG.fillStyle(0xffa834, 0.95);
    balloonG.fillTriangle(0, 36, -38, 5, 38, 5);

    balloonG.fillStyle(0xffd52a, 0.9);
    balloonG.fillEllipse(0, -15, 34, 100);
    balloonG.fillStyle(0x2affd5, 0.9);
    balloonG.fillEllipse(0, -15, 16, 96);

    this.flame = this.scene.add.circle(0, 46, 7, 0xff7700, 0.9);
    this.container.add([balloonG, this.flame]);

    this.scene.tweens.add({
      targets: this.flame,
      scaleX: 1.5,
      scaleY: 1.8,
      alpha: 0.6,
      duration: 250,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  update(time, delta) {
    if (!this.container?.active) return;
    const deltaSec = delta / 1_000;
    this.container.x += this.speed * deltaSec;

    this.wobbleTimer += deltaSec * 2;
    this.container.y = this.y + Math.sin(this.wobbleTimer) * 14;

    if (this.direction > 0 && this.container.x > WORLD_WIDTH + 140) {
      this.container.x = -140;
    } else if (this.direction < 0 && this.container.x < -140) {
      this.container.x = WORLD_WIDTH + 140;
    }
  }

  onHit() {
    this.scene.tweens.add({
      targets: this.container,
      angle: 15 * (Math.random() < 0.5 ? -1 : 1),
      duration: 150,
      yoyo: true,
      ease: "Back.out",
    });
  }

  destroy() {
    this.container?.destroy();
  }
}

class Zeppelin {
  constructor(scene, data) {
    this.scene = scene;
    this.id = data.id;
    this.type = "zeppelin";
    this.y = data.yRatio * 1_080;
    this.speed = (90 + data.speed * 1400) * data.direction;
    this.direction = data.direction;
    this.x = data.direction > 0 ? -180 : WORLD_WIDTH + 180;
    this.radiusX = 90;
    this.radiusY = 40;
    this.container = scene.add.container(this.x, this.y).setDepth(4);
    this.propellerAngle = 0;
    this.build();
  }

  build() {
    const zepG = this.scene.add.graphics();

    zepG.fillStyle(0xd92d91, 0.95);
    zepG.fillTriangle(-85, -5, -115, -35, -75, -15);
    zepG.fillTriangle(-85, 5, -115, 35, -75, 15);

    zepG.fillStyle(0xe2e8f0, 0.98);
    zepG.fillEllipse(0, 0, 180, 72);
    zepG.lineStyle(3, 0x94a3b8, 1);
    zepG.strokeEllipse(0, 0, 180, 72);

    zepG.fillStyle(0xff2fa4, 0.9);
    zepG.fillRect(-70, -8, 140, 16);

    zepG.fillStyle(0x1e293b, 0.95);
    zepG.fillRoundedRect(-35, 30, 70, 22, 6);
    zepG.fillStyle(0x38bdf8, 0.9);
    zepG.fillRect(-25, 35, 12, 10);
    zepG.fillRect(-5, 35, 12, 10);
    zepG.fillRect(15, 35, 12, 10);

    const text = this.scene.add.text(0, -1, "RELLARIA", {
      fontFamily: "Arial Black, Arial",
      fontSize: "15px",
      color: "#ffffff",
      stroke: "#d92d91",
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.propellerG = this.scene.add.graphics();
    this.container.add([zepG, text, this.propellerG]);

    if (this.direction < 0) this.container.setScale(-1, 1);
  }

  update(time, delta) {
    if (!this.container?.active) return;
    const deltaSec = delta / 1_000;
    this.container.x += this.speed * deltaSec;

    this.propellerAngle += deltaSec * 25;
    this.propellerG.clear();
    this.propellerG.lineStyle(3, 0x334155, 1);
    const pX = -92;
    const pLen = Math.sin(this.propellerAngle) * 16;
    this.propellerG.lineBetween(pX, -pLen, pX, pLen);

    if (this.direction > 0 && this.container.x > WORLD_WIDTH + 220) {
      this.container.x = -220;
    } else if (this.direction < 0 && this.container.x < -220) {
      this.container.x = WORLD_WIDTH + 220;
    }
  }

  onHit() {
    this.scene.tweens.add({
      targets: this.container,
      y: this.y - 18,
      duration: 160,
      yoyo: true,
      ease: "Quad.out",
    });
  }

  destroy() {
    this.container?.destroy();
  }
}

class ObstacleManager {
  constructor(scene) {
    this.scene = scene;
    this.obstacles = [];
  }

  initObstacles(obstaclesData) {
    this.clear();
    if (!Array.isArray(obstaclesData)) return;
    for (const data of obstaclesData) {
      if (data.type === "bird") {
        this.obstacles.push(new FlyingBird(this.scene, data));
      } else if (data.type === "balloon") {
        this.obstacles.push(new HotAirBalloon(this.scene, data));
      } else if (data.type === "zeppelin") {
        this.obstacles.push(new Zeppelin(this.scene, data));
      }
    }
  }

  update(time, delta) {
    for (const obs of this.obstacles) {
      obs.update(time, delta);
    }
  }

  checkCollisions(players, time) {
    for (const player of players) {
      if (!player.isAirborne || !player.container?.active) continue;
      const px = player.container.x;
      const py = player.container.y;

      for (const obs of this.obstacles) {
        if (!obs.container?.active) continue;
        const ox = obs.container.x;
        const oy = obs.container.y;

        const deltaX = Math.abs(px - ox);
        const deltaY = Math.abs(py - oy);

        const radiusX = obs.radiusX + 38 * player.displayScale;
        const radiusY = obs.radiusY + 46 * player.displayScale;

        if (deltaX < radiusX && deltaY < radiusY) {
          if (time - player.lastCollisionAt < 180) continue;
          player.lastCollisionAt = time;

          const bounceDir = px < ox ? -1 : 1;
          const bounceSpeed = Phaser.Math.Clamp(300 + Math.abs(player.velocityX), 320, 700);

          player.velocityX = bounceDir * bounceSpeed;
          player.isBouncing = true;
          player.tiltAngle = bounceDir * 34;

          player.createCollisionSpark((px + ox) / 2, (py + oy) / 2);
          obs.onHit();
        }
      }
    }
  }

  clear() {
    for (const obs of this.obstacles) {
      obs.destroy();
    }
    this.obstacles = [];
  }
}

class ParachutePlayer {
  constructor(scene, player, bowl, displayScale) {
    this.scene = scene;
    this.player = player;
    this.bowl = bowl;
    this.startX = player.spawnX * WORLD_WIDTH;
    this.landingX = player.landingX * WORLD_WIDTH;
    this.displayScale = displayScale;
    this.isLanded = false;
    this.isAirborne = true;
    this.isBouncing = false;
    this.landedInBowl = false;
    this.velocityX = Number.isFinite(player.launchVelocityX)
      ? player.launchVelocityX * WORLD_WIDTH
      : (Math.random() < 0.5 ? -1 : 1) * (125 + Math.random() * 145);
    this.tiltAngle = 0;
    this.fallElapsed = 0;
    this.fallDuration = 5_800 + Math.random() * 2_200;
    this.lastCollisionAt = Number.NEGATIVE_INFINITY;
    this.container = scene.add.container(this.startX, -145)
      .setDepth(12)
      .setScale(this.displayScale);
    this.build();
    this.fall();
  }

  build() {
    this.parachute = this.scene.add.graphics();
    const canopyOutline = [
      new Phaser.Math.Vector2(-78, -12),
      new Phaser.Math.Vector2(-73, -34),
      new Phaser.Math.Vector2(-61, -54),
      new Phaser.Math.Vector2(-42, -69),
      new Phaser.Math.Vector2(-20, -78),
      new Phaser.Math.Vector2(0, -81),
      new Phaser.Math.Vector2(20, -78),
      new Phaser.Math.Vector2(42, -69),
      new Phaser.Math.Vector2(61, -54),
      new Phaser.Math.Vector2(73, -34),
      new Phaser.Math.Vector2(78, -12),
      new Phaser.Math.Vector2(59, -3),
      new Phaser.Math.Vector2(39, -13),
      new Phaser.Math.Vector2(20, -3),
      new Phaser.Math.Vector2(0, -13),
      new Phaser.Math.Vector2(-20, -3),
      new Phaser.Math.Vector2(-39, -13),
      new Phaser.Math.Vector2(-59, -3),
    ];

    this.parachute.fillStyle(0xd92d91, 1);
    this.parachute.fillPoints(canopyOutline, true);
    this.parachute.fillStyle(0xf04aac, 1);
    this.parachute.fillTriangle(0, -81, -78, -12, -39, -13);
    this.parachute.fillStyle(0xff83c8, 1);
    this.parachute.fillTriangle(0, -81, -39, -13, 0, -13);
    this.parachute.fillStyle(0xffa9d8, 1);
    this.parachute.fillTriangle(0, -81, 0, -13, 39, -13);
    this.parachute.fillStyle(0xef4caa, 1);
    this.parachute.fillTriangle(0, -81, 39, -13, 78, -12);

    this.parachute.lineStyle(4, 0xffe1f3, 0.98);
    this.parachute.strokePoints(canopyOutline, true);
    this.parachute.lineStyle(2, 0xffffff, 0.52);
    this.parachute.lineBetween(0, -79, -39, -13);
    this.parachute.lineBetween(0, -79, 0, -13);
    this.parachute.lineBetween(0, -79, 39, -13);
    this.parachute.fillStyle(0xffffff, 0.38);
    this.parachute.fillEllipse(-28, -55, 34, 12);

    this.parachute.lineStyle(3, 0xffe5f4, 0.96);
    this.parachute.lineBetween(-62, -5, -23, 12);
    this.parachute.lineBetween(-38, -10, -18, 14);
    this.parachute.lineBetween(62, -5, 23, 12);
    this.parachute.lineBetween(38, -10, 18, 14);
    this.parachute.lineStyle(4, 0xff70bc, 1);
    this.parachute.strokeRoundedRect(-25, 7, 50, 12, 6);
    this.parachute.setScale(PARACHUTE_UI_SCALE);

    this.landingShadow = this.scene.add.ellipse(0, 77, 62, 11, 0x26091e, 0.38)
      .setVisible(false);

    this.character = this.scene.add.text(0, 43, this.player.emoji || "🙂", {
      fontFamily: "Segoe UI Emoji, Apple Color Emoji, sans-serif",
      fontSize: "74px",
    }).setOrigin(0.5);

    this.nameBackground = this.scene.add.graphics();
    this.nameBackground.fillStyle(0x3d0d31, 0.88);
    this.nameBackground.fillRoundedRect(-68, 90, 136, 28, 14);
    this.nameBackground.lineStyle(2, 0xff83ca, 0.95);
    this.nameBackground.strokeRoundedRect(-68, 90, 136, 28, 14);
    this.username = this.scene.add.text(0, 104, this.player.username, {
      fontFamily: "Arial Black, Arial",
      fontSize: "14px",
      color: "#ffffff",
      stroke: "#3d0d31",
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.username.setDisplaySize(Math.min(this.username.width, 118), this.username.height);

    const scoreBackground = this.scene.add.graphics();
    scoreBackground.fillStyle(0xffe2f3, 0.96);
    scoreBackground.fillRoundedRect(-60, -137, 120, 38, 19);
    scoreBackground.lineStyle(2, 0xff4fb5, 1);
    scoreBackground.strokeRoundedRect(-60, -137, 120, 38, 19);
    this.scoreText = this.scene.add.text(0, -118, `${this.player.score} PUAN`, {
      fontFamily: "Arial Black, Arial",
      fontSize: "15px",
      color: "#6f1d59",
    }).setOrigin(0.5);
    this.scoreBadge = this.scene.add.container(0, 0, [scoreBackground, this.scoreText])
      .setVisible(false)
      .setScale(0);

    this.container.add([
      this.parachute,
      this.landingShadow,
      this.character,
      this.nameBackground,
      this.username,
      this.scoreBadge,
    ]);
    this.loadKickEmote();
  }

  loadKickEmote() {
    const id = this.player.kickEmote?.id;
    if (typeof id !== "string" || !/^\d{1,12}$/.test(id)) return;

    const image = document.createElement("img");
    image.alt = "";
    image.decoding = "async";
    image.style.cssText = [
      "width:80px",
      "height:80px",
      "object-fit:contain",
      "pointer-events:none",
      "opacity:0",
    ].join(";");
    image.onload = () => {
      if (!this.container?.active) return;
      image.style.opacity = "1";
      this.character.setVisible(false);
    };
    image.onerror = () => this.kickEmote?.destroy();
    image.src = `/api/kick-emotes/${id}`;
    this.kickEmote = this.scene.add.dom(0, 43, image).setOrigin(0.5);
    this.container.addAt(this.kickEmote, 1);
  }

  fall() {
    this.container.angle = Phaser.Math.Clamp(this.velocityX / 32, -8, 8);
  }

  updateFall(delta) {
    if (!this.isAirborne || !this.container?.active) return;

    const deltaSeconds = Math.min(delta, 50) / 1_000;
    this.fallElapsed += delta;
    const progress = Phaser.Math.Clamp(this.fallElapsed / this.fallDuration, 0, 1);

    if (this.scene.windManager) {
      this.scene.windManager.applyWindToPlayer(this, deltaSeconds);
    }

    if (this.isBouncing) {
      this.velocityX *= Math.pow(0.988, deltaSeconds * 60);
      this.container.x += this.velocityX * deltaSeconds;
      this.landingX = this.container.x;
    } else {
      const remainingSeconds = Math.max((this.fallDuration - this.fallElapsed) / 1_000, 0.28);
      const desiredVelocity = (this.landingX - this.container.x) / remainingSeconds;
      const steeringStrength = progress < 0.68 ? 95 : 300;
      const velocityChange = Phaser.Math.Clamp(
        desiredVelocity - this.velocityX,
        -steeringStrength * deltaSeconds,
        steeringStrength * deltaSeconds,
      );

      this.velocityX += velocityChange;
      this.container.x += this.velocityX * deltaSeconds;
    }

    if (this.container.x <= AIRBORNE_MIN_X) {
      this.container.x = AIRBORNE_MIN_X;
      if (this.velocityX < 0) {
        this.velocityX = Math.abs(this.velocityX) * 0.84 + 110;
        this.isBouncing = true;
        this.landingX = this.container.x;
        this.tiltAngle = 28;
        this.createWallSpark(AIRBORNE_MIN_X, this.container.y, 1);
      }
    } else if (this.container.x >= AIRBORNE_MAX_X) {
      this.container.x = AIRBORNE_MAX_X;
      if (this.velocityX > 0) {
        this.velocityX = -Math.abs(this.velocityX) * 0.84 - 110;
        this.isBouncing = true;
        this.landingX = this.container.x;
        this.tiltAngle = -28;
        this.createWallSpark(AIRBORNE_MAX_X, this.container.y, -1);
      }
    }

    const targetLandingY = this.getLandingY();
    this.container.y = Phaser.Math.Linear(-145, targetLandingY, Math.pow(progress, 0.95));

    if (Math.abs(this.tiltAngle) > 0.1) {
      this.tiltAngle *= Math.pow(0.88, deltaSeconds * 60);
    } else {
      this.tiltAngle = 0;
    }

    const sway = Math.sin(progress * Math.PI * 7) * 2.5;
    this.container.angle = Phaser.Math.Clamp(this.velocityX / 28 + this.tiltAngle, -32, 32) + sway;

    if (progress >= 1) this.land();
  }

  collideWith(other, now) {
    if (!this.isAirborne || !other.isAirborne) return;
    if (now - this.lastCollisionAt < 100 || now - other.lastCollisionAt < 100) return;

    const horizontalRadius = 54 * (this.displayScale + other.displayScale);
    const verticalRadius = 80 * (this.displayScale + other.displayScale);
    const deltaX = other.container.x - this.container.x;
    const deltaY = other.container.y - this.container.y;
    if (Math.abs(deltaX) >= horizontalRadius || Math.abs(deltaY) >= verticalRadius) return;

    const direction = deltaX === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(deltaX);
    const overlap = horizontalRadius - Math.abs(deltaX);

    this.container.x -= direction * overlap * 0.5;
    other.container.x += direction * overlap * 0.5;

    const incomingSpeed = Math.abs(this.velocityX - other.velocityX);
    const bounceSpeed = Phaser.Math.Clamp(220 + incomingSpeed * 0.95 + overlap * 6, 250, 650);

    this.velocityX = -direction * bounceSpeed;
    other.velocityX = direction * bounceSpeed;

    this.isBouncing = true;
    other.isBouncing = true;

    this.tiltAngle = -direction * Math.min(32, bounceSpeed * 0.1);
    other.tiltAngle = direction * Math.min(32, bounceSpeed * 0.1);

    const bumpX = (this.container.x + other.container.x) / 2;
    const bumpY = (this.container.y + other.container.y) / 2;
    this.createCollisionSpark(bumpX, bumpY);

    this.lastCollisionAt = now;
    other.lastCollisionAt = now;
  }

  createCollisionSpark(x, y) {
    const ring = this.scene.add.circle(x, y, 12, 0xffe1f3, 0.9).setDepth(15);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 3.5,
      scaleY: 3.5,
      alpha: 0,
      duration: 220,
      ease: "Quad.out",
      onComplete: () => ring.destroy(),
    });
  }

  createWallSpark(x, y, dir) {
    for (let index = 0; index < 6; index += 1) {
      const spark = this.scene.add.circle(
        x,
        y + (-20 + index * 8),
        3 + (index % 3),
        0xffb7e5,
        0.9,
      ).setDepth(15);
      const angle = (dir > 0 ? 0 : Math.PI) + (-0.5 + (index / 5)) * 0.8;
      const distance = 40 + (index % 4) * 15;
      this.scene.tweens.add({
        targets: spark,
        x: spark.x + Math.cos(angle) * distance,
        y: spark.y + Math.sin(angle) * distance,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 250 + index * 40,
        ease: "Quad.out",
        onComplete: () => spark.destroy(),
      });
    }
  }

  land() {
    if (!this.isAirborne) return;
    this.isAirborne = false;
    this.container.angle = 0;

    const finalLandingX = Phaser.Math.Clamp(this.container.x, AIRBORNE_MIN_X, AIRBORNE_MAX_X);
    this.container.x = finalLandingX;
    this.container.y = this.getLandingY();
    this.isLanded = true;

    const landedInBowl = this.bowl?.contains(finalLandingX) ?? false;
    this.landedInBowl = landedInBowl;
    if (landedInBowl) this.bowl.splash(finalLandingX);

    let finalScore = this.player.score ?? 0;
    if (typeof this.player.targetX === "number") {
      const targetXWorld = this.player.targetX * WORLD_WIDTH;
      const targetRadius = 0.056 * WORLD_WIDTH;
      const distance = Math.abs(finalLandingX - targetXWorld);
      if (distance <= targetRadius) {
        finalScore = distance === 0 ? 100 : Math.max(1, Math.round((1 - distance / targetRadius) * 99));
      } else {
        finalScore = 0;
      }
      if (this.scoreText) {
        this.scoreText.setText(`${finalScore} PUAN`);
      }
    }

    this.scene.tweens.add({
      targets: this.container,
      scaleY: this.displayScale * 0.82,
      scaleX: this.displayScale * 1.12,
      duration: 95,
      yoyo: true,
      ease: "Sine.inOut",
    });
    this.parachute.setVisible(false);
    this.landingShadow.setVisible(!landedInBowl);
    this.scene.tweens.add({
      targets: this.nameBackground,
      y: -166,
      duration: 220,
      ease: "Quad.out",
    });
    this.scene.tweens.add({
      targets: this.username,
      y: -67,
      duration: 220,
      ease: "Quad.out",
    });
    this.scoreBadge.setVisible(true);
    this.scene.tweens.add({
      targets: this.scoreBadge,
      scaleX: 1,
      scaleY: 1,
      duration: 330,
      ease: "Back.out",
    });
  }

  setDisplayScale(scale) {
    this.displayScale = scale;
    const targets = {
      scaleX: scale,
      scaleY: scale,
    };
    if (this.isLanded) targets.y = this.getLandingY();
    this.scene.tweens.add({
      targets: this.container,
      ...targets,
      duration: 260,
      ease: "Sine.inOut",
    });
  }

  getLandingY() {
    const contactY = this.landedInBowl ? BOWL_SURFACE_Y : GROUND_CONTACT_Y;
    return contactY - CHARACTER_CONTACT_OFFSET * this.displayScale;
  }

  destroy() {
    if (!this.container?.active) return;
    this.scene.tweens.killTweensOf(this.container);
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      scaleX: this.displayScale * 0.5,
      scaleY: this.displayScale * 0.5,
      duration: 320,
      onComplete: () => this.container.destroy(true),
    });
  }
}

class ParachuteScene extends Phaser.Scene {
  constructor() {
    super("ParachuteScene");
    this.socketBridge = new SocketBridge();
    this.activeEvent = null;
    this.bowl = null;
    this.players = new Set();
    this.windManager = null;
    this.obstacleManager = null;
  }

  preload() {
    this.load.svg("landing_bowl_svg", "/bowl.svg", { width: 600, height: 420 });
  }

  create() {
    this.windManager = new WindManager(this);
    this.obstacleManager = new ObstacleManager(this);

    this.socketBridge.connect({
      onConnected: () => undefined,
      onDisconnected: () => undefined,
      onEventStarted: (event) => this.startEvent(event),
      onEventEnded: ({ eventId }) => this.endEvent(eventId),
      onDrop: (player) => this.spawnPlayer(player),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.socketBridge.disconnect());
  }

  update(time, delta) {
    this.bowl?.update(time, delta);
    this.windManager?.update(time, delta);
    this.obstacleManager?.update(time, delta);

    const players = [...this.players];
    for (const player of players) player.updateFall(delta);
    for (let leftIndex = 0; leftIndex < players.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < players.length; rightIndex += 1) {
        players[leftIndex].collideWith(players[rightIndex], time);
      }
    }
    this.obstacleManager?.checkCollisions(players, time);
  }

  startEvent(event) {
    if (!event || this.activeEvent?.id === event.id) return;
    this.activeEvent = event;
    this.bowl?.destroy();
    this.bowl = new PinkLandingBowl(this, event.targetX * 1_920);
    if (event.wind) this.windManager?.setWind(event.wind);
    if (event.obstacles) this.obstacleManager?.initObstacles(event.obstacles);
  }

  endEvent(eventId) {
    if (this.activeEvent?.id !== eventId) return;
    this.activeEvent = null;
    this.bowl?.destroy();
    this.bowl = null;
    this.obstacleManager?.clear();
    for (const player of this.players) player.destroy();
    this.players.clear();
  }

  spawnPlayer(player) {
    if (!player || typeof player.username !== "string") return;
    if (!this.activeEvent && player.targetX) {
      this.startEvent({
        id: player.eventId,
        targetX: player.targetX,
        wind: player.wind,
        endsAt: new Date(Date.now() + 60_000).toISOString(),
      });
    } else if (player.wind) {
      this.windManager?.setWind(player.wind);
    }
    const playerCount = this.players.size + 1;
    const displayScale = this.getPlayerScale(playerCount);
    const parachutePlayer = new ParachutePlayer(this, player, this.bowl, displayScale);
    this.players.add(parachutePlayer);
    for (const activePlayer of this.players) activePlayer.setDisplayScale(displayScale);
  }

  getPlayerScale(playerCount) {
    return Phaser.Math.Clamp(10.5 / Math.max(1, playerCount), 0.09, PLAYER_SCALE);
  }

}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 1_920,
  height: 1_080,
  parent: "game-container",
  transparent: true,
  dom: {
    createContainer: true,
  },
  scene: [ParachuteScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    pixelArt: false,
    transparent: true,
  },
});
