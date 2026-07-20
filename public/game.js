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
    this.socket.on("connect", handlers.onConnected);
    this.socket.on("disconnect", handlers.onDisconnected);
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
    // Kase tabanı yayın kadrajının biraz dışında kalsın; sıvı yüzeyi görünür kalır.
    this.y = 1_035;
    this.container = scene.add.container(x, this.y).setDepth(4).setScale(0).setAlpha(0);
    this.sparkles = [];
    this.build();
    this.animateIn();
  }

  build() {
    const shadow = this.scene.add.ellipse(0, 78, 470, 62, 0x4d103d, 0.28);
    const glass = this.scene.add.graphics();
    glass.fillStyle(0xff7ccc, 0.2);
    glass.fillEllipse(0, 20, 440, 175);
    glass.lineStyle(7, 0xffb7e5, 0.92);
    glass.strokeEllipse(0, 20, 440, 175);

    const liquidBack = this.scene.add.ellipse(0, -18, 414, 102, 0x9d176f, 0.92);
    const liquid = this.scene.add.ellipse(0, -25, 388, 83, 0xff48b0, 0.95);
    const liquidGlow = this.scene.add.ellipse(-35, -39, 245, 38, 0xffb9e5, 0.34);
    const rim = this.scene.add.graphics();
    rim.lineStyle(9, 0xffd6ef, 0.96);
    rim.strokeEllipse(0, -21, 430, 112);
    rim.lineStyle(3, 0xffffff, 0.82);
    rim.strokeEllipse(0, -27, 395, 85);

    this.container.add([shadow, glass, liquidBack, liquid, liquidGlow, rim]);

    this.scene.tweens.add({
      targets: liquid,
      scaleX: 0.96,
      scaleY: 1.08,
      duration: 1_300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
    this.scene.tweens.add({
      targets: liquidGlow,
      x: 70,
      alpha: 0.16,
      duration: 1_700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    for (let index = 0; index < 22; index += 1) {
      const sparkle = this.scene.add.circle(
        -170 + ((index * 67) % 340),
        -49 + ((index * 29) % 54),
        2 + (index % 4),
        index % 3 === 0 ? 0xffffff : 0xffd0ec,
        0.35 + (index % 4) * 0.15,
      );
      this.sparkles.push(sparkle);
      this.container.add(sparkle);
      this.scene.tweens.add({
        targets: sparkle,
        y: sparkle.y - 16 - (index % 4) * 4,
        alpha: 0.08,
        scaleX: 0.25,
        scaleY: 0.25,
        duration: 650 + (index % 6) * 170,
        delay: (index % 7) * 110,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });
    }
  }

  animateIn() {
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      scaleX: BOWL_SCALE,
      scaleY: BOWL_SCALE,
      y: this.y - 18,
      duration: 650,
      ease: "Back.out",
    });
  }

  contains(worldX) {
    return Math.abs(worldX - this.x) <= 108;
  }

  splash(worldX) {
    const localX = Phaser.Math.Clamp(worldX - this.x, -100, 100);
    for (let index = 0; index < 14; index += 1) {
      const droplet = this.scene.add.circle(
        this.x + localX,
        this.y - 55,
        4 + (index % 4),
        index % 3 === 0 ? 0xffffff : 0xff4fb5,
        0.95,
      ).setDepth(13);
      const angle = Math.PI * (0.15 + (index / 13) * 0.7);
      const distance = 55 + (index % 5) * 18;
      this.scene.tweens.add({
        targets: droplet,
        x: droplet.x + Math.cos(angle) * distance,
        y: droplet.y - Math.sin(angle) * distance,
        alpha: 0,
        scaleX: 0.25,
        scaleY: 0.25,
        duration: 520 + (index % 3) * 100,
        ease: "Quad.out",
        onComplete: () => droplet.destroy(),
      });
    }

    this.scene.tweens.add({
      targets: this.container,
      scaleX: BOWL_SCALE * 1.045,
      scaleY: BOWL_SCALE * 0.94,
      duration: 120,
      yoyo: true,
      ease: "Sine.inOut",
    });
  }

  destroy() {
    if (!this.container?.active) return;
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      scaleX: BOWL_SCALE * 0.7,
      scaleY: BOWL_SCALE * 0.7,
      y: this.y + 40,
      duration: 420,
      ease: "Back.in",
      onComplete: () => this.container.destroy(true),
    });
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
    this.landedInBowl = false;
    this.velocityX = Number.isFinite(player.launchVelocityX)
      ? player.launchVelocityX * WORLD_WIDTH
      : (Math.random() < 0.5 ? -1 : 1) * (125 + Math.random() * 145);
    this.recoilX = 0;
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
    const remainingSeconds = Math.max((this.fallDuration - this.fallElapsed) / 1_000, 0.28);

    if (Math.abs(this.recoilX) > 0.1) {
      this.recoilX *= Math.pow(0.85, deltaSeconds * 60);
    } else {
      this.recoilX = 0;
    }

    const desiredVelocity = (this.landingX - this.container.x) / remainingSeconds;
    const steeringStrength = progress < 0.68 ? 90 : 320;
    const velocityChange = Phaser.Math.Clamp(
      desiredVelocity - this.velocityX,
      -steeringStrength * deltaSeconds,
      steeringStrength * deltaSeconds,
    );

    this.velocityX += velocityChange;
    this.container.x += (this.velocityX + this.recoilX) * deltaSeconds;
    if (this.container.x <= AIRBORNE_MIN_X || this.container.x >= AIRBORNE_MAX_X) {
      this.container.x = Phaser.Math.Clamp(this.container.x, AIRBORNE_MIN_X, AIRBORNE_MAX_X);
      this.velocityX *= -0.72;
      this.recoilX *= -0.5;
    }

    const targetLandingY = this.getLandingY();
    this.container.y = Phaser.Math.Linear(-145, targetLandingY, Math.pow(progress, 0.95));

    if (Math.abs(this.tiltAngle) > 0.1) {
      this.tiltAngle *= Math.pow(0.88, deltaSeconds * 60);
    } else {
      this.tiltAngle = 0;
    }

    const sway = Math.sin(progress * Math.PI * 7) * 2.5;
    this.container.angle = Phaser.Math.Clamp(this.velocityX / 34 + this.tiltAngle, -25, 25) + sway;

    if (progress >= 1) this.land();
  }

  collideWith(other, now) {
    if (!this.isAirborne || !other.isAirborne) return;
    if (now - this.lastCollisionAt < 120 || now - other.lastCollisionAt < 120) return;

    const horizontalRadius = 56 * (this.displayScale + other.displayScale);
    const verticalRadius = 80 * (this.displayScale + other.displayScale);
    const deltaX = other.container.x - this.container.x;
    const deltaY = other.container.y - this.container.y;
    if (Math.abs(deltaX) >= horizontalRadius || Math.abs(deltaY) >= verticalRadius) return;

    const direction = deltaX === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(deltaX);
    const overlap = horizontalRadius - Math.abs(deltaX);

    this.container.x -= direction * overlap * 0.5;
    other.container.x += direction * overlap * 0.5;

    const incomingSpeed = Math.abs((this.velocityX + this.recoilX) - (other.velocityX + other.recoilX));
    const impulseStrength = Phaser.Math.Clamp(140 + incomingSpeed * 0.75 + overlap * 5, 160, 420);

    this.recoilX = -direction * impulseStrength * 1.15;
    other.recoilX = direction * impulseStrength * 1.15;

    this.velocityX = -direction * impulseStrength * 0.6;
    other.velocityX = direction * impulseStrength * 0.6;

    this.tiltAngle = -direction * Math.min(28, impulseStrength * 0.1);
    other.tiltAngle = direction * Math.min(28, impulseStrength * 0.1);

    const deflection = direction * (impulseStrength * 0.45 + overlap * 2.2);
    this.landingX = Phaser.Math.Clamp(this.landingX - deflection, AIRBORNE_MIN_X, AIRBORNE_MAX_X);
    other.landingX = Phaser.Math.Clamp(other.landingX + deflection, AIRBORNE_MIN_X, AIRBORNE_MAX_X);

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

    if (typeof this.player.targetX === "number") {
      const targetXWorld = this.player.targetX * WORLD_WIDTH;
      const targetRadius = 0.056 * WORLD_WIDTH;
      const distance = Math.abs(finalLandingX - targetXWorld);
      let calculatedScore = 0;
      if (distance <= targetRadius) {
        calculatedScore = distance === 0 ? 100 : Math.max(1, Math.round((1 - distance / targetRadius) * 99));
      }
      if (this.scoreText) {
        this.scoreText.setText(`${calculatedScore} PUAN`);
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
  }

  create() {
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
    const players = [...this.players];
    for (const player of players) player.updateFall(delta);
    for (let leftIndex = 0; leftIndex < players.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < players.length; rightIndex += 1) {
        players[leftIndex].collideWith(players[rightIndex], time);
      }
    }
  }

  startEvent(event) {
    if (!event || this.activeEvent?.id === event.id) return;
    this.activeEvent = event;
    this.bowl?.destroy();
    this.bowl = new PinkLandingBowl(this, event.targetX * 1_920);
  }

  endEvent(eventId) {
    if (this.activeEvent?.id !== eventId) return;
    this.activeEvent = null;
    this.bowl?.destroy();
    this.bowl = null;
    for (const player of this.players) player.destroy();
    this.players.clear();
  }

  spawnPlayer(player) {
    if (!player || typeof player.username !== "string") return;
    if (!this.activeEvent && player.targetX) {
      this.startEvent({
        id: player.eventId,
        targetX: player.targetX,
        endsAt: new Date(Date.now() + 60_000).toISOString(),
      });
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
