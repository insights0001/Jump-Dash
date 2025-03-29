// ----- CONFIGURATION CONSTANTS -----
const CONFIG = {
  GROUND_LEVEL: 10,
  CHARACTER_JUMP_POWER: 12,
  CHARACTER_GRAVITY: -0.6,
  COYOTE_THRESHOLD: 6,
  INITIAL_OBSTACLE_SPEED: 5,
  INITIAL_SPAWN_INTERVAL: 2000,
  MIN_SPAWN_INTERVAL: 800,
  SCORE_RATE: 10,
  FPS_SCALE: 60
};

// ----- GAME STATE ENUM -----
const GameState = Object.freeze({
  HOME: 0,
  RUNNING: 1,
  PAUSED: 2,
  GAMEOVER: 3
});

// Global settings (for audio and haptics)
const SETTINGS = {
  audio: true,
  haptics: true
};

// ----- AUDIO MANAGER -----
class AudioManager {
  constructor() {
    this.jumpSound = new Audio('assets/jump.mp3');
    this.deathSound = new Audio('assets/death.mp3');
    this.bgMusic = new Audio('assets/bg_music.mp3');
    this.bgMusic.loop = true;
    this.jumpSound.volume = 0.5;
    this.deathSound.volume = 0.5;
    this.bgMusic.volume = 0.3;
    window.addEventListener("playerJump", () => {
      if (SETTINGS.audio) {
        this.jumpSound.currentTime = 0;
        this.jumpSound.play();
      }
    });
    window.addEventListener("playerCollision", () => {
      if (SETTINGS.audio) {
        this.deathSound.currentTime = 0;
        this.deathSound.play();
      }
    });
  }
  startBackgroundMusic() {
    if (SETTINGS.audio) this.bgMusic.play();
  }
  pauseBackgroundMusic() {
    this.bgMusic.pause();
  }
  resumeBackgroundMusic() {
    if (SETTINGS.audio) this.bgMusic.play();
  }
  stopBackgroundMusic() {
    this.bgMusic.pause();
    this.bgMusic.currentTime = 0;
  }
  stopDeathSound() {
    this.deathSound.pause();
    this.deathSound.currentTime = 0;
  }
}
const audioManager = new AudioManager();

// ----- ASSET MANAGER -----
class AssetManager {
  constructor(assets) {
    this.assets = assets;
    this.loaded = 0;
    this.total = assets.length;
    this.onComplete = null;
  }
  preload() {
    this.assets.forEach(url => {
      const img = new Image();
      img.onload = () => {
        this.loaded++;
        if (this.loaded === this.total && this.onComplete) {
          this.onComplete();
        }
      };
      img.src = url;
    });
  }
}

// ----- PARTICLE POOL -----
class ParticlePool {
  constructor() {
    this.pool = [];
  }
  getParticle(container) {
    if (this.pool.length > 0) {
      return this.pool.pop();
    } else {
      const elem = document.createElement("div");
      elem.classList.add("particle");
      return elem;
    }
  }
  releaseParticle(elem) {
    this.pool.push(elem);
  }
}
const particlePool = new ParticlePool();

// ----- PARTICLE CLASS (with pooling) -----
class Particle {
  constructor(container, x, y) {
    this.container = container;
    this.element = particlePool.getParticle(container);
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
    if (!this.element.parentNode) container.appendChild(this.element);
    this.element.style.opacity = "1";
    this.element.style.transform = "translateY(0)";
    setTimeout(() => {
      this.element.remove();
      particlePool.releaseParticle(this.element);
    }, 1000);
  }
}

// ----- CHARACTER CLASS -----
class Character {
  constructor(element, groundLevel, onLand) {
    this.element = element;
    this.groundLevel = groundLevel;
    this.jumpPower = CONFIG.CHARACTER_JUMP_POWER;
    this.gravity = CONFIG.CHARACTER_GRAVITY;
    this.velocityY = 0;
    this.yPos = this.groundLevel;
    this.isJumping = false;
    this.coyoteThreshold = CONFIG.COYOTE_THRESHOLD;
    this.coyoteCounter = this.coyoteThreshold;
    this.onLand = onLand;
    this.updatePosition();
  }
  jump() {
    if (this.isJumping && this.coyoteCounter <= 0) return;
    this.isJumping = true;
    this.velocityY = this.jumpPower;
    this.coyoteCounter = 0;
    const jumpEvent = new CustomEvent("playerJump");
    window.dispatchEvent(jumpEvent);
  }
  update() {
    if (this.yPos === this.groundLevel) {
      this.coyoteCounter = this.coyoteThreshold;
    } else if (this.coyoteCounter > 0) {
      this.coyoteCounter--;
    }
    this.velocityY += this.gravity;
    this.yPos += this.velocityY;
    if (this.yPos < this.groundLevel) {
      if (this.isJumping && this.onLand) {
        this.onLand(this.element.offsetLeft, this.element.offsetTop);
        const landEvent = new CustomEvent("playerLand");
        window.dispatchEvent(landEvent);
        if (SETTINGS.haptics && navigator.vibrate) navigator.vibrate(50);
      }
      this.yPos = this.groundLevel;
      this.velocityY = 0;
      this.isJumping = false;
    }
    this.updatePosition();
  }
  updatePosition() {
    this.element.style.bottom = `${this.yPos}px`;
  }
}

// ----- OBSTACLE MANAGER (with pooling & transform movement) -----
class ObstacleManager {
  constructor(container, initialSpeed, spawnInterval) {
    this.container = container;
    this.obstacleSpeed = initialSpeed;
    this.spawnInterval = spawnInterval;
    this.activeObstacles = [];
    this.pool = [];
    this.timeSinceLastSpawn = 0;
    this.minSpawnGap = 1500;
  }
  update(deltaTime) {
    for (let i = this.activeObstacles.length - 1; i >= 0; i--) {
      let obs = this.activeObstacles[i];
      obs.position -= this.obstacleSpeed * deltaTime * CONFIG.FPS_SCALE;
      obs.element.style.transform = `translateX(${obs.position}px)`;
      if (obs.position < -30) {
        obs.element.remove();
        this.pool.push(obs.element);
        this.activeObstacles.splice(i, 1);
      }
    }
    this.timeSinceLastSpawn += deltaTime * 1000;
    let spawnDelay = Math.random() * this.spawnInterval + 500;
    spawnDelay = Math.max(spawnDelay, this.minSpawnGap);
    if (this.timeSinceLastSpawn > spawnDelay) {
      this.spawnObstacle();
      this.timeSinceLastSpawn = 0;
    }
  }
  spawnObstacle() {
    let obsElem;
    if (this.pool.length > 0) {
      obsElem = this.pool.pop();
    } else {
      obsElem = document.createElement("div");
      obsElem.classList.add("obstacle");
    }
    let startPos = this.container.offsetWidth;
    obsElem.style.transform = `translateX(${startPos}px)`;
    if (!obsElem.parentNode) this.container.appendChild(obsElem);
    this.activeObstacles.push({ element: obsElem, position: startPos });
  }
  reset() {
    this.activeObstacles.forEach(obs => obs.element.remove());
    this.activeObstacles = [];
    this.pool.forEach(elem => elem.remove());
    this.pool = [];
    this.timeSinceLastSpawn = 0;
  }
}

// ----- INPUT HANDLER -----
class InputHandler {
  constructor(character, game) {
    this.character = character;
    this.game = game;
    this.bindEvents();
  }
  bindEvents() {
    document.addEventListener("keydown", (e) => {
      if ((e.key === " " || e.key === "ArrowUp") && this.game.state === GameState.RUNNING) {
        this.character.jump();
      }
      if (e.key.toLowerCase() === "p") {
        if (this.game.state === GameState.RUNNING) this.game.pause();
        else if (this.game.state === GameState.PAUSED) this.game.resume();
      }
    });
    document.addEventListener("touchstart", () => {
      if (this.game.state === GameState.RUNNING) this.character.jump();
    });
    let touchStartY = 0;
    document.addEventListener("touchstart", (e) => { touchStartY = e.touches[0].clientY; });
    document.addEventListener("touchend", (e) => {
      let touchEndY = e.changedTouches[0].clientY;
      if (touchStartY - touchEndY > 30 && this.game.state === GameState.RUNNING) {
        this.character.jump();
      }
    });
  }
}

// ----- MAIN GAME CLASS WITH DELTA-TIME GAME LOOP -----
class Game {
  constructor() {
    // Home Screen
    this.state = GameState.HOME;
    this.homeScreen = document.getElementById("home-screen");
    this.startGameBtn = document.getElementById("start-game-btn");

    // Main Game Elements
    this.gameContainer = document.querySelector(".game-container");
    this.characterElement = document.getElementById("character");
    this.scoreDisplay = document.getElementById("score");
    this.highScoreDisplay = document.getElementById("high-score");
    this.gameOverScreen = document.getElementById("game-over-screen");
    this.finalScoreDisplay = document.getElementById("final-score");

    // Icon Buttons
    this.pauseBtn = document.getElementById("pause-btn");
    this.settingsBtn = document.getElementById("settings-btn");
    this.playBtn = document.getElementById("play-btn");

    // Settings Panel
    this.settingsPanel = document.getElementById("settings-panel");
    this.closeSettingsBtn = document.getElementById("close-settings-btn");
    this.audioToggle = document.getElementById("audio-toggle");
    this.hapticToggle = document.getElementById("haptic-toggle");

    // Game Over UI
    this.leaderboardElement = document.getElementById("leaderboard");
    this.shareBtn = document.getElementById("share-btn");

    // Gameplay Settings
    this.score = 0;
    this.highScore = localStorage.getItem("highScore") || 0;
    this.level = 1;
    this.obstacleSpeed = CONFIG.INITIAL_OBSTACLE_SPEED;
    this.spawnInterval = CONFIG.INITIAL_SPAWN_INTERVAL;
    this.lastFrameTime = performance.now();

    // Create Core Objects
    this.character = new Character(
      this.characterElement,
      CONFIG.GROUND_LEVEL,
      (x, y) => this.spawnParticles(x, y)
    );
    this.obstacleManager = new ObstacleManager(this.gameContainer, this.obstacleSpeed, this.spawnInterval);
    this.inputHandler = new InputHandler(this.character, this);

    // Initialize UI
    this.highScoreDisplay.innerText = this.highScore;
    this.scoreDisplay.innerText = "0";
    this.playBtn.style.display = "none";

    // Button Listeners
    this.startGameBtn.addEventListener("click", () => this.startGame());
    this.pauseBtn.addEventListener("click", () => {
      if (this.state === GameState.RUNNING) this.pause();
    });
    this.playBtn.addEventListener("click", () => {
      if (this.state === GameState.PAUSED) this.resume();
    });
    document.getElementById("restart-btn").addEventListener("click", () => this.restart());
    this.shareBtn.addEventListener("click", () => this.shareScore());
    this.settingsBtn.addEventListener("click", () => {
      this.settingsPanel.style.display = "block";
    });
    this.closeSettingsBtn.addEventListener("click", () => {
      this.settingsPanel.style.display = "none";
    });
    this.audioToggle.addEventListener("change", (e) => {
      SETTINGS.audio = e.target.checked;
      if (!SETTINGS.audio) audioManager.pauseBackgroundMusic();
      else audioManager.resumeBackgroundMusic();
    });
    this.hapticToggle.addEventListener("change", (e) => {
      SETTINGS.haptics = e.target.checked;
    });
    window.addEventListener("playerJump", () => console.log("Player jumped!"));
    window.addEventListener("playerLand", () => console.log("Player landed!"));
    window.addEventListener("playerCollision", () => console.log("Collision detected!"));

    audioManager.startBackgroundMusic();
  }

  startGame() {
    this.homeScreen.style.display = "none";
    this.gameContainer.style.display = "block";
    this.state = GameState.RUNNING;
    this.lastFrameTime = performance.now();
    requestAnimationFrame(this.gameLoop.bind(this));
    audioManager.startBackgroundMusic();
  }

  spawnParticles(x, y) {
    for (let i = 0; i < 5; i++) {
      const offsetX = Math.random() * 20 - 10;
      const offsetY = Math.random() * 20 - 10;
      new Particle(this.gameContainer, x + offsetX, y + offsetY);
    }
  }

  gameLoop(currentTime) {
    if (this.state !== GameState.RUNNING) return;
    const deltaTime = (currentTime - this.lastFrameTime) / 1000;
    this.lastFrameTime = currentTime;

    this.character.update();
    this.obstacleManager.update(deltaTime);

    const charRect = this.characterElement.getBoundingClientRect();
    for (let obs of this.obstacleManager.activeObstacles) {
      const obsRect = obs.element.getBoundingClientRect();
      if (
        charRect.right > obsRect.left &&
        charRect.left < obsRect.right &&
        charRect.bottom > obsRect.top
      ) {
        const collEvent = new CustomEvent("playerCollision");
        window.dispatchEvent(collEvent);
        this.gameOver();
        return;
      }
    }

    this.score += deltaTime * CONFIG.SCORE_RATE;
    this.scoreDisplay.innerText = Math.floor(this.score);
    if (this.score > this.highScore) {
      this.highScore = Math.floor(this.score);
      localStorage.setItem("highScore", this.highScore);
      this.highScoreDisplay.innerText = this.highScore;
    }
    this.spawnInterval = Math.max(
      CONFIG.MIN_SPAWN_INTERVAL,
      CONFIG.INITIAL_SPAWN_INTERVAL - (this.score / 5)
    );
    this.obstacleManager.spawnInterval = this.spawnInterval;

    if (Math.floor(this.score) % 1000 === 0 && Math.floor(this.score) !== 0) {
      this.levelUp();
    }

    requestAnimationFrame(this.gameLoop.bind(this));
  }

  levelUp() {
    this.level++;
    this.obstacleSpeed += 1;
    console.log(`Level Up! Now at Level ${this.level}`);
  }

  pause() {
    this.state = GameState.PAUSED;
    this.pauseBtn.style.display = "none";
    this.settingsBtn.style.display = "none";
    this.playBtn.style.display = "block";
    audioManager.pauseBackgroundMusic();
  }

  resume() {
    this.state = GameState.RUNNING;
    this.pauseBtn.style.display = "block";
    this.settingsBtn.style.display = "block";
    this.playBtn.style.display = "none";
    this.lastFrameTime = performance.now();
    requestAnimationFrame(this.gameLoop.bind(this));
    audioManager.resumeBackgroundMusic();
  }

  gameOver() {
    this.state = GameState.GAMEOVER;
    this.finalScoreDisplay.innerText = Math.floor(this.score);
    this.updateLeaderboard(Math.floor(this.score));
    this.showLeaderboard();
    this.gameOverScreen.style.display = "block";
    setTimeout(() => this.gameOverScreen.style.opacity = "1", 10);
    if (SETTINGS.haptics && navigator.vibrate) navigator.vibrate(100);
    audioManager.pauseBackgroundMusic();
    audioManager.stopDeathSound();
  }

  updateLeaderboard(score) {
    let leaderboard = JSON.parse(localStorage.getItem("leaderboard")) || [];
    leaderboard.push(score);
    leaderboard.sort((a, b) => b - a);
    leaderboard = leaderboard.slice(0, 5);
    localStorage.setItem("leaderboard", JSON.stringify(leaderboard));
  }

  showLeaderboard() {
    let leaderboard = JSON.parse(localStorage.getItem("leaderboard")) || [];
    this.leaderboardElement.innerHTML = "";
    leaderboard.forEach((score, index) => {
      let li = document.createElement("li");
      li.textContent = `${index + 1}. ${score}`;
      this.leaderboardElement.appendChild(li);
    });
  }

  shareScore() {
    const tweetText = encodeURIComponent(`I scored ${Math.floor(this.score)} in Jump Dash! Can you beat me?`);
    const url = encodeURIComponent(window.location.href);
    const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}&url=${url}`;
    window.open(twitterUrl, "_blank");
  }

  restart() {
    this.state = GameState.RUNNING;
    this.score = 0;
    this.level = 1;
    this.obstacleSpeed = CONFIG.INITIAL_OBSTACLE_SPEED;
    this.spawnInterval = CONFIG.INITIAL_SPAWN_INTERVAL;
    this.scoreDisplay.innerText = "0";
    this.highScoreDisplay.innerText = this.highScore;
    this.gameOverScreen.style.opacity = "0";
    setTimeout(() => {
      this.gameOverScreen.style.display = "none";
    }, 500);
    this.obstacleManager.reset();
    this.character.yPos = this.character.groundLevel;
    this.character.velocityY = 0;
    this.character.isJumping = false;
    this.character.updatePosition();
    this.pauseBtn.style.display = "block";
    this.settingsBtn.style.display = "block";
    this.playBtn.style.display = "none";
    this.lastFrameTime = performance.now();
    requestAnimationFrame(this.gameLoop.bind(this));
    audioManager.resumeBackgroundMusic();
  }
}

// ----- INITIALIZE GAME AFTER ASSET PRELOAD -----
const assetsToLoad = [
  'assets/Obstacles.png',
  'assets/Particles.png'
];
const assetManager = new AssetManager(assetsToLoad);
assetManager.onComplete = () => {
  console.log("All assets loaded. Ready for home screen.");
};
assetManager.preload();

// ----- REGISTER SERVICE WORKER (for PWA) -----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(registration => {
        console.log('Service Worker registered with scope:', registration.scope);
      })
      .catch(err => {
        console.log('Service Worker registration failed:', err);
      });
  });
}

// Create the game instance so it can be started from the home screen.
const game = new Game();