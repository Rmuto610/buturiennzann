/**
 * GRAVITY LAB - 2D Physics Puzzle Game (Matter.js)
 * 固定状態(FIXED) × 持った瞬間に当たり判定ON(HELD) 物理パズルゲーム
 *
 * 【新仕様の核心】
 * 1. ブロックは「固定状態 (FIXED)」を基本とする：
 *    - 重力の影響を受けない (isStatic = true)
 *    - 落下しない・移動しない
 *    - 当たり判定OFF (isSensor = true, collisionFilter.mask = 0)
 *    - ボールも他のブロックもすり抜ける
 * 2. ブロックを「持った瞬間 (HELD)」に当たり判定をON：
 *    - プレイヤーがドラッグして持っている間だけ、物理演算ON (isStatic = false, isSensor = false)
 *    - 当たり判定ON (ボールや壁と衝突可能)
 *    - ホイール / [R]キーで回転可能
 * 3. ブロックを離したとき：
 *    - その位置・角度で再び「固定状態 (FIXED)」に戻り、当たり判定OFF (すり抜け)
 * 4. ボールとの関係：
 *    - ボールは固定中のブロックを通過する
 *    - プレイヤーがブロックを持っている間だけ、そのブロックにボールが衝突して跳ね返る
 * 5. ゲーム状態の明確な分離：
 *    - TITLE: タイマー静止(00:00.0)、ボール静止
 *    - PLAYING: START後にタイマー開始
 *    - CLEAR / GAME_OVER: タイマー停止
 */

// ============================================================================
// 1. CONSTANTS & COLLISION CATEGORIES
// ============================================================================
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 650;
const WALL_THICKNESS = 80;

// 衝突フィルタカテゴリ (ビットマスク)
const COLLISION_CATEGORIES = {
  BALL:   0x0001,
  WALL:   0x0002,
  HELD:   0x0004, // プレイヤーが操作中のブロック (当たり判定ON)
  FIXED:  0x0008, // 固定中のブロック (当たり判定OFF / すり抜け)
  SENSOR: 0x0010
};

// 4種類のブロックの物理特性・見た目の定義
const BLOCK_TYPES = {
  NORMAL: {
    id: 'NORMAL',
    name: '通常ブロック',
    label: 'NORMAL',
    desc: '標準的な質量・摩擦・反発',
    tag: '標準バランス',
    tagClass: 'normal',
    fill: '#d97706',       // アンバーオレンジ
    stroke: '#fef3c7',
    glow: 'rgba(217, 119, 6, 0.4)',
    density: 0.002,        // 標準密度
    friction: 0.35,        // 標準摩擦
    restitution: 0.30,     // 標準反発
    icon: '📦'
  },
  LIGHT: {
    id: 'LIGHT',
    name: '軽いブロック',
    label: 'LIGHT',
    desc: '質量が小さく、ボールに押されやすい',
    tag: '軽量・滑りやすい',
    tagClass: 'light',
    fill: '#0284c7',       // スカイブルー
    stroke: '#bae6fd',
    glow: 'rgba(2, 132, 199, 0.45)',
    density: 0.0003,       // 極小密度（ボールに弾き飛ばされる）
    friction: 0.12,        // 滑りやすい
    restitution: 0.45,
    icon: '🪶'
  },
  HEAVY: {
    id: 'HEAVY',
    name: '重いブロック',
    label: 'HEAVY',
    desc: '超大質量で動かない頑丈な土台',
    tag: '超重量・高摩擦',
    tagClass: 'heavy',
    fill: '#334155',       // スレートメタル
    stroke: '#94a3b8',
    glow: 'rgba(100, 116, 139, 0.4)',
    density: 0.030,        // 超高密度（通常の15倍）
    friction: 0.85,        // 高摩擦
    restitution: 0.05,     // 衝撃吸収
    icon: '⚓'
  },
  BOUNCY: {
    id: 'BOUNCY',
    name: 'バウンドブロック',
    label: 'BOUNCE',
    desc: '超高反発でボールを強く跳ね返す',
    tag: '超高反発・ジャンプ',
    tagClass: 'bouncy',
    fill: '#db2777',       // ビビッドピンク
    stroke: '#fce7f3',
    glow: 'rgba(219, 39, 119, 0.55)',
    density: 0.003,
    friction: 0.02,        // 低摩擦
    restitution: 1.45,     // 超高反発
    icon: '⚡'
  }
};

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
    radius: 17,
    restitution: 0.60,
    friction: 0.05,
    density: 0.002
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
    this.soundThrottleMs = 30;
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
      osc.frequency.setValueAtTime(650, t);
      osc.frequency.exponentialRampToValueAtTime(900, t + 0.04);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.04);
    } catch (e) {}
  }

  playRotate() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(520, t + 0.03);
      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.03);
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
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(800, t + 0.16);
        gain.gain.setValueAtTime(0.26, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.2);
      } else if (isHeavy) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.22);
        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.25);
      } else {
        osc.type = 'triangle';
        const startFreq = 260 + Math.min(strength * 25, 280);
        osc.frequency.setValueAtTime(startFreq, t);
        osc.frequency.exponentialRampToValueAtTime(85, t + 0.08);
        const volume = Math.min(0.06 + (strength / 15) * 0.16, 0.25);
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
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.38);
    } catch (e) {}
  }

  playSpawn() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.12);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
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
      maxRadius: isBouncer ? 55 : (isHeavy ? 45 : 25),
      alpha: 1.0,
      color: isBouncer ? '#ec4899' : (isHeavy ? '#94a3b8' : '#38bdf8'),
      lineWidth: isHeavy ? 3.5 : 2
    });

    const count = isBouncer ? 14 : (isHeavy ? 12 : 6);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 3 + 1.5) * (isHeavy || isBouncer ? 1.8 : 1.0);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: Math.random() * 0.05 + 0.03,
        size: Math.random() * 3 + 1.5,
        color: isBouncer ? '#f472b6' : (isHeavy ? '#94a3b8' : '#67e8f9')
      });
    }
  }

  addSpawnSparkle(x, y, color = '#38bdf8') {
    this.shockwaves.push({
      x,
      y,
      radius: 2,
      maxRadius: 40,
      alpha: 1.0,
      color: color,
      lineWidth: 2.5
    });

    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3.5 + 1.2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.035,
        size: Math.random() * 3 + 1.5,
        color: color
      });
    }
  }

  addGoalConfetti(x, y) {
    const colors = ['#10b981', '#38bdf8', '#fbbf24', '#ec4899', '#a855f7', '#ffffff'];
    for (let i = 0; i < 65; i++) {
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
// 4. MAIN GRAVITY LAB PHYSICS PUZZLE ENGINE
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

    // ゲーム状態: TITLE, PLAYING, CLEAR, GAME_OVER
    this.gameState = 'TITLE';
    this.currentStage = 1;
    this.totalStages = 5;
    this.totalScore = 0;
    this.stageScores = [0, 0, 0, 0, 0];

    // タイマー管理
    this.stageStartTime = 0;
    this.elapsedSeconds = 0;
    this.movesCount = 0;
    this.retriesCount = 0;

    // 物理オブジェクト
    this.mainBall = null;
    this.ballPin = null;
    this.goalSensor = null;
    this.gateBody = null;
    this.draggableBodies = [];

    // 現在プレイヤーが持っている(操作中)ブロック
    this.heldBody = null;

    // NEXTブロック待機キュー (常時3個表示)
    this.nextQueue = [];
    this.queueSize = 3;
    this.maxStageBlocks = 6;

    this.ballInitialPos = { x: 100, y: 120 };
    this.goalPos = { x: 900, y: 550 };

    // 物理パラメータ
    this.gravityVal = 1.0;
    this.bounceMultiplier = 1.0;
    this.frictionMultiplier = 1.0;
    this.timeScaleVal = 1.0;

    this.frameCount = 0;
    this.fps = 60;
    this.lastFpsUpdate = performance.now();

    // DOM参照
    this.dom = {
      container: document.getElementById('canvas-container'),
      uiStage: document.getElementById('ui-stage'),
      uiBlocks: document.getElementById('ui-blocks'),
      uiTimer: document.getElementById('ui-timer'),
      uiScore: document.getElementById('ui-score'),
      uiMoves: document.getElementById('ui-moves'),
      uiGameState: document.getElementById('ui-gamestate'),
      uiBlockState: document.getElementById('ui-blockstate'),
      statFps: document.getElementById('stat-fps'),
      statGravity: document.getElementById('stat-gravity'),
      stageHintText: document.getElementById('stage-hint-text'),
      stageBtns: document.querySelectorAll('.stage-btn'),
      nextQueueContainer: document.getElementById('next-queue'),

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

    // 初期化時は TITLE 状態（タイマー静止、ステージ内ブロック0個）
    this.initNextQueue();
    this.loadStage(1, false);
    this.startLoop();
  }

  // ==========================================================================
  // 【新仕様】ブロックの固定(FIXED) と 持った瞬間(HELD) の切り替え
  // ==========================================================================
  setBlockFixed(body) {
    if (!body) return;
    body.blockState = 'FIXED';
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(body, 0);
    Matter.Body.setStatic(body, true);
    body.isSensor = true;
    body.collisionFilter.category = COLLISION_CATEGORIES.FIXED;
    body.collisionFilter.mask = 0; // 他の物体と衝突しない (ボールもすり抜ける)

    if (this.heldBody === body) {
      this.heldBody = null;
    }
    this.updateBlockStateUI();
  }

  setBlockHeld(body) {
    if (!body) return;
    body.blockState = 'HELD';
    Matter.Body.setStatic(body, false);
    body.isSensor = false;
    body.collisionFilter.category = COLLISION_CATEGORIES.HELD;
    // ボール、壁、他のHELDブロックと衝突
    body.collisionFilter.mask = COLLISION_CATEGORIES.BALL | COLLISION_CATEGORIES.WALL | COLLISION_CATEGORIES.HELD;

    const typeConfig = BLOCK_TYPES[body.blockTypeKey] || BLOCK_TYPES.NORMAL;
    body.restitution = typeConfig.restitution;
    body.friction = typeConfig.friction;
    Matter.Body.setDensity(body, typeConfig.density);
    body.frictionAir = 0.08; // 掴んでいる最中に暴走しないようエア抵抗

    this.heldBody = body;
    this.updateBlockStateUI();
  }

  updateBlockStateUI() {
    if (this.dom.uiBlockState) {
      if (this.heldBody) {
        this.dom.uiBlockState.textContent = 'MOVING (HIT ON)';
        this.dom.uiBlockState.style.color = '#38bdf8';
      } else {
        this.dom.uiBlockState.textContent = 'FIXED (NO HIT)';
        this.dom.uiBlockState.style.color = '#f59e0b';
      }
    }
  }

  // ==========================================================================
  // NEXTブロック待機キュー管理
  // ==========================================================================
  createRandomQueueItem(forcedType = null) {
    let typeKey = forcedType;
    if (!typeKey || !BLOCK_TYPES[typeKey]) {
      const types = ['NORMAL', 'LIGHT', 'HEAVY', 'BOUNCY'];
      const rand = Math.random();
      if (rand < 0.35) typeKey = 'NORMAL';
      else if (rand < 0.60) typeKey = 'LIGHT';
      else if (rand < 0.80) typeKey = 'HEAVY';
      else typeKey = 'BOUNCY';
    }

    const shapes = ['BAR', 'SHORT_BAR', 'SQUARE', 'BAR'];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];

    let width = 140;
    let height = 24;
    if (shape === 'SHORT_BAR') {
      width = 90;
      height = 24;
    } else if (shape === 'SQUARE') {
      width = 56;
      height = 56;
    }

    return {
      id: 'block_' + Math.random().toString(36).substr(2, 9),
      typeKey,
      shape,
      width,
      height
    };
  }

  initNextQueue() {
    this.nextQueue = [];
    for (let i = 0; i < this.queueSize; i++) {
      this.nextQueue.push(this.createRandomQueueItem());
    }
    this.renderNextQueue();
  }

  renderNextQueue() {
    if (!this.dom.nextQueueContainer) return;
    this.dom.nextQueueContainer.innerHTML = '';

    this.nextQueue.forEach((item, index) => {
      const typeInfo = BLOCK_TYPES[item.typeKey];
      const card = document.createElement('div');
      card.className = `next-card ${index === 0 ? 'active-first' : ''}`;
      card.setAttribute('data-index', index);

      const svgW = 120;
      const svgH = 44;
      const previewScale = Math.min(100 / item.width, 36 / item.height, 0.7);
      const drawW = item.width * previewScale;
      const drawH = item.height * previewScale;
      const drawX = (svgW - drawW) / 2;
      const drawY = (svgH - drawH) / 2;

      card.innerHTML = `
        <div class="next-card-header">
          <span class="next-card-badge ${index === 0 ? 'badge-next' : ''}">
            ${index === 0 ? '▶ NEXT #1' : `#${index + 1}`}
          </span>
          <span class="next-card-name" style="color:${typeInfo.fill}">
            ${typeInfo.icon} ${typeInfo.name}
          </span>
        </div>
        <div class="next-preview-box">
          <svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
            <rect x="${drawX}" y="${drawY}" width="${drawW}" height="${drawH}" rx="3"
                  fill="${typeInfo.fill}" stroke="${typeInfo.stroke}" stroke-width="2" />
          </svg>
        </div>
        <div class="next-card-props">
          <span class="prop-tag ${typeInfo.tagClass}">${typeInfo.tag}</span>
        </div>
        <button class="btn-spawn-block" title="クリックしてステージに投入">
          <span>投入 (SPAWN)</span>
        </button>
      `;

      card.addEventListener('click', (e) => {
        this.spawnBlockFromQueue(index);
      });

      this.dom.nextQueueContainer.appendChild(card);
    });
  }

  // NEXTブロックをステージへ投入（投入時は FIXED 状態でピタッと配置）
  spawnBlockFromQueue(index = 0, targetX = null, targetY = null) {
    if (this.gameState === 'TITLE') {
      this.startGame();
    }

    if (this.draggableBodies.length >= this.maxStageBlocks) {
      if (this.dom.stageHintText) {
        this.dom.stageHintText.textContent = `⚠️ ステージ上のブロックが上限（${this.maxStageBlocks}個）です！`;
      }
      return;
    }

    const item = this.nextQueue.splice(index, 1)[0];
    if (!item) return;

    this.nextQueue.push(this.createRandomQueueItem());
    this.renderNextQueue();

    // 投入位置
    const spawnX = targetX || (380 + Math.random() * 240);
    const spawnY = targetY || 200;

    const typeConfig = BLOCK_TYPES[item.typeKey];

    const body = this.Bodies.rectangle(spawnX, spawnY, item.width, item.height, {
      restitution: typeConfig.restitution,
      friction: typeConfig.friction,
      density: typeConfig.density,
      angle: 0,
      render: {
        fillStyle: typeConfig.fill,
        strokeStyle: typeConfig.stroke,
        lineWidth: item.typeKey === 'HEAVY' ? 3.5 : 2
      }
    });

    body.isDraggable = true;
    body.blockTypeKey = item.typeKey;
    body.baseType = item.typeKey.toLowerCase();

    // 【重要仕様】配置時点では基本的に固定状態 (FIXED: 重力OFF、衝突OFF、すり抜け)
    this.setBlockFixed(body);

    this.draggableBodies.push(body);
    this.World.add(this.engine.world, body);

    this.sound.playSpawn();
    this.vfx.addSpawnSparkle(spawnX, spawnY, typeConfig.fill);
    this.updateBlocksUI();

    if (this.dom.stageHintText) {
      this.dom.stageHintText.textContent = `📌 ${typeConfig.name}を固定配置しました。ドラッグすると当たり判定がONになります。`;
    }
  }

  updateBlocksUI() {
    const current = this.draggableBodies.length;
    const max = this.maxStageBlocks;
    if (this.dom.uiBlocks) {
      this.dom.uiBlocks.textContent = `${current} / ${max}`;
    }
  }

  // ==========================================================================
  // マウス/タッチ操作：クリックした瞬間に HELD (当たり判定ON)、離すと FIXED (固定)
  // ==========================================================================
  setupMouseInteraction() {
    const canvas = this.render.canvas;
    const mouse = this.Mouse.create(canvas);
    this.render.mouse = mouse;

    this.mouseConstraint = this.MouseConstraint.create(this.engine, {
      mouse: mouse,
      constraint: {
        stiffness: 0.35,
        damping: 0.1,
        render: {
          visible: true,
          lineWidth: 2,
          strokeStyle: '#38bdf8'
        }
      }
    });

    this.World.add(this.engine.world, this.mouseConstraint);

    // ポインターダウン (クリック・タッチ時)：その位置のブロックを HELD (当たり判定ON) に昇格
    const onPointerDown = (evt) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const scaleY = CANVAS_HEIGHT / rect.height;
      const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
      const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
      const pos = {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };

      const found = Matter.Query.point(this.draggableBodies, pos)[0];
      if (found && found.isDraggable && !found.isMainBall) {
        this.sound.init();
        this.setBlockHeld(found);
        this.mouseConstraint.body = found;
        this.movesCount++;
        if (this.dom.uiMoves) this.dom.uiMoves.textContent = this.movesCount;
        this.sound.playClick();
        if (this.dom.stageHintText) {
          this.dom.stageHintText.textContent = `✋ ブロックを操作中（当たり判定ON）。ホイールまたは[R]キーで回転、離すとその位置で固定（FIXED）されます。`;
        }
      }
    };

    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('touchstart', onPointerDown, { passive: true });

    // ポインターアップ (離した瞬間)：その位置で FIXED (当たり判定OFF / 固定) に戻す
    const onPointerUp = () => {
      if (this.heldBody) {
        const body = this.heldBody;
        this.setBlockFixed(body);
        if (this.mouseConstraint) {
          this.mouseConstraint.body = null;
          this.mouseConstraint.constraint.bodyB = null;
        }
        this.sound.playClick();
        if (this.dom.stageHintText) {
          this.dom.stageHintText.textContent = `📌 ブロックを固定しました（当たり判定OFF / すり抜け）。ボールを通過させます。`;
        }
      }
    };

    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchend', onPointerUp);

    // カーソル更新
    canvas.addEventListener('mousemove', () => {
      if (this.heldBody) {
        canvas.style.cursor = 'grabbing';
      } else {
        const mousePos = this.mouseConstraint.mouse.position;
        const hovered = Matter.Query.point(this.draggableBodies, mousePos).find(b => b.isDraggable && !b.isMainBall);
        canvas.style.cursor = hovered ? 'grab' : 'default';
      }
    });

    // マウスホイールによるブロック回転 (操作中のブロックのみ)
    canvas.addEventListener('wheel', (e) => {
      if (this.heldBody) {
        e.preventDefault();
        const deltaAngle = (e.deltaY > 0 ? 1 : -1) * 0.15;
        this.Body.rotate(this.heldBody, deltaAngle);
        this.sound.playRotate();
      }
    }, { passive: false });

    // キーボードによるブロック回転 (R / E で時計回り、Q で反時計回り)
    window.addEventListener('keydown', (e) => {
      if (this.heldBody) {
        if (e.key === 'r' || e.key === 'R' || e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          this.Body.rotate(this.heldBody, 0.18);
          this.sound.playRotate();
        } else if (e.key === 'q' || e.key === 'Q') {
          e.preventDefault();
          this.Body.rotate(this.heldBody, -0.18);
          this.sound.playRotate();
        }
      }
    });
  }

  // ==========================================================================
  // 物理イベント & 描画ループ
  // ==========================================================================
  setupPhysicsEvents() {
    // 毎物理ステップ前：操作中のブロックが重力で勝手に落下しないよう、マウスにしっかり追従
    this.Events.on(this.engine, 'beforeUpdate', () => {
      if (this.heldBody && this.mouseConstraint && this.mouseConstraint.mouse) {
        const mousePos = this.mouseConstraint.mouse.position;
        // マウス位置に向かって適度な速度を与える
        const dx = mousePos.x - this.heldBody.position.x;
        const dy = mousePos.y - this.heldBody.position.y;
        this.Body.setVelocity(this.heldBody, {
          x: dx * 0.35,
          y: dy * 0.35
        });
      }
    });

    this.Events.on(this.engine, 'collisionStart', (event) => {
      const pairs = event.pairs;
      for (let i = 0; i < pairs.length; i++) {
        const { bodyA, bodyB } = pairs[i];

        // ゴール判定 (PLAYING中のみ)
        const isGoalContact = (bodyA === this.mainBall && bodyB === this.goalSensor) ||
                              (bodyB === this.mainBall && bodyA === this.goalSensor);
        if (isGoalContact && this.gameState === 'PLAYING') {
          this.handleStageClear();
          return;
        }

        // HELDブロックとボールの衝突エフェクト
        const isBallImpact = (bodyA === this.mainBall || bodyB === this.mainBall);
        if (isBallImpact) {
          const otherBody = (bodyA === this.mainBall ? bodyB : bodyA);
          if (otherBody.blockState === 'HELD') {
            const vx = bodyA.velocity.x - bodyB.velocity.x;
            const vy = bodyA.velocity.y - bodyB.velocity.y;
            const relSpeed = Math.sqrt(vx * vx + vy * vy);

            const isHeavy = (otherBody.blockTypeKey === 'HEAVY');
            const isBouncer = (otherBody.blockTypeKey === 'BOUNCY');

            let hitX = (bodyA.position.x + bodyB.position.x) / 2;
            let hitY = (bodyA.position.y + bodyB.position.y) / 2;
            this.vfx.addImpact(hitX, hitY, relSpeed, isHeavy, isBouncer);
            this.sound.playImpact(relSpeed, isHeavy, isBouncer);

            if (isBouncer) {
              const normalX = -Math.sin(otherBody.angle);
              const normalY = -Math.cos(otherBody.angle);
              const boostSpeed = Math.max(relSpeed * 1.5, 9.5);
              this.Body.setVelocity(this.mainBall, {
                x: normalX * boostSpeed,
                y: normalY * boostSpeed
              });
            }
          }
        }
      }
    });

    // 描画オーバーレイ
    this.Events.on(this.render, 'afterRender', () => {
      const ctx = this.render.context;
      if (!ctx) return;

      const time = performance.now() * 0.003;

      // 1. ゴールポータルの描画
      if (this.goalPos) {
        ctx.save();
        const gx = this.goalPos.x;
        const gy = this.goalPos.y;
        const radius = THEME.goal.radius;

        const pulse = Math.sin(time * 2.5) * 4;
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

      // 2. 各ブロックの FIXED / HELD 視覚表現
      this.draggableBodies.forEach(body => {
        if (!body) return;

        const typeInfo = BLOCK_TYPES[body.blockTypeKey] || BLOCK_TYPES.NORMAL;
        const isHeld = (body.blockState === 'HELD' || this.heldBody === body);

        ctx.save();
        ctx.translate(body.position.x, body.position.y);
        ctx.rotate(body.angle);

        const verts = body.vertices;
        ctx.beginPath();
        ctx.moveTo(verts[0].x - body.position.x, verts[0].y - body.position.y);
        for (let j = 1; j < verts.length; j++) {
          ctx.lineTo(verts[j].x - body.position.x, verts[j].y - body.position.y);
        }
        ctx.closePath();

        if (isHeld) {
          // HELD (操作中・当たり判定ON): ネオングロー実線
          ctx.globalAlpha = 1.0;
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3.5;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 18;
          ctx.stroke();

          ctx.font = 'bold 10px "JetBrains Mono", sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.fillText(`✋ MOVING (HIT ON)`, 0, 0);

          // 上部ガイド
          ctx.restore();
          ctx.save();
          ctx.translate(body.position.x, body.position.y - 38);
          ctx.font = 'bold 11px "JetBrains Mono", sans-serif';
          ctx.fillStyle = '#38bdf8';
          ctx.textAlign = 'center';
          const deg = Math.round(((body.angle * 180 / Math.PI) % 360 + 360) % 360);
          ctx.fillText(`📐 ${deg}° [WHEEL/R: 回転]`, 0, 0);
          ctx.restore();
          return;
        } else {
          // FIXED (固定中・当たり判定OFF): 半透明ダッシュ線
          ctx.globalAlpha = 0.78;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.stroke();

          ctx.font = 'bold 10px "JetBrains Mono", sans-serif';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`📌 FIXED`, 0, 0);
        }

        ctx.restore();
      });

      // 3. ボールの発光エフェクト
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

  // ==========================================================================
  // UIイベント & 状態遷移 (TITLE, PLAYING, CLEAR, GAME_OVER)
  // ==========================================================================
  setupUIEvents() {
    this.dom.btnStartGame.addEventListener('click', () => {
      this.startGame();
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
      this.resetStage();
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
      this.loadStage(1, false);
      this.startGame();
    });

    this.dom.stageBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.sound.playClick();
        const stage = parseInt(btn.dataset.stage, 10);
        this.dom.screenTitle.classList.remove('active');
        this.dom.screenClear.classList.remove('active');
        this.dom.screenGameOver.classList.remove('active');
        this.dom.screenVictory.classList.remove('active');
        this.loadStage(stage, false);
        this.startGame();
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

    // 物理パラメータスライダー群
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
      if (!body.isStatic && body.blockTypeKey) {
        const base = BLOCK_TYPES[body.blockTypeKey];
        if (base) {
          body.restitution = Math.min(Math.max(base.restitution * (bounceInput / 0.7), 0), 1.8);
          body.friction = Math.min(Math.max(base.friction * (frictionInput / 0.1), 0), 1.0);
        }
      }
    });
  }

  // ==========================================================================
  // ゲーム開始・リトライ・リセット・クリア処理
  // ==========================================================================
  startGame() {
    this.sound.playClick();
    this.gameState = 'PLAYING';
    this.stageStartTime = performance.now();
    this.elapsedSeconds = 0;
    this.dom.screenTitle.classList.remove('active');
    if (this.dom.uiGameState) this.dom.uiGameState.textContent = 'PLAYING';
    if (this.dom.uiTimer) this.dom.uiTimer.textContent = '00:00.0';
    if (this.dom.stageHintText) {
      this.dom.stageHintText.textContent = '💡 左の「NEXT」から使いたいブロックをクリックしてステージへ投入しよう！';
    }
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
    if (this.gameState !== 'PLAYING') return;

    this.sound.playRelease();
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
    this.gameState = 'PLAYING';
    this.stageStartTime = performance.now();
    this.elapsedSeconds = 0;
    if (this.dom.uiTimer) this.dom.uiTimer.textContent = '00:00.0';
    if (this.dom.uiGameState) this.dom.uiGameState.textContent = 'PLAYING';
    this.dom.btnRelease.disabled = false;
    this.dom.btnNext.disabled = true;

    this.lockMainBall();
    this.setupGate();
  }

  resetStage() {
    for (let i = this.draggableBodies.length - 1; i >= 0; i--) {
      this.World.remove(this.engine.world, this.draggableBodies[i]);
    }
    this.draggableBodies = [];
    this.heldBody = null;
    this.updateBlocksUI();
    this.updateBlockStateUI();
    this.initNextQueue();

    this.retryStage();
  }

  nextStage() {
    if (this.currentStage < this.totalStages) {
      this.loadStage(this.currentStage + 1, false);
      this.startGame();
    } else {
      this.showVictoryScreen();
    }
  }

  handleStageClear() {
    this.gameState = 'CLEAR';
    if (this.dom.uiGameState) this.dom.uiGameState.textContent = 'CLEAR';
    this.sound.playGoal();
    this.vfx.addGoalConfetti(this.goalPos.x, this.goalPos.y);

    const timeScore = Math.max(0, 5000 - Math.floor(this.elapsedSeconds * 65));
    const moveScore = Math.max(0, 3000 - (this.movesCount * 150));
    const retryPenalty = Math.max(0, 2000 - (this.retriesCount * 300));
    const stageScore = 1500 + timeScore + moveScore + retryPenalty;

    this.stageScores[this.currentStage - 1] = stageScore;
    this.totalScore = this.stageScores.reduce((a, b) => a + b, 0);

    this.dom.clearTimeVal.textContent = this.formatTime(this.elapsedSeconds);
    this.dom.clearMovesVal.textContent = `${this.movesCount} 回`;
    this.dom.clearRetriesVal.textContent = `${this.retriesCount} 回`;
    this.dom.clearScoreVal.textContent = stageScore.toLocaleString();
    this.dom.clearTotalScoreVal.textContent = this.totalScore.toLocaleString();

    const stars = this.dom.clearStars.querySelectorAll('.star');
    stars.forEach(s => s.classList.remove('active'));
    if (stageScore >= 8000) {
      stars[0].classList.add('active');
      stars[1].classList.add('active');
      stars[2].classList.add('active');
    } else if (stageScore >= 5000) {
      stars[0].classList.add('active');
      stars[1].classList.add('active');
    } else {
      stars[0].classList.add('active');
    }

    this.dom.btnNext.disabled = false;

    setTimeout(() => {
      this.dom.screenClear.classList.add('active');
    }, 550);
  }

  handleBallFall() {
    if (this.gameState !== 'PLAYING') return;

    this.gameState = 'GAME_OVER';
    if (this.dom.uiGameState) this.dom.uiGameState.textContent = 'GAME_OVER';
    this.sound.playGameOver();

    setTimeout(() => {
      if (this.gameState === 'GAME_OVER') {
        this.dom.screenGameOver.classList.add('active');
      }
    }, 400);
  }

  showVictoryScreen() {
    this.gameState = 'VICTORY';
    if (this.dom.uiGameState) this.dom.uiGameState.textContent = 'VICTORY';
    this.sound.playGoal();
    this.dom.victoryFinalScore.textContent = this.totalScore.toLocaleString();
    this.dom.screenVictory.classList.add('active');
  }

  // ==========================================================================
  // ワールド初期化 & ステージ構築
  // ==========================================================================
  clearWorld() {
    this.World.clear(this.engine.world, false);
    this.vfx.clear();
    this.draggableBodies = [];
    this.heldBody = null;
    this.mainBall = null;
    this.ballPin = null;
    this.goalSensor = null;
    this.gateBody = null;

    if (this.mouseConstraint) {
      this.World.add(this.engine.world, this.mouseConstraint);
    }
  }

  buildEnclosure() {
    const wallOpts = {
      isStatic: true,
      render: { fillStyle: THEME.wallFill, strokeStyle: THEME.wallStroke, lineWidth: 2 },
      friction: 0.2,
      restitution: 0.3,
      collisionFilter: {
        category: COLLISION_CATEGORIES.WALL,
        mask: COLLISION_CATEGORIES.BALL | COLLISION_CATEGORIES.HELD
      }
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
      collisionFilter: {
        category: COLLISION_CATEGORIES.BALL,
        // 壁、HELDなブロック、ゴールセンサーと衝突 (※FIXEDなブロックはマスクに含まれないため完全すり抜け！)
        mask: COLLISION_CATEGORIES.WALL | COLLISION_CATEGORIES.HELD | COLLISION_CATEGORIES.SENSOR
      },
      render: {
        fillStyle: THEME.mainBall.fill,
        strokeStyle: THEME.mainBall.stroke,
        lineWidth: 2.5
      }
    });
    this.mainBall.isMainBall = true;
    this.mainBall.isDraggable = false;
    this.World.add(this.engine.world, this.mainBall);

    this.lockMainBall();
  }

  setupGoalSensor() {
    this.goalSensor = this.Bodies.circle(this.goalPos.x, this.goalPos.y, THEME.goal.radius * 0.85, {
      isStatic: true,
      isSensor: true,
      collisionFilter: {
        category: COLLISION_CATEGORIES.SENSOR,
        mask: COLLISION_CATEGORIES.BALL
      },
      render: { visible: false }
    });
    this.goalSensor.isGoalSensor = true;
    this.World.add(this.engine.world, this.goalSensor);
  }

  setupGate() {
    if (this.gateBody) {
      this.World.remove(this.engine.world, this.gateBody);
    }
    this.gateBody = this.Bodies.rectangle(this.ballInitialPos.x + 30, this.ballInitialPos.y, 10, 42, {
      isStatic: true,
      collisionFilter: {
        category: COLLISION_CATEGORIES.WALL,
        mask: COLLISION_CATEGORIES.BALL
      },
      render: { fillStyle: THEME.gateFill, strokeStyle: THEME.gateStroke, lineWidth: 2 }
    });
    this.World.add(this.engine.world, this.gateBody);
  }

  loadStage(stageNum, startImmediately = false) {
    this.currentStage = stageNum;
    this.clearWorld();

    this.elapsedSeconds = 0;
    this.movesCount = 0;
    this.retriesCount = 0;

    if (startImmediately) {
      this.gameState = 'PLAYING';
      this.stageStartTime = performance.now();
    } else {
      this.gameState = 'TITLE';
      this.stageStartTime = 0;
    }

    this.dom.uiStage.textContent = `${this.currentStage} / ${this.totalStages}`;
    this.dom.uiTimer.textContent = '00:00.0';
    this.dom.uiMoves.textContent = '0';
    if (this.dom.uiGameState) this.dom.uiGameState.textContent = this.gameState;
    this.updateBlockStateUI();
    this.dom.btnRelease.disabled = false;
    this.dom.btnNext.disabled = true;

    this.dom.stageBtns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.stage, 10) === stageNum);
    });

    this.buildEnclosure();

    switch (stageNum) {
      case 1: this.buildStage1(); break;
      case 2: this.buildStage2(); break;
      case 3: this.buildStage3(); break;
      case 4: this.buildStage4(); break;
      case 5: this.buildStage5(); break;
      default: this.buildStage1(); break;
    }

    this.setupMainBall();
    this.setupGoalSensor();
    this.setupGate();

    this.draggableBodies = [];
    this.updateBlocksUI();
    this.renderNextQueue();
  }

  // ==========================================================================
  // 各ステージ構築 (固定地形のみ)
  // ==========================================================================
  buildStage1() {
    this.ballInitialPos = { x: 100, y: 120 };
    this.goalPos = { x: 900, y: 550 };
    this.dom.stageHintText.textContent = '💡 左の「NEXT」からブロックを投入！ドラッグで移動、離すとその場で固定されます。';

    const world = this.engine.world;
    const wallStyle = { fillStyle: '#1e293b', strokeStyle: '#38bdf8', lineWidth: 2 };
    const wallFilter = { category: COLLISION_CATEGORIES.WALL, mask: COLLISION_CATEGORIES.BALL | COLLISION_CATEGORIES.HELD };

    const slope1 = this.Bodies.rectangle(220, 200, 290, 20, {
      isStatic: true,
      angle: Math.PI * 0.08,
      collisionFilter: wallFilter,
      render: wallStyle
    });

    const midPillar = this.Bodies.rectangle(550, 500, 44, 200, {
      isStatic: true,
      collisionFilter: wallFilter,
      render: wallStyle
    });

    const goalFloor = this.Bodies.rectangle(820, 580, 260, 20, {
      isStatic: true,
      collisionFilter: wallFilter,
      render: wallStyle
    });
    const backWall = this.Bodies.rectangle(960, 520, 20, 120, {
      isStatic: true,
      collisionFilter: wallFilter,
      render: wallStyle
    });

    this.World.add(world, [slope1, midPillar, goalFloor, backWall]);
  }

  buildStage2() {
    this.ballInitialPos = { x: 100, y: 120 };
    this.goalPos = { x: 880, y: 170 };
    this.dom.stageHintText.textContent = '💡 バウンドブロックを投入し、斜めに傾けて配置してボールを跳ね上げよう！';

    const world = this.engine.world;
    const wallStyle = { fillStyle: '#1e293b', strokeStyle: '#ec4899', lineWidth: 2 };
    const wallFilter = { category: COLLISION_CATEGORIES.WALL, mask: COLLISION_CATEGORIES.BALL | COLLISION_CATEGORIES.HELD };

    const steepSlope = this.Bodies.rectangle(230, 250, 300, 20, {
      isStatic: true,
      angle: Math.PI * 0.16,
      collisionFilter: wallFilter,
      render: { fillStyle: '#1e293b', strokeStyle: '#38bdf8', lineWidth: 2 }
    });

    const highPlat = this.Bodies.rectangle(880, 220, 190, 20, { isStatic: true, collisionFilter: wallFilter, render: wallStyle });
    const highBack = this.Bodies.rectangle(970, 160, 18, 120, { isStatic: true, collisionFilter: wallFilter, render: wallStyle });
    const highLip = this.Bodies.rectangle(790, 195, 16, 60, { isStatic: true, collisionFilter: wallFilter, render: wallStyle });

    this.World.add(world, [steepSlope, highPlat, highBack, highLip]);
  }

  buildStage3() {
    this.ballInitialPos = { x: 700, y: 440 };
    this.goalPos = { x: 880, y: 150 };
    this.dom.stageHintText.textContent = '💡 超重量ブロック（⚓）を投入してシーソーの左端に落とし、ボールをカタパルト発射しよう！';

    const world = this.engine.world;
    const wallStyle = { fillStyle: '#1e293b', strokeStyle: '#38bdf8', lineWidth: 2 };
    const wallFilter = { category: COLLISION_CATEGORIES.WALL, mask: COLLISION_CATEGORIES.BALL | COLLISION_CATEGORIES.HELD };

    const fulcrum = this.Bodies.polygon(490, 560, 3, 44, {
      isStatic: true,
      collisionFilter: wallFilter,
      render: { fillStyle: '#334155', strokeStyle: '#64748b', lineWidth: 2 }
    });

    const plank = this.Bodies.rectangle(490, 510, 460, 18, {
      density: 0.005,
      friction: 0.8,
      collisionFilter: wallFilter,
      render: { fillStyle: '#e2e8f0', strokeStyle: '#94a3b8', lineWidth: 2 }
    });

    const pin = this.Constraint.create({
      pointA: { x: 490, y: 510 },
      bodyB: plank,
      pointB: { x: 0, y: 0 },
      stiffness: 1,
      length: 0,
      render: { visible: true, strokeStyle: '#38bdf8', lineWidth: 3 }
    });

    const goalPlat = this.Bodies.rectangle(880, 200, 180, 18, { isStatic: true, collisionFilter: wallFilter, render: wallStyle });
    const goalBack = this.Bodies.rectangle(965, 140, 16, 140, { isStatic: true, collisionFilter: wallFilter, render: wallStyle });
    const goalFront = this.Bodies.rectangle(795, 175, 16, 70, { isStatic: true, collisionFilter: wallFilter, render: wallStyle });

    this.World.add(world, [fulcrum, plank, pin, goalPlat, goalBack, goalFront]);
  }

  buildStage4() {
    this.ballInitialPos = { x: 90, y: 100 };
    this.goalPos = { x: 900, y: 540 };
    this.dom.stageHintText.textContent = '💡 2連の深い谷！ブロックを配置して安定した橋を架けよう！';

    const world = this.engine.world;
    const wallStyle = { fillStyle: '#1e293b', strokeStyle: '#38bdf8', lineWidth: 2 };
    const wallFilter = { category: COLLISION_CATEGORIES.WALL, mask: COLLISION_CATEGORIES.BALL | COLLISION_CATEGORIES.HELD };

    const startSlope = this.Bodies.rectangle(180, 160, 230, 20, {
      isStatic: true,
      angle: Math.PI * 0.08,
      collisionFilter: wallFilter,
      render: wallStyle
    });

    const pillar1 = this.Bodies.rectangle(380, 480, 36, 220, { isStatic: true, collisionFilter: wallFilter, render: wallStyle });
    const pillar2 = this.Bodies.rectangle(660, 480, 36, 220, { isStatic: true, collisionFilter: wallFilter, render: wallStyle });

    const goalPlat = this.Bodies.rectangle(850, 580, 240, 20, { isStatic: true, collisionFilter: wallFilter, render: wallStyle });
    const goalBack = this.Bodies.rectangle(965, 520, 20, 120, { isStatic: true, collisionFilter: wallFilter, render: wallStyle });

    this.World.add(world, [startSlope, pillar1, pillar2, goalPlat, goalBack]);
  }

  buildStage5() {
    this.ballInitialPos = { x: 80, y: 100 };
    this.goalPos = { x: 910, y: 530 };
    this.dom.stageHintText.textContent = '💡 究極の物理パズル！手持ちのNEXTブロックを見て自由な攻略ルートを構築しよう！';

    const world = this.engine.world;
    const wallStyle = { fillStyle: '#1e293b', strokeStyle: '#38bdf8', lineWidth: 2 };
    const wallFilter = { category: COLLISION_CATEGORIES.WALL, mask: COLLISION_CATEGORIES.BALL | COLLISION_CATEGORIES.HELD };

    const startSlope = this.Bodies.rectangle(170, 160, 220, 18, {
      isStatic: true,
      angle: Math.PI * 0.08,
      collisionFilter: wallFilter,
      render: wallStyle
    });

    const midShelf = this.Bodies.rectangle(480, 370, 220, 18, {
      isStatic: true,
      collisionFilter: wallFilter,
      render: wallStyle
    });

    const obstacle = this.Bodies.polygon(700, 330, 3, 30, {
      isStatic: true,
      collisionFilter: wallFilter,
      render: { fillStyle: '#ec4899', strokeStyle: '#fbcfe8', lineWidth: 2 }
    });

    const goalFloor = this.Bodies.rectangle(880, 580, 220, 20, { isStatic: true, collisionFilter: wallFilter, render: wallStyle });
    const goalWall = this.Bodies.rectangle(980, 520, 20, 140, { isStatic: true, collisionFilter: wallFilter, render: wallStyle });

    this.World.add(world, [startSlope, midShelf, obstacle, goalFloor, goalWall]);
  }

  // ==========================================================================
  // メインループ
  // ==========================================================================
  startLoop() {
    const loop = (currentTime) => {
      this.frameCount++;

      if (currentTime - this.lastFpsUpdate >= 500) {
        this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsUpdate));
        this.frameCount = 0;
        this.lastFpsUpdate = currentTime;
        if (this.dom.statFps) this.dom.statFps.textContent = this.fps;
      }

      if (this.gameState === 'PLAYING') {
        this.elapsedSeconds = (currentTime - this.stageStartTime) / 1000;
        if (this.dom.uiTimer) {
          this.dom.uiTimer.textContent = this.formatTime(this.elapsedSeconds);
        }
      }

      // ボールの奈落落下チェック
      if (this.gameState === 'PLAYING' && this.mainBall && !this.ballPin) {
        const ballPos = this.mainBall.position;
        if (ballPos.y > CANVAS_HEIGHT + 35 || ballPos.x < -40 || ballPos.x > CANVAS_WIDTH + 40) {
          this.handleBallFall();
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
// 5. アプリケーション初期化
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
  try {
    window.game = new GravityLabGame();
    console.log('✅ Gravity Lab (FIXED & HELD Physics Puzzle) initialized successfully.');
  } catch (err) {
    console.error('❌ Failed to initialize Gravity Lab Game:', err);
  }
});
