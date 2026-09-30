/**
 * GRAVITY LAB - 2D Physics Puzzle Game (Matter.js)
 * 物理演算を利用してボールをゴールまで運ぶパズルゲーム
 *
 * 【維持・活用している物理演算機能】
 * - 重力 (Gravity) & パラメータリアルタイム変更 (0G〜2.5G)
 * - 衝突 (Collision) & 反発 (Restitution) & 摩擦 (Friction)
 * - 質量・密度 (Mass / Density)
 * - MouseConstraint による掴む・動かす・投げる挙動 (プレイヤーは物体を動かしボールを導く)
 * - 複数物体の相互作用 (シーソー・ドミノ連鎖・跳ね橋・積み木)
 * - 衝突エフェクト (ParticleSystem) & サウンド合成 (Web Audio API)
 */

// ============================================================================
// 1. CONSTANTS & THEME
// ============================================================================
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 650;
const WALL_THICKNESS = 80;

const THEME = {
  bg: '#0a0e17',
  wallFill: '#1e293b',
  wallStroke: '#334155',
  gateFill: '#0284c7',
  gateStroke: '#38bdf8',

  mainBall: {
    fill: '#38bdf8',
    stroke: '#ffffff',
    glow: '#38bdf8',
    radius: 18,
    restitution: 0.65,
    friction: 0.05,
    density: 0.002
  },

  box: {
    fill: '#f59e0b',
    stroke: '#fef3c7',
    restitution: 0.25,
    friction: 0.40,
    density: 0.002
  },

  triangle: {
    fill: '#10b981',
    stroke: '#a7f3d0',
    restitution: 0.35,
    friction: 0.25,
    density: 0.0025
  },

  heavy: {
    fill: '#334155',
    stroke: '#94a3b8',
    restitution: 0.08,
    friction: 0.50,
    density: 0.08 // 超高密度（通常の40倍）
  },

  bouncer: {
    fill: '#ec4899',
    stroke: '#fbcfe8',
    restitution: 1.55, // 超高反発トランポリン
    friction: 0.02,
    density: 0.005
  },

  goal: {
    outer: '#10b981',
    inner: '#6ee7b7',
    glow: 'rgba(16, 185, 129, 0.4)',
    radius: 36
  }
};

// ============================================================================
// 2. AUDIO SYNTHESIS ENGINE (Web Audio API)
// ============================================================================
class SoundEffects {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.lastSoundTime = 0;
    this.soundThrottleMs = 35;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playClick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(800, t + 0.04);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.04);
    } catch (e) {}
  }

  playImpact(strength, isHeavy = false, isBouncer = false) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = performance.now();
    if (now - this.lastSoundTime < this.soundThrottleMs) return;
    this.lastSoundTime = now;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      if (isBouncer) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260, t);
        osc.frequency.exponentialRampToValueAtTime(700, t + 0.16);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.2);
      } else if (isHeavy) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(35, t + 0.22);
        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.25);
      } else {
        osc.type = 'triangle';
        const startFreq = 250 + Math.min(strength * 30, 300);
        osc.frequency.setValueAtTime(startFreq, t);
        osc.frequency.exponentialRampToValueAtTime(90, t + 0.08);
        const volume = Math.min(0.06 + (strength / 15) * 0.18, 0.28);
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.09);
      }
    } catch (e) {}
  }

  playRelease() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(550, t + 0.14);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    } catch (e) {}
  }

  playGoal() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.50];
      const startT = this.ctx.currentTime;
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const noteTime = startT + idx * 0.09;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteTime);
        gain.gain.setValueAtTime(0.2, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(noteTime);
        osc.stop(noteTime + 0.35);
      });
    } catch (e) {}
  }

  playGameOver() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, t);
      osc.frequency.exponentialRampToValueAtTime(65, t + 0.35);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.38);
    } catch (e) {}
  }
}

// ============================================================================
// 3. VISUAL EFFECTS ENGINE (Particles, Shockwaves, Confetti)
// ============================================================================
class ParticleSystem {
  constructor() {
    this.particles = [];
    this.shockwaves = [];
  }

  addImpact(x, y, strength, isHeavy = false, isBouncer = false) {
    this.shockwaves.push({
      x,
      y,
      radius: 4,
      maxRadius: isBouncer ? 55 : (isHeavy ? 50 : 25),
      alpha: 1.0,
      color: isBouncer ? '#ec4899' : (isHeavy ? '#f8fafc' : '#38bdf8'),
      lineWidth: isHeavy ? 3.5 : 2
    });

    const count = isBouncer ? 16 : (isHeavy ? 14 : 7);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 3 + 1.5) * (isHeavy || isBouncer ? 2.0 : 1.0);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: Math.random() * 0.05 + 0.03,
        size: Math.random() * 3.5 + 1.5,
        color: isBouncer ? '#f472b6' : (isHeavy ? '#94a3b8' : '#67e8f9')
      });
    }
  }

  addGoalConfetti(x, y) {
    const colors = ['#10b981', '#38bdf8', '#fbbf24', '#ec4899', '#a855f7', '#ffffff'];
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.5,
        life: 1.0,
        decay: Math.random() * 0.02 + 0.015,
        size: Math.random() * 5 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        isConfetti: true
      });
    }
  }

  updateAndDraw(ctx) {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.radius += (s.maxRadius - s.radius) * 0.2 + 0.8;
      s.alpha -= 0.055;
      if (s.alpha <= 0 || s.radius >= s.maxRadius) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = Math.max(0, s.alpha);
      ctx.lineWidth = s.lineWidth;
      ctx.stroke();
      ctx.restore();
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.isConfetti ? 0.15 : 0.08;
      p.vx *= 0.98;
      p.life -= p.decay;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  clear() {
    this.particles = [];
    this.shockwaves = [];
  }
}

// ============================================================================
// 4. MAIN PHYSICS GAME ENGINE CLASS
// ============================================================================
class GravityLabGame {
  constructor() {
    this.Engine = Matter.Engine;
    this.Render = Matter.Render;
    this.Runner = Matter.Runner;
    this.World = Matter.World;
    this.Bodies = Matter.Bodies;
    this.Body = Matter.Body;
    this.Composite = Matter.Composite;
    this.Constraint = Matter.Constraint;
    this.Mouse = Matter.Mouse;
    this.MouseConstraint = Matter.MouseConstraint;
    this.Events = Matter.Events;
    this.Vector = Matter.Vector;

    this.engine = null;
    this.render = null;
    this.runner = null;
    this.mouseConstraint = null;
    this.sound = new SoundEffects();
    this.vfx = new ParticleSystem();

    this.gameState = 'TITLE';
    this.currentStage = 1;
    this.totalStages = 5;
    this.totalScore = 0;
    this.stageScores = [0, 0, 0, 0, 0];

    this.stageStartTime = 0;
    this.elapsedSeconds = 0;
    this.movesCount = 0;
    this.retriesCount = 0;

    this.mainBall = null;
    this.ballPin = null;
    this.goalSensor = null;
    this.gateBody = null;
    this.draggableBodies = [];
    this.ballInitialPos = { x: 100, y: 120 };
    this.goalPos = { x: 900, y: 550 };

    this.gravityVal = 1.0;
    this.bounceMultiplier = 1.0;
    this.frictionMultiplier = 1.0;
    this.timeScaleVal = 1.0;

    this.frameCount = 0;
    this.fps = 60;
    this.lastFpsUpdate = performance.now();

    this.dom = {
      container: document.getElementById('canvas-container'),
      uiStage: document.getElementById('ui-stage'),
      uiScore: document.getElementById('ui-score'),
      uiTimer: document.getElementById('ui-timer'),
      uiMoves: document.getElementById('ui-moves'),
      statFps: document.getElementById('stat-fps'),
      statGravity: document.getElementById('stat-gravity'),
      stageHintText: document.getElementById('stage-hint-text'),
      stageBtns: document.querySelectorAll('.stage-btn'),

      btnStartGame: document.getElementById('btn-start-game'),
      btnRelease: document.getElementById('btn-release'),
      btnRetry: document.getElementById('btn-retry'),
      btnReset: document.getElementById('btn-reset'),
      btnNext: document.getElementById('btn-next'),
      btnSound: document.getElementById('btn-sound'),
      btnToggleTweaks: document.getElementById('btn-toggle-tweaks'),
      tweaksPanel: document.getElementById('tweaks-panel'),

      screenTitle: document.getElementById('screen-title'),
      screenClear: document.getElementById('screen-clear'),
      screenGameOver: document.getElementById('screen-gameover'),
      screenVictory: document.getElementById('screen-victory'),

      clearTimeVal: document.getElementById('clear-time-val'),
      clearMovesVal: document.getElementById('clear-moves-val'),
      clearRetriesVal: document.getElementById('clear-retries-val'),
      clearScoreVal: document.getElementById('clear-score-val'),
      clearTotalScoreVal: document.getElementById('clear-total-score-val'),
      clearStars: document.getElementById('clear-stars'),
      btnModalRetry: document.getElementById('btn-modal-retry'),
      btnModalNext: document.getElementById('btn-modal-next'),
      btnModalGameOverRetry: document.getElementById('btn-modal-gameover-retry'),
      victoryFinalScore: document.getElementById('victory-final-score'),
      btnPlayAgain: document.getElementById('btn-play-again'),

      sliderGravity: document.getElementById('slider-gravity'),
      sliderBounce: document.getElementById('slider-bounce'),
      sliderFriction: document.getElementById('slider-friction'),
      sliderTimescale: document.getElementById('slider-timescale'),
      valGravity: document.getElementById('val-gravity'),
      valBounce: document.getElementById('val-bounce'),
      valFriction: document.getElementById('val-friction'),
      valTimescale: document.getElementById('val-timescale')
    };

    this.init();
  }

  init() {
    this.engine = this.Engine.create({
      enableSleeping: false,
      positionIterations: 8,
      velocityIterations: 8
    });
    this.engine.gravity.y = this.gravityVal;

    this.render = this.Render.create({
      element: this.dom.container,
      engine: this.engine,
      options: {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        wireframes: false,
        background: THEME.bg,
        showVelocity: false,
        showAngleIndicator: false
      }
    });
    this.Render.run(this.render);

    this.runner = this.Runner.create();
    this.Runner.run(this.runner, this.engine);

    this.setupMouseInteraction();
    this.setupPhysicsEvents();
    this.setupUIEvents();
    this.loadStage(1, false);
    this.startLoop();
  }

  setupMouseInteraction() {
    const mouse = this.Mouse.create(this.render.canvas);
    this.render.mouse = mouse;

    this.mouseConstraint = this.MouseConstraint.create(this.engine, {
      mouse: mouse,
      constraint: {
        stiffness: 0.25,
        damping: 0.05,
        render: {
          visible: true,
          lineWidth: 2,
          strokeStyle: '#10b981'
        }
      }
    });

    this.World.add(this.engine.world, this.mouseConstraint);

    this.Events.on(this.mouseConstraint, 'startdrag', (evt) => {
      this.sound.init();
      const body = evt.body;

      if (!body || body.isStatic || body.isMainBall || !body.isDraggable) {
        this.mouseConstraint.body = null;
        this.mouseConstraint.constraint.bodyB = null;
        return;
      }

      this.movesCount++;
      this.dom.uiMoves.textContent = this.movesCount;
      this.sound.playClick();
    });

    const canvas = this.render.canvas;
    canvas.addEventListener('mousemove', () => {
      if (this.mouseConstraint && this.mouseConstraint.body) {
        canvas.style.cursor = 'grabbing';
      } else {
        const mousePos = this.mouseConstraint.mouse.position;
        const bodies = this.Composite.allBodies(this.engine.world);
        const hovered = Matter.Query.point(bodies, mousePos).find(b => b.isDraggable && !b.isStatic && !b.isMainBall);
        canvas.style.cursor = hovered ? 'grab' : 'default';
      }
    });
  }

  setupPhysicsEvents() {
    this.Events.on(this.engine, 'collisionStart', (event) => {
      const pairs = event.pairs;
      for (let i = 0; i < pairs.length; i++) {
        const { bodyA, bodyB } = pairs[i];

        const isGoalContact = (bodyA === this.mainBall && bodyB === this.goalSensor) ||
                              (bodyB === this.mainBall && bodyA === this.goalSensor);
        if (isGoalContact && (this.gameState === 'READY' || this.gameState === 'ROLLING')) {
          this.handleStageClear();
          return;
        }

        const vx = bodyA.velocity.x - bodyB.velocity.x;
        const vy = bodyA.velocity.y - bodyB.velocity.y;
        const relSpeed = Math.sqrt(vx * vx + vy * vy);

        if (relSpeed > 1.2) {
          const isHeavy = (bodyA.density >= 0.05 || bodyB.density >= 0.05);
          const isBouncer = (bodyA.isBouncer || bodyB.isBouncer);

          let hitX = (bodyA.position.x + bodyB.position.x) / 2;
          let hitY = (bodyA.position.y + bodyB.position.y) / 2;
          if (pairs[i].collision && pairs[i].collision.supports && pairs[i].collision.supports.length > 0) {
            hitX = pairs[i].collision.supports[0].x;
            hitY = pairs[i].collision.supports[0].y;
          }

          this.vfx.addImpact(hitX, hitY, relSpeed, isHeavy, isBouncer);
          this.sound.playImpact(relSpeed, isHeavy, isBouncer);

          if (isBouncer) {
            const ballBody = (bodyA === this.mainBall ? bodyA : (bodyB === this.mainBall ? bodyB : null));
            if (ballBody) {
              const normalY = Math.min(ballBody.velocity.y, -7);
              this.Body.setVelocity(ballBody, {
                x: ballBody.velocity.x * 1.25,
                y: normalY * 1.3
              });
            }
          }
        }
      }
    });

    this.Events.on(this.render, 'afterRender', () => {
      const ctx = this.render.context;
      if (!ctx) return;

      const time = performance.now() * 0.003;

      if (this.goalPos) {
        ctx.save();
        const gx = this.goalPos.x;
        const gy = this.goalPos.y;
        const radius = THEME.goal.radius;

        const pulse = Math.sin(time * 2) * 4;
        ctx.beginPath();
        ctx.arc(gx, gy, radius + pulse, 0, Math.PI * 2);
        ctx.fillStyle = THEME.goal.glow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(gx, gy, radius + 2, 0, Math.PI * 2);
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -time * 20;
        ctx.strokeStyle = THEME.goal.outer;
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(gx, gy, radius * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = THEME.goal.inner;
        ctx.globalAlpha = 0.85;
        ctx.fill();

        ctx.setLineDash([]);
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GOAL', gx, gy);
        ctx.restore();
      }

      const bodies = this.Composite.allBodies(this.engine.world);
      bodies.forEach(body => {
        if (body.isDraggable && !body.isStatic && !body.isMainBall) {
          ctx.save();
          ctx.beginPath();
          const vertices = body.vertices;
          ctx.moveTo(vertices[0].x, vertices[0].y);
          for (let j = 1; j < vertices.length; j++) {
            ctx.lineTo(vertices[j].x, vertices[j].y);
          }
          ctx.closePath();

          const isHoveredOrDragged = (this.mouseConstraint && this.mouseConstraint.body === body);
          if (isHoveredOrDragged) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 14;
            ctx.stroke();
          } else {
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.lineDashOffset = -time * 15;
            ctx.stroke();
          }

          ctx.setLineDash([]);
          ctx.font = '10px "JetBrains Mono", sans-serif';
          ctx.fillStyle = isHoveredOrDragged ? '#38bdf8' : 'rgba(255,255,255,0.7)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('✋ MOVE', body.position.x, body.position.y);
          ctx.restore();
        }
      });

      if (this.mainBall) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.mainBall.position.x, this.mainBall.position.y, THEME.mainBall.radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
      }

      this.vfx.updateAndDraw(ctx);
    });
  }

  setupUIEvents() {
    this.dom.btnStartGame.addEventListener('click', () => {
      this.sound.playClick();
      this.dom.screenTitle.classList.remove('active');
      this.loadStage(1, true);
    });

    this.dom.btnRelease.addEventListener('click', () => {
      this.releaseBall();
    });

    this.dom.btnRetry.addEventListener('click', () => {
      this.sound.playClick();
      this.retryStage();
    });

    this.dom.btnReset.addEventListener('click', () => {
      this.sound.playClick();
      this.loadStage(this.currentStage, true);
    });

    this.dom.btnNext.addEventListener('click', () => {
      this.sound.playClick();
      this.nextStage();
    });

    this.dom.btnModalRetry.addEventListener('click', () => {
      this.sound.playClick();
      this.dom.screenClear.classList.remove('active');
      this.retryStage();
    });

    this.dom.btnModalNext.addEventListener('click', () => {
      this.sound.playClick();
      this.dom.screenClear.classList.remove('active');
      this.nextStage();
    });

    this.dom.btnModalGameOverRetry.addEventListener('click', () => {
      this.sound.playClick();
      this.dom.screenGameOver.classList.remove('active');
      this.retryStage();
    });

    this.dom.btnPlayAgain.addEventListener('click', () => {
      this.sound.playClick();
      this.dom.screenVictory.classList.remove('active');
      this.totalScore = 0;
      this.stageScores = [0, 0, 0, 0, 0];
      this.loadStage(1, true);
    });

    this.dom.stageBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.sound.playClick();
        const stage = parseInt(btn.dataset.stage, 10);
        this.dom.screenTitle.classList.remove('active');
        this.dom.screenClear.classList.remove('active');
        this.dom.screenGameOver.classList.remove('active');
        this.dom.screenVictory.classList.remove('active');
        this.loadStage(stage, true);
      });
    });

    this.dom.btnSound.addEventListener('click', () => {
      this.sound.enabled = !this.sound.enabled;
      if (this.sound.enabled) {
        this.sound.init();
        this.dom.btnSound.innerHTML = '<span class="btn-icon">🔊</span>';
        this.dom.btnSound.classList.remove('btn-secondary');
        this.dom.btnSound.classList.add('btn-primary');
      } else {
        this.dom.btnSound.innerHTML = '<span class="btn-icon">🔇</span>';
        this.dom.btnSound.classList.remove('btn-primary');
        this.dom.btnSound.classList.add('btn-secondary');
      }
    });

    this.dom.btnToggleTweaks.addEventListener('click', () => {
      this.dom.tweaksPanel.classList.toggle('collapsed');
    });

    this.dom.sliderGravity.addEventListener('input', (e) => {
      this.gravityVal = parseFloat(e.target.value);
      this.engine.gravity.y = this.gravityVal;
      this.dom.valGravity.textContent = this.gravityVal.toFixed(2);
      this.dom.statGravity.textContent = `${this.gravityVal.toFixed(2)} G`;
    });

    this.dom.sliderBounce.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.dom.valBounce.textContent = val.toFixed(2);
      this.bounceMultiplier = val / 0.70;
      this.updateBodiesPhysicalProps();
    });

    this.dom.sliderFriction.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.dom.valFriction.textContent = val.toFixed(2);
      this.frictionMultiplier = val / 0.10;
      this.updateBodiesPhysicalProps();
    });

    this.dom.sliderTimescale.addEventListener('input', (e) => {
      this.timeScaleVal = parseFloat(e.target.value);
      this.engine.timing.timeScale = this.timeScaleVal;
      this.dom.valTimescale.textContent = `${this.timeScaleVal.toFixed(2)}x`;
    });
  }

  updateBodiesPhysicalProps() {
    const bodies = this.Composite.allBodies(this.engine.world);
    const bounceInput = parseFloat(this.dom.sliderBounce.value);
    const frictionInput = parseFloat(this.dom.sliderFriction.value);

    bodies.forEach(body => {
      if (!body.isStatic && body.baseType) {
        const base = THEME[body.baseType];
        if (base) {
          body.restitution = Math.min(Math.max(base.restitution * (bounceInput / 0.7), 0), 1.8);
          body.friction = Math.min(Math.max(base.friction * (frictionInput / 0.1), 0), 1.0);
        }
      }
    });
  }

  lockMainBall() {
    if (!this.mainBall) return;
    if (this.ballPin) {
      this.World.remove(this.engine.world, this.ballPin);
      this.ballPin = null;
    }
    this.Body.setPosition(this.mainBall, { x: this.ballInitialPos.x, y: this.ballInitialPos.y });
    this.Body.setVelocity(this.mainBall, { x: 0, y: 0 });
    this.Body.setAngularVelocity(this.mainBall, 0);
    this.Body.setAngle(this.mainBall, 0);

    this.ballPin = this.Constraint.create({
      pointA: { x: this.ballInitialPos.x, y: this.ballInitialPos.y },
      bodyB: this.mainBall,
      pointB: { x: 0, y: 0 },
      stiffness: 1,
      length: 0,
      render: { visible: false }
    });
    this.World.add(this.engine.world, this.ballPin);
  }

  releaseBall() {
    if (this.gameState !== 'READY') return;

    this.sound.playRelease();
    this.gameState = 'ROLLING';
    this.dom.btnRelease.disabled = true;

    if (this.ballPin) {
      this.World.remove(this.engine.world, this.ballPin);
      this.ballPin = null;
    }

    if (this.gateBody) {
      this.World.remove(this.engine.world, this.gateBody);
      this.gateBody = null;
    }

    if (this.mainBall) {
      this.Body.setVelocity(this.mainBall, { x: 2.2, y: 0.5 });
    }
  }

  retryStage() {
    this.retriesCount++;
    this.gameState = 'READY';
    this.dom.btnRelease.disabled = false;
    this.dom.btnNext.disabled = true;

    this.lockMainBall();
    this.setupGate();
  }

  nextStage() {
    if (this.currentStage < this.totalStages) {
      this.loadStage(this.currentStage + 1, true);
    } else {
      this.showVictoryScreen();
    }
  }

  handleStageClear() {
    this.gameState = 'CLEAR';
    this.sound.playGoal();
    this.vfx.addGoalConfetti(this.goalPos.x, this.goalPos.y);

    const timeScore = Math.max(0, 5000 - Math.floor(this.elapsedSeconds * 70));
    const moveScore = Math.max(0, 3000 - (this.movesCount * 180));
    const retryPenalty = Math.max(0, 2000 - (this.retriesCount * 400));
    const stageScore = 1000 + timeScore + moveScore + retryPenalty;

    this.stageScores[this.currentStage - 1] = stageScore;
    this.totalScore = this.stageScores.reduce((a, b) => a + b, 0);

    this.dom.uiScore.textContent = this.totalScore.toLocaleString();
    this.dom.clearTimeVal.textContent = this.formatTime(this.elapsedSeconds);
    this.dom.clearMovesVal.textContent = `${this.movesCount} 回`;
    this.dom.clearRetriesVal.textContent = `${this.retriesCount} 回`;
    this.dom.clearScoreVal.textContent = stageScore.toLocaleString();
    this.dom.clearTotalScoreVal.textContent = this.totalScore.toLocaleString();

    const stars = this.dom.clearStars.querySelectorAll('.star');
    stars.forEach(s => s.classList.remove('active'));
    if (stageScore >= 7500) {
      stars[0].classList.add('active');
      stars[1].classList.add('active');
      stars[2].classList.add('active');
    } else if (stageScore >= 4500) {
      stars[0].classList.add('active');
      stars[1].classList.add('active');
    } else {
      stars[0].classList.add('active');
    }

    this.dom.btnNext.disabled = false;

    setTimeout(() => {
      this.dom.screenClear.classList.add('active');
    }, 600);
  }

  handleGameOver() {
    if (this.gameState !== 'ROLLING') return;

    this.gameState = 'GAMEOVER';
    this.sound.playGameOver();
    this.dom.screenGameOver.classList.add('active');
  }

  showVictoryScreen() {
    this.gameState = 'VICTORY';
    this.sound.playGoal();
    this.dom.victoryFinalScore.textContent = this.totalScore.toLocaleString();
    this.dom.screenVictory.classList.add('active');
  }

  clearWorld() {
    this.World.clear(this.engine.world, false);
    this.vfx.clear();
    this.draggableBodies = [];
    this.mainBall = null;
    this.ballPin = null;
    this.goalSensor = null;
    this.gateBody = null;

    if (this.mouseConstraint) {
      this.World.add(this.engine.world, this.mouseConstraint);
    }
  }

  loadStage(stageNum, startPlaying = true) {
    this.currentStage = stageNum;
    this.clearWorld();

    this.stageStartTime = performance.now();
    this.elapsedSeconds = 0;
    this.movesCount = 0;
    this.retriesCount = 0;
    this.gameState = 'READY';

    this.dom.uiStage.textContent = `${this.currentStage} / ${this.totalStages}`;
    this.dom.uiTimer.textContent = '00:00.0';
    this.dom.uiMoves.textContent = '0';
    this.dom.btnRelease.disabled = false;
    this.dom.btnNext.disabled = true;

    this.dom.stageBtns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.stage, 10) === stageNum);
    });

    this.buildEnclosure();

    switch (stageNum) {
      case 1:
        this.buildStage1();
        break;
      case 2:
        this.buildStage2();
        break;
      case 3:
        this.buildStage3();
        break;
      case 4:
        this.buildStage4();
        break;
      case 5:
        this.buildStage5();
        break;
      default:
        this.buildStage1();
        break;
    }

    this.setupMainBall();
    this.setupGoalSensor();
    this.setupGate();
  }

  buildEnclosure() {
    const wallOpts = {
      isStatic: true,
      render: { fillStyle: THEME.wallFill, strokeStyle: THEME.wallStroke, lineWidth: 2 },
      friction: 0.2,
      restitution: 0.3
    };

    const ceiling = this.Bodies.rectangle(CANVAS_WIDTH / 2, -WALL_THICKNESS / 2 + 10, CANVAS_WIDTH + 200, WALL_THICKNESS, wallOpts);
    const leftWall = this.Bodies.rectangle(-WALL_THICKNESS / 2 + 10, CANVAS_HEIGHT / 2, WALL_THICKNESS, CANVAS_HEIGHT + 200, wallOpts);
    const rightWall = this.Bodies.rectangle(CANVAS_WIDTH + WALL_THICKNESS / 2 - 10, CANVAS_HEIGHT / 2, WALL_THICKNESS, CANVAS_HEIGHT + 200, wallOpts);

    this.World.add(this.engine.world, [ceiling, leftWall, rightWall]);
  }

  setupMainBall() {
    this.mainBall = this.Bodies.circle(this.ballInitialPos.x, this.ballInitialPos.y, THEME.mainBall.radius, {
      isStatic: false,
      restitution: THEME.mainBall.restitution,
      friction: THEME.mainBall.friction,
      frictionAir: 0.001,
      density: THEME.mainBall.density,
      render: {
        fillStyle: THEME.mainBall.fill,
        strokeStyle: THEME.mainBall.stroke,
        lineWidth: 2.5
      }
    });
    this.mainBall.isMainBall = true;
    this.mainBall.isDraggable = false;
    this.mainBall.baseType = 'mainBall';
    this.World.add(this.engine.world, this.mainBall);

    this.lockMainBall();
  }

  setupGoalSensor() {
    this.goalSensor = this.Bodies.circle(this.goalPos.x, this.goalPos.y, THEME.goal.radius * 0.8, {
      isStatic: true,
      isSensor: true,
      render: { visible: false }
    });
    this.goalSensor.isGoalSensor = true;
    this.World.add(this.engine.world, this.goalSensor);
  }

  setupGate() {
    if (this.gateBody) {
      this.World.remove(this.engine.world, this.gateBody);
    }
    this.gateBody = this.Bodies.rectangle(this.ballInitialPos.x + 30, this.ballInitialPos.y, 10, 40, {
      isStatic: true,
      render: { fillStyle: THEME.gateFill, strokeStyle: THEME.gateStroke, lineWidth: 2 }
    });
    this.World.add(this.engine.world, this.gateBody);
  }

  createDraggableBox(x, y, w, h, opts = {}) {
    const box = this.Bodies.rectangle(x, y, w, h, {
      restitution: opts.restitution !== undefined ? opts.restitution : THEME.box.restitution,
      friction: opts.friction !== undefined ? opts.friction : THEME.box.friction,
      density: opts.density !== undefined ? opts.density : THEME.box.density,
      render: {
        fillStyle: opts.color || THEME.box.fill,
        strokeStyle: opts.stroke || THEME.box.stroke,
        lineWidth: 2
      },
      ...opts
    });
    box.isDraggable = true;
    box.baseType = 'box';
    this.draggableBodies.push(box);
    this.World.add(this.engine.world, box);
    return box;
  }

  createDraggableTriangle(x, y, radius, opts = {}) {
    const tri = this.Bodies.polygon(x, y, 3, radius, {
      restitution: opts.restitution !== undefined ? opts.restitution : THEME.triangle.restitution,
      friction: opts.friction !== undefined ? opts.friction : THEME.triangle.friction,
      density: opts.density !== undefined ? opts.density : THEME.triangle.density,
      render: {
        fillStyle: opts.color || THEME.triangle.fill,
        strokeStyle: opts.stroke || THEME.triangle.stroke,
        lineWidth: 2
      },
      ...opts
    });
    tri.isDraggable = true;
    tri.baseType = 'triangle';
    this.draggableBodies.push(tri);
    this.World.add(this.engine.world, tri);
    return tri;
  }

  createDraggableHeavyBall(x, y, radius = 38, opts = {}) {
    const heavy = this.Bodies.circle(x, y, radius, {
      restitution: THEME.heavy.restitution,
      friction: THEME.heavy.friction,
      density: THEME.heavy.density,
      render: {
        fillStyle: THEME.heavy.fill,
        strokeStyle: THEME.heavy.stroke,
        lineWidth: 3.5
      },
      ...opts
    });
    heavy.isDraggable = true;
    heavy.baseType = 'heavy';
    this.draggableBodies.push(heavy);
    this.World.add(this.engine.world, heavy);
    return heavy;
  }

  createDraggableBouncer(x, y, w, h, opts = {}) {
    const bouncer = this.Bodies.rectangle(x, y, w, h, {
      restitution: THEME.bouncer.restitution,
      friction: THEME.bouncer.friction,
      density: THEME.bouncer.density,
      render: {
        fillStyle: THEME.bouncer.fill,
        strokeStyle: THEME.bouncer.stroke,
        lineWidth: 3
      },
      ...opts
    });
    bouncer.isDraggable = true;
    bouncer.isBouncer = true;
    bouncer.baseType = 'bouncer';
    this.draggableBodies.push(bouncer);
    this.World.add(this.engine.world, bouncer);
    return bouncer;
  }

  // ==========================================================================
  // ステージ 1: 「Slope & Gap」 (基本ステージ)
  // ==========================================================================
  buildStage1() {
    this.ballInitialPos = { x: 100, y: 120 };
    this.goalPos = { x: 900, y: 550 };
    this.dom.stageHintText.textContent = '💡 動かせるブロックをドラッグして穴を塞ぎ、ボールをゴールへ導こう！';

    const world = this.engine.world;
    const wallStyle = { fillStyle: '#1e293b', strokeStyle: '#38bdf8', lineWidth: 2 };

    const slope1 = this.Bodies.rectangle(230, 200, 320, 20, {
      isStatic: true,
      angle: Math.PI * 0.08,
      render: wallStyle
    });

    const slope2 = this.Bodies.rectangle(780, 560, 300, 20, {
      isStatic: true,
      render: wallStyle
    });

    const backWall = this.Bodies.rectangle(960, 520, 20, 100, {
      isStatic: true,
      render: wallStyle
    });

    this.World.add(world, [slope1, slope2, backWall]);

    this.createDraggableBox(520, 280, 120, 24, { color: '#f59e0b' });
    this.createDraggableBox(400, 120, 50, 50, { color: '#fbbf24' });
  }

  // ==========================================================================
  // ステージ 2: 「Block Bridge」 (動かせるブロックを追加・積み木)
  // ==========================================================================
  buildStage2() {
    this.ballInitialPos = { x: 90, y: 100 };
    this.goalPos = { x: 880, y: 530 };
    this.dom.stageHintText.textContent = '💡 複数のブロックを積み重ねて谷を越える橋やスロープを作ろう！';

    const world = this.engine.world;
    const wallStyle = { fillStyle: '#1e293b', strokeStyle: '#38bdf8', lineWidth: 2 };

    const slope1 = this.Bodies.rectangle(200, 170, 260, 20, {
      isStatic: true,
      angle: Math.PI * 0.1,
      render: wallStyle
    });

    const pitLeft = this.Bodies.rectangle(350, 480, 20, 240, { isStatic: true, render: wallStyle });
    const pitRight = this.Bodies.rectangle(620, 480, 20, 240, { isStatic: true, render: wallStyle });

    const goalPlatform = this.Bodies.rectangle(780, 570, 280, 20, {
      isStatic: true,
      render: wallStyle
    });
    const backWall = this.Bodies.rectangle(940, 520, 20, 120, { isStatic: true, render: wallStyle });

    this.World.add(world, [slope1, pitLeft, pitRight, goalPlatform, backWall]);

    this.createDraggableBox(480, 280, 140, 30, { color: '#f59e0b' });
    this.createDraggableBox(450, 180, 60, 60, { color: '#fbbf24' });
    this.createDraggableBox(530, 180, 60, 60, { color: '#d97706' });
    this.createDraggableTriangle(380, 100, 30, { color: '#10b981' });
  }

  // ==========================================================================
  // ステージ 3: 「Super Bouncer」 (高反発オブジェクトを追加)
  // ==========================================================================
  buildStage3() {
    this.ballInitialPos = { x: 100, y: 120 };
    this.goalPos = { x: 860, y: 180 };
    this.dom.stageHintText.textContent = '💡 高反発バンパーを配置して、落ちてくるボールを高所のゴールへ跳ね上げよう！';

    const world = this.engine.world;
    const wallStyle = { fillStyle: '#1e293b', strokeStyle: '#ec4899', lineWidth: 2 };

    const steepSlope = this.Bodies.rectangle(240, 260, 320, 20, {
      isStatic: true,
      angle: Math.PI * 0.16,
      render: { fillStyle: '#1e293b', strokeStyle: '#38bdf8', lineWidth: 2 }
    });

    const highPlatform = this.Bodies.rectangle(860, 220, 180, 20, { isStatic: true, render: wallStyle });
    const highBackWall = this.Bodies.rectangle(945, 170, 16, 120, { isStatic: true, render: wallStyle });
    const highFrontLip = this.Bodies.rectangle(775, 200, 16, 60, { isStatic: true, render: wallStyle });

    const bottomBase = this.Bodies.rectangle(500, 620, 500, 20, {
      isStatic: true,
      render: { fillStyle: '#1e293b', strokeStyle: '#475569', lineWidth: 2 }
    });

    this.World.add(world, [steepSlope, highPlatform, highBackWall, highFrontLip, bottomBase]);

    this.createDraggableBouncer(520, 540, 140, 28, { angle: -Math.PI * 0.08 });
    this.createDraggableTriangle(660, 480, 38, {
      restitution: 1.5,
      color: '#ec4899',
      stroke: '#fbcfe8'
    });
    this.createDraggableBox(380, 460, 80, 24, { color: '#f59e0b' });
  }

  // ==========================================================================
  // ステージ 4: 「Heavy Seesaw」 (重い鉄球とシーソー仕掛け)
  // ==========================================================================
  buildStage4() {
    this.ballInitialPos = { x: 680, y: 440 };
    this.goalPos = { x: 880, y: 150 };
    this.dom.stageHintText.textContent = '💡 超重量の鉄球を持ち上げてシーソーに落とし、ボールを高く跳ね上げよう！';

    const world = this.engine.world;
    const wallStyle = { fillStyle: '#1e293b', strokeStyle: '#38bdf8', lineWidth: 2 };

    const fulcrum = this.Bodies.polygon(480, 560, 3, 44, {
      isStatic: true,
      render: { fillStyle: '#334155', strokeStyle: '#64748b', lineWidth: 2 }
    });

    const plank = this.Bodies.rectangle(480, 510, 480, 18, {
      density: 0.005,
      friction: 0.8,
      render: { fillStyle: '#e2e8f0', strokeStyle: '#94a3b8', lineWidth: 2 }
    });

    const pin = this.Constraint.create({
      pointA: { x: 480, y: 510 },
      bodyB: plank,
      pointB: { x: 0, y: 0 },
      stiffness: 1,
      length: 0,
      render: { visible: true, strokeStyle: '#38bdf8', lineWidth: 3 }
    });

    const goalPlat = this.Bodies.rectangle(880, 200, 180, 18, { isStatic: true, render: wallStyle });
    const goalBack = this.Bodies.rectangle(965, 140, 16, 140, { isStatic: true, render: wallStyle });
    const goalFront = this.Bodies.rectangle(795, 175, 16, 70, { isStatic: true, render: wallStyle });

    const heavyShelf = this.Bodies.rectangle(200, 160, 180, 16, {
      isStatic: true,
      angle: Math.PI * 0.08,
      render: wallStyle
    });

    this.World.add(world, [fulcrum, plank, pin, goalPlat, goalBack, goalFront, heavyShelf]);

    this.createDraggableHeavyBall(200, 100, 38);
    this.createDraggableBox(290, 300, 80, 20, { color: '#f59e0b' });
  }

  // ==========================================================================
  // ステージ 5: 「Chain Master」 (複数物体の組み合わせと順序)
  // ==========================================================================
  buildStage5() {
    this.ballInitialPos = { x: 80, y: 100 };
    this.goalPos = { x: 910, y: 530 };
    this.dom.stageHintText.textContent = '💡 物体を動かす順序が重要！鉄球やクサビ、バウンサーを連携させよう！';

    const world = this.engine.world;
    const wallStyle = { fillStyle: '#1e293b', strokeStyle: '#38bdf8', lineWidth: 2 };

    const slope1 = this.Bodies.rectangle(160, 160, 220, 18, {
      isStatic: true,
      angle: Math.PI * 0.08,
      render: wallStyle
    });

    const midShelf = this.Bodies.rectangle(480, 320, 260, 18, {
      isStatic: true,
      render: wallStyle
    });

    const dominoW = 12;
    const dominoH = 55;
    for (let d = 0; d < 3; d++) {
      const domino = this.Bodies.rectangle(430 + d * 36, 275, dominoW, dominoH, {
        density: 0.001,
        friction: 0.3,
        render: { fillStyle: '#38bdf8', strokeStyle: '#bae6fd', lineWidth: 1.5 }
      });
      this.World.add(world, domino);
    }

    const goalFloor = this.Bodies.rectangle(880, 580, 220, 20, { isStatic: true, render: wallStyle });
    const goalWall = this.Bodies.rectangle(980, 520, 20, 140, { isStatic: true, render: wallStyle });

    this.World.add(world, [slope1, midShelf, goalFloor, goalWall]);

    this.createDraggableHeavyBall(340, 240, 30);
    this.createDraggableTriangle(260, 270, 32, { color: '#10b981' });
    this.createDraggableBouncer(720, 480, 120, 24, { angle: -Math.PI * 0.1 });
    this.createDraggableBox(580, 260, 100, 24, { color: '#f59e0b' });
  }

  startLoop() {
    const loop = (currentTime) => {
      this.frameCount++;

      if (currentTime - this.lastFpsUpdate >= 500) {
        this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsUpdate));
        this.frameCount = 0;
        this.lastFpsUpdate = currentTime;
        this.dom.statFps.textContent = this.fps;
      }

      if (this.gameState === 'READY' || this.gameState === 'ROLLING') {
        this.elapsedSeconds = (currentTime - this.stageStartTime) / 1000;
        this.dom.uiTimer.textContent = this.formatTime(this.elapsedSeconds);
      }

      if (this.gameState === 'ROLLING' && this.mainBall) {
        const ballPos = this.mainBall.position;
        if (ballPos.y > CANVAS_HEIGHT + 30 || ballPos.x < -40 || ballPos.x > CANVAS_WIDTH + 40) {
          this.handleGameOver();
        }
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const tenths = Math.floor((totalSeconds * 10) % 10);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
  }
}

// ============================================================================
// 5. アプリケーション起動
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
  try {
    window.game = new GravityLabGame();
    console.log('✅ Gravity Lab (Matter.js 2D Physics Puzzle) initialized successfully.');
  } catch (err) {
    console.error('❌ Failed to initialize Gravity Lab Game:', err);
  }
});
