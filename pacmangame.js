var game = new Phaser.Game(448, 496, Phaser.AUTO, "game");


var PacmanGame = function(game) {
  this.map = null;
  this.layer = null;

  this.numDots = 0;
  this.TOTAL_DOTS = 0;
  this.score = 0;
  this.scoreText = null;

  this.pacman = null;
  this.pacman2 = null;
  this.clyde = null;
  this.pinky = null;
  this.inky = null;
  this.blinky = null;
  this.isInkyOut = false;
  this.isClydeOut = false;
  this.ghosts = [];
  this.pacmans = [];

  this.player = null;

  this.safetile = 14;
  this.gridsize = 16;
  this.threshold = 3;

  this.SPECIAL_TILES = [{
    x: 12,
    y: 11
  }, {
    x: 15,
    y: 11
  }, {
    x: 12,
    y: 23
  }, {
    x: 15,
    y: 23
  }];

  this.TIME_MODES = [{
    mode: "scatter",
    time: 7000
  }, {
    mode: "chase",
    time: 20000
  }, {
    mode: "scatter",
    time: 7000
  }, {
    mode: "chase",
    time: 20000
  }, {
    mode: "scatter",
    time: 5000
  }, {
    mode: "chase",
    time: 20000
  }, {
    mode: "scatter",
    time: 5000
  }, {
    mode: "chase",
    time: -1 // -1 = infinite
  }];
  this.changeModeTimer = 0;
  this.remainingTime = 0;
  this.currentMode = 0;
  this.isFrightenedMode = false;
  this.FRIGHTENED_MODE_TIME = 7000;

  this.ORIGINAL_OVERFLOW_ERROR_ON = true;
  this.DEBUG_ON = true;

  this.KEY_COOLING_DOWN_TIME = 250;
  this.lastKeyPressed = 0;

  this.game = game;
  this.countDown = 3;
  this.isTouchDevice = 'ontouchstart' in document.documentElement;

  this.touchControls = {
    up: false,
    down: false,
    right: false,
    left: false
  };
};

PacmanGame.prototype = {

  init: function() {
    this.scale.scaleMode = Phaser.ScaleManager.SHOW_ALL;
    this.scale.pageAlignHorizontally = true;
    this.scale.pageAlignVertically = true;

    Phaser.Canvas.setImageRenderingCrisp(this.game.canvas); // full retro mode, i guess ;)

    this.physics.startSystem(Phaser.Physics.ARCADE);

    var _this = this;
    document.getElementById('upArrow').addEventListener('touchstart', function() {
      _this.touchControls.up = true;
    });
    document.getElementById('downArrow').addEventListener('touchstart', function() {
      _this.touchControls.down = true;
    });
    document.getElementById('rightArrow').addEventListener('touchstart', function() {
      _this.touchControls.right = true;
    });
    document.getElementById('leftArrow').addEventListener('touchstart', function() {
      _this.touchControls.left = true;
    });

    document.getElementById('upArrow').addEventListener('touchend', function() {
      _this.touchControls.up = false;
    });
    document.getElementById('downArrow').addEventListener('touchend', function() {
      _this.touchControls.down = false;
    });
    document.getElementById('rightArrow').addEventListener('touchend', function() {
      _this.touchControls.right = false;
    });
    document.getElementById('leftArrow').addEventListener('touchend', function() {
      _this.touchControls.left = false;
    });
  },

  preload: function() {
    //  We need this because the assets are on Amazon S3
    //  Remove the next 2 lines if running locally
    //this.load.baseURL = 'http://files.phaser.io.s3.amazonaws.com/codingtips/issue005/';
    //this.load.crossOrigin = 'anonymous';

    this.load.image('dot', 'assets/dot.png');
    this.load.image("pill", "assets/pill16.png");
    this.load.image('tiles', 'assets/pacman-tiles.png');
    this.load.spritesheet('pacman', 'assets/pacman.png', 32, 32);
    this.load.spritesheet("ghosts", "assets/ghosts32.png", 32, 32);
    this.load.tilemap('map', 'assets/pacman-map.json', null, Phaser.Tilemap.TILED_JSON);

    //  Needless to say, the beast was stoned... and the graphics are Namco (C)opyrighted
  },

  setupNetworking: function() {
    var _this = this,
      socket = io();

    socket.on('new game', function() {
      _this.countDown = 3;
      _this.dots.callAll('revive');
      _this.pills.callAll('revive');
      _this.score = 0;
      _this.pacmans = [];
      _this.ghosts = [];

      if (_this.pacman2) {
        _this.pacman2.sprite.destroy();
        delete _this.pacman2;
      }

      if (_this.pacman) {
        _this.pacman.sprite.destroy();
        delete _this.pacman;
      }

      if (_this.blinky) {
        _this.blinky.sprite.destroy();
        delete _this.blinky;
      }
    });

    socket.on('game state', function(state) {
      console.log(JSON.stringify(state, null, 4));
      var character = _this[state.character.name];

      if (!character) {
        if (state.character.name === 'pacman') {
          _this.pacman = new Pacman(_this, "pacman", 'pacman');
          _this.pacmans.push(_this.pacman);
        }

        if (state.character.name === 'pacman2') {
          _this.pacman2 = new Pacman(_this, "pacman", 'pacman2');
          _this.pacman2.sprite.tint = 0xFF00;
          _this.pacmans.push(_this.pacman2);
        }

        if (state.character.name === 'blinky') {
          // Ghosts
          _this.blinky = new Ghost(_this, "ghosts", "blinky", {
            x: 13,
            y: 11
          }, Phaser.RIGHT);
          _this.blinky.move(Phaser.RIGHT);
          // this.pinky = new Ghost(this, "ghosts", "pinky", {x:15, y:14}, Phaser.LEFT);
          // this.inky = new Ghost(this, "ghosts", "inky", {x:14, y:14}, Phaser.RIGHT);
          // this.clyde = new Ghost(this, "ghosts", "clyde", {x:17, y:14}, Phaser.LEFT);
          //this.ghosts.push(this.clyde, this.pinky, this.inky, this.blinky);
          _this.ghosts.push(_this.blinky);
        }

        character = _this[state.character.name];

        character.turnPoint.x = state.pacman.x;
        character.turnPoint.y = state.pacman.y;
        character.sprite.x = state.pacman.x;
        character.sprite.y = state.pacman.y;
        character.turning = state.pacman.direction;
        character.want2go = state.pacman.direction;
      }

      if (state.character.id !== socket.id) {

        character = _this[state.character.name];

        character.turnPoint.x = state.pacman.x;
        character.turnPoint.y = state.pacman.y;
        character.sprite.x = state.pacman.x;
        character.sprite.y = state.pacman.y;
        character.turning = state.pacman.direction;
        character.want2go = state.pacman.direction;
      }



      if (state.character.id === socket.id) {
        _this.player = _this[state.character.name];
        _this.player.name = state.character.name;
        _this.player.lastPacketSentAt = performance.now();

        if (state.character.name === 'pacman') {
          _this.avatar = _this.game.add.sprite((24 * 16) + 8, (17 * 16) - 8, 'pacman', 1);
        }

        if (state.character.name === 'pacman2') {
          _this.avatar = _this.game.add.sprite((24 * 16) + 8, (17 * 16) - 8, 'pacman', 1);
          _this.avatar.tint = 0xFF00;
        }

        if (state.character.name === 'blinky') {
          _this.avatar = _this.game.add.sprite((24 * 16) + 8, (17 * 16) - 8, 'ghosts', 12);
        }
      }
    });

    this.socket = socket;
  },

  create: function() {
    this.map = this.add.tilemap('map');
    this.map.addTilesetImage('pacman-tiles', 'tiles');

    this.layer = this.map.createLayer('Pacman');

    this.dots = this.add.physicsGroup();
    this.numDots = this.map.createFromTiles(7, this.safetile, 'dot', this.layer, this.dots);
    this.TOTAL_DOTS = this.numDots;

    this.pills = this.add.physicsGroup();
    this.numPills = this.map.createFromTiles(40, this.safetile, "pill", this.layer, this.pills);

    //  The dots will need to be offset by 6px to put them back in the middle of the grid
    this.dots.setAll('x', 6, false, false, 1);
    this.dots.setAll('y', 6, false, false, 1);

    //  Pacman should collide with everything except the safe tile
    this.map.setCollisionByExclusion([this.safetile], true, this.layer);

    // Score and debug texts
    game.add.text(375, 272, "P: ", {
      fontSize: "16px",
      fill: "#fff"
    });

    this.scoreText = game.add.text(8, 272, "Score: " + this.score, {
      fontSize: "16px",
      fill: "#fff"
    });
    this.debugText = game.add.text(0, 0, "", {
      fontSize: "12px",
      fill: "#fff"
    });
    this.overflowText = game.add.text(375, 280, "", {
      fontSize: "12px",
      fill: "#fff"
    });
    this.countDownText = game.add.text(224, 235, "", {
      fontSize: "48px",
      fill: "#fff"
    });
    this.countDownText.anchor.set(0.5);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.cursors["d"] = this.input.keyboard.addKey(Phaser.Keyboard.D);
    this.cursors["b"] = this.input.keyboard.addKey(Phaser.Keyboard.B);
    this.cursors["t"] = this.input.keyboard.addKey(Phaser.Keyboard.T);
    this.cursors["t"].onDown.add(function() {
      this.isTouchDevice = !this.isTouchDevice;
    }, this);

    // this.game.time.events.add(1250, this.sendExitOrder, this);
    // this.game.time.events.add(7000, this.sendAttackOrder, this);

    this.changeModeTimer = this.time.time + this.TIME_MODES[this.currentMode].time;

    // this.sendExitOrder(this.pinky);
    this.game.stage.disableVisibilityChange = true;
    this.setupNetworking();
  },

  checkKeys: function() {
    if (this.player) {
      if (this.isTouchDevice) {
        this.cursors.down.isDown = this.touchControls.down;
        this.cursors.up.isDown = this.touchControls.up;
        this.cursors.right.isDown = this.touchControls.right;
        this.cursors.left.isDown = this.touchControls.left;
      }
      this.player.checkKeys(this.cursors);
    }

    if (this.lastKeyPressed < this.time.time) {
      if (this.cursors.d.isDown) {
        this.DEBUG_ON = (this.DEBUG_ON) ? false : true;
        this.lastKeyPressed = this.time.time + this.KEY_COOLING_DOWN_TIME;
      }
      if (this.cursors.b.isDown) {
        this.ORIGINAL_OVERFLOW_ERROR_ON = this.ORIGINAL_OVERFLOW_ERROR_ON ? false : true;
        this.pinky.ORIGINAL_OVERFLOW_ERROR_ON = this.ORIGINAL_OVERFLOW_ERROR_ON;
      }
    }
  },

  checkMouse: function() {
    if (this.input.mousePointer.isDown) {
      var x = this.game.math.snapToFloor(Math.floor(this.input.x), this.gridsize) / this.gridsize;
      var y = this.game.math.snapToFloor(Math.floor(this.input.y), this.gridsize) / this.gridsize;
      this.debugPosition = new Phaser.Point(x * this.gridsize, y * this.gridsize);
      console.log(x, y);
    }
  },

  dogEatsDog: function(pacman, ghost) {
    if (this.isFrightenedMode) {
      this[ghost.name].mode = this[ghost.name].RETURNING_HOME;
      this[ghost.name].ghostDestination = new Phaser.Point(14 * this.gridsize, 14 * this.gridsize);
      this[ghost.name].resetSafeTiles();
      this.score += 10;
    } else {
      this.killPacman(pacman);
    }
  },

  getCurrentMode: function() {
    if (!this.isFrightenedMode) {
      if (this.TIME_MODES[this.currentMode].mode === "scatter") {
        return "scatter";
      } else {
        return "chase";
      }
    } else {
      return "random";
    }
  },

  gimeMeExitOrder: function(ghost) {
    this.game.time.events.add(3000, this.sendExitOrder, this, ghost);
  },

  killPacman: function(pacman) {
    this[pacman.name].isDead = true;
    //this.stopGhosts();
  },

  stopGhosts: function() {
    for (var i = 0; i < this.ghosts.length; i++) {
      this.ghosts[i].mode = this.ghosts[i].STOP;
    }
  },

  update: function() {
    this.scoreText.text = "Score: " + this.score;
    if (this.DEBUG_ON) {
      this.debugText.text = "Debug ON";
    } else {
      this.debugText.text = "";
    }

    if (this.player) {
      this.debugText.text = this.player.name + ": " + parseInt(this.player.sprite.x) + ' ' + parseInt(this.player.sprite.y) + ' ' + this.player.marker;
    }

    //if (this.pacman && !this.pacman.isDead) {
    if (true) {
      for (var i = 0; i < this.ghosts.length; i++) {
        if (this.ghosts[i].mode !== this.ghosts[i].RETURNING_HOME) {
          for (var j = 0; j < this.pacmans.length; j++) {
            this.physics.arcade.overlap(this.pacmans[j].sprite, this.ghosts[i].sprite, this.dogEatsDog, null, this);
          }
        }
      }

      if (this.TOTAL_DOTS - this.numDots > 30 && !this.isInkyOut) {
        this.isInkyOut = true;
        this.sendExitOrder(this.inky);
      }

      if (this.numDots < this.TOTAL_DOTS / 3 && !this.isClydeOut) {
        this.isClydeOut = true;
        this.sendExitOrder(this.clyde);
      }

      // if (this.changeModeTimer !== -1 && !this.isFrightenedMode && this.changeModeTimer < this.time.time) {
      //   this.currentMode = Math.min(7, ++this.currentMode);
      //   var modeDuration = this.TIME_MODES[this.currentMode].time;

      //   if (modeDuration > 0) {
      //     this.changeModeTimer = this.time.time + this.TIME_MODES[this.currentMode].time;
      //   } else {
      //     this.changeModeTimer = -1;  
      //   }

      //   if (this.TIME_MODES[this.currentMode].mode === "chase") {
      //     this.sendAttackOrder();
      //   } else {
      //     this.sendScatterOrder();
      //   }
      //   console.log("new mode:", this.TIME_MODES[this.currentMode].mode, this.TIME_MODES[this.currentMode].time);
      // }
      if (this.isFrightenedMode && this.changeModeTimer < this.time.time) {
        this.changeModeTimer = this.time.time + this.remainingTime;
        this.isFrightenedMode = false;
        if (this.TIME_MODES[this.currentMode].mode === "chase") {
          this.sendAttackOrder();
        } else {
          this.sendScatterOrder();
        }
        console.log("new mode:", this.TIME_MODES[this.currentMode].mode, this.TIME_MODES[this.currentMode].time);
      }
    }

    this.updateGhosts();

    this.checkKeys();
    this.checkMouse();

    if (this.countDown > 0) {
      var _this = this;
      this.countDownTimer = setInterval(function() {
        if (_this.countDown === 0) {
          clearInterval(_this.countDownTimer);
          this.game.paused = false;
          _this.countDownText.text = "";
          return;
        }
        _this.countDown--;
        if (_this.countDown > 0) {
          _this.countDownText.text = _this.countDown;
        } else {
          _this.countDownText.text = 'Go!';
        }
      }, 1000)
      this.game.paused = true;
      this.countDownText.text = this.countDown;
    }

    document.getElementById('upArrow').style.display = this.isTouchDevice ? 'block' : 'none';
    document.getElementById('downArrow').style.display = this.isTouchDevice ? 'block' : 'none';
    document.getElementById('rightArrow').style.display = this.isTouchDevice ? 'block' : 'none';
    document.getElementById('leftArrow').style.display = this.isTouchDevice ? 'block' : 'none';
  },

  enterFrightenedMode: function() {
    for (var i = 0; i < this.ghosts.length; i++) {
      this.ghosts[i].enterFrightenedMode();
    }
    if (!this.isFrightenedMode) {
      this.remainingTime = this.changeModeTimer - this.time.time;
    }
    this.changeModeTimer = this.time.time + this.FRIGHTENED_MODE_TIME;
    this.isFrightenedMode = true;
    console.log('frightened mode', this.remainingTime);
  },

  isSpecialTile: function(tile) {
    for (var q = 0; q < this.SPECIAL_TILES.length; q++) {
      if (tile.x === this.SPECIAL_TILES[q].x && tile.y === this.SPECIAL_TILES[q].y) {
        return true;
      }
    }
    return false;
  },

  updateGhosts: function() {
    for (var i = 0; i < this.pacmans.length; i++) {
      this.pacmans[i].update();
    }

    for (var i = 0; i < this.ghosts.length; i++) {
      this.ghosts[i].update();
    }
  },

  render: function() {
    if (this.DEBUG_ON) {
      for (var i = 0; i < this.ghosts.length; i++) {
        var color = "rgba(0, 255, 255, 0.6)";
        switch (this.ghosts[i].name) {
          case "blinky":
            color = "rgba(255, 0, 0, 0.6";
            break;
          case "pinky":
            color = "rgba(255, 105, 180, 0.6";
            break;
          case "clyde":
            color = "rgba(255, 165, 0, 0.6";
            break;
        }
        if (this.ghosts[i].ghostDestination) {
          var x = this.game.math.snapToFloor(Math.floor(this.ghosts[i].ghostDestination.x), this.gridsize);
          var y = this.game.math.snapToFloor(Math.floor(this.ghosts[i].ghostDestination.y), this.gridsize);
          this.game.debug.geom(new Phaser.Rectangle(x, y, 16, 16), color);
        }
      }
      if (this.debugPosition) {
        this.game.debug.geom(new Phaser.Rectangle(this.debugPosition.x, this.debugPosition.y, 16, 16), "#00ff00");
      }
    } else {
      this.game.debug.reset();
    }
  },

  sendAttackOrder: function() {
    for (var i = 0; i < this.ghosts.length; i++) {
      this.ghosts[i].attack();
    }
  },

  sendExitOrder: function(ghost) {
    if (ghost) {
      ghost.mode = Ghost.EXIT_HOME;
    }
  },

  sendScatterOrder: function() {
    for (var i = 0; i < this.ghosts.length; i++) {
      this.ghosts[i].scatter();
    }
  }
};

game.state.add('Game', PacmanGame, true);
