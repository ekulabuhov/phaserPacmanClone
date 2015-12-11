var Ghost = function(game, key, name, startPos, startDir) {
  this.game = game;
  this.key = key;
  this.name = name;

  this.ORIGINAL_OVERFLOW_ERROR_ON = this.game.ORIGINAL_OVERFLOW_ERROR_ON;

  this.gridsize = this.game.gridsize;
  this.safetiles = [this.game.safetile, 35, 36];
  this.startDir = startDir;
  this.startPos = startPos;
  this.threshold = 6;

  this.turnTimer = 0;
  this.TURNING_COOLDOWN = 150;
  this.RETURNING_COOLDOWN = 100;
  this.RANDOM = "random";
  this.SCATTER = "scatter";
  this.CHASE = "chase";
  this.STOP = "stop";
  this.AT_HOME = "at_home";
  this.EXIT_HOME = "leaving_home";
  this.RETURNING_HOME = "returning_home";
  this.isAttacking = false;

  this.turning = Phaser.NONE;
  this.want2go = Phaser.NONE;
  this.keyPressTimer = 0;
  this.KEY_COOLING_DOWN_TIME = 750;

  this.mode = this.AT_HOME;
  this.scatterDestination = new Phaser.Point(27 * this.gridsize, 30 * this.gridsize);

  this.spriteSpeed = 150;
  this.spriteScatterSpeed = 125;
  this.spriteFrightenedSpeed = 75;
  this.cruiseElroySpeed = 160;
  this.directions = [null, null, null, null, null];
  this.opposites = [Phaser.NONE, Phaser.RIGHT, Phaser.LEFT, Phaser.DOWN, Phaser.UP];
  this.currentDir = 0;

  this.turnPoint = new Phaser.Point();
  this.lastPosition = {
    x: -1,
    y: -1
  };

  this.timeSinceLastPacket = 0;

  var offsetGhost = 0;
  switch (this.name) {
    case "clyde":
      offsetGhost = 4;
      this.scatterDestination = new Phaser.Point(0, 30 * this.gridsize);
      break;
    case "pinky":
      offsetGhost = 8;
      this.scatterDestination = new Phaser.Point(0, 0);
      break;
    case "blinky":
      offsetGhost = 12;
      this.scatterDestination = new Phaser.Point(27 * this.gridsize, 0);
      this.safetiles = [this.game.safetile];
      this.mode = this.SCATTER;
      break;

    default:
      break;
  }

  this.sprite = this.game.add.sprite((startPos.x * 16) + 8, (startPos.y * 16) + 8, key, 0);
  this.sprite.name = this.name;
  this.sprite.anchor.set(0.5);
  this.sprite.animations.add(Phaser.LEFT, [offsetGhost], 0, false);
  this.sprite.animations.add(Phaser.UP, [offsetGhost + 1], 0, false);
  this.sprite.animations.add(Phaser.DOWN, [offsetGhost + 2], 0, false);
  this.sprite.animations.add(Phaser.RIGHT, [offsetGhost + 3], 0, false);
  this.sprite.animations.add("frightened", [16, 17], 10, true);
  this.sprite.animations.add(Phaser.RIGHT + 20, [20], 0, false);
  this.sprite.animations.add(Phaser.LEFT + 20, [21], 0, false);
  this.sprite.animations.add(Phaser.UP + 20, [22], 0, false);
  this.sprite.animations.add(Phaser.DOWN + 20, [23], 0, false);

  this.sprite.play(startDir);

  this.game.physics.arcade.enable(this.sprite);
  this.sprite.body.setSize(16, 16, 0, 0);
};

Ghost.EXIT_HOME = "leaving_home";
Ghost.CHASE = "chase";

Ghost.prototype = {
  update: function() {
    if (this.mode !== this.RETURNING_HOME) {
      this.game.physics.arcade.collide(this.sprite, this.game.layer);
    }

    var x = this.game.math.snapToFloor(Math.floor(this.sprite.x), this.gridsize) / this.gridsize;
    var y = this.game.math.snapToFloor(Math.floor(this.sprite.y), this.gridsize) / this.gridsize;
    this.marker = new Phaser.Point(x, y);

    if (this.sprite.x < 0) {
      this.sprite.x = this.game.map.widthInPixels - 2;
    }
    if (this.sprite.x >= this.game.map.widthInPixels - 1) {
      this.sprite.x = 1;
    }

    if (this.isAttacking && (this.mode === this.SCATTER || this.mode === this.CHASE)) {
      this.spriteDestination = this.getGhostDestination();
      this.mode = this.CHASE;
    }

    if (this.game.math.fuzzyEqual((x * this.gridsize) + (this.gridsize / 2), this.sprite.x, this.threshold) &&
      this.game.math.fuzzyEqual((y * this.gridsize) + (this.gridsize / 2), this.sprite.y, this.threshold)) {
      //  Update our grid sensors
      this.directions[0] = this.game.map.getTile(x, y, this.game.layer);
      this.directions[1] = this.game.map.getTileLeft(this.game.layer.index, x, y) || this.directions[1];
      this.directions[2] = this.game.map.getTileRight(this.game.layer.index, x, y) || this.directions[2];
      this.directions[3] = this.game.map.getTileAbove(this.game.layer.index, x, y) || this.directions[3];
      this.directions[4] = this.game.map.getTileBelow(this.game.layer.index, x, y) || this.directions[4];

      if (this.turning !== Phaser.NONE) {
        this.turn();
      }

      var canContinue = this.checkSafetile(this.directions[this.currentDir].index);
      var possibleExits = [];
      for (var q = 1; q < this.directions.length; q++) {
        if (this.checkSafetile(this.directions[q].index) && q !== this.opposites[this.currentDir]) {
          possibleExits.push(q);
        }
      }

      if (this.mode !== this.RETURNING_HOME && this.mode !== this.AT_HOME && this.mode !== this.EXIT_HOME) {
        return;
      }

      switch (this.mode) {
        case this.RANDOM:
          if (this.turnTimer < this.game.time.time && (possibleExits.length > 1 || !canContinue)) {
            var select = Math.floor(Math.random() * possibleExits.length);
            var newDirection = possibleExits[select];

            this.turnPoint.x = (x * this.gridsize) + (this.gridsize / 2);
            this.turnPoint.y = (y * this.gridsize) + (this.gridsize / 2);

            // snap to grid exact position before turning
            this.sprite.x = this.turnPoint.x;
            this.sprite.y = this.turnPoint.y;

            this.lastPosition = {
              x: x,
              y: y
            };
            this.sprite.body.reset(this.turnPoint.x, this.turnPoint.y);
            this.move(newDirection);

            this.turnTimer = this.game.time.time + this.TURNING_COOLDOWN;
          }
          break;

        case this.RETURNING_HOME:
          if (this.turnTimer < this.game.time.time) {
            this.sprite.body.reset(this.sprite.x, this.sprite.y);
            if (this.flag = this.flag ? false : true) {
              this.sprite.body.velocity.x = 0;
              if (this.sprite.y < 14 * this.gridsize) {
                this.sprite.body.velocity.y = this.cruiseElroySpeed;
                this.sprite.animations.play(23);
              }
              if (this.sprite.y > 15 * this.gridsize) {
                this.sprite.body.velocity.y = -this.cruiseElroySpeed;
                this.sprite.animations.play(22);
              }
            } else {
              this.sprite.body.velocity.y = 0;
              if (this.sprite.x < 13 * this.gridsize) {
                this.sprite.body.velocity.x = this.cruiseElroySpeed;
                this.sprite.animations.play(20);
              }
              if (this.sprite.x > 16 * this.gridsize) {
                this.sprite.body.velocity.x = -this.cruiseElroySpeed;
                this.sprite.animations.play(21);
              }
            }
            this.turnTimer = this.game.time.time + this.RETURNING_COOLDOWN;
          }
          if (this.hasReachedHome()) {
            this.turnPoint.x = (x * this.gridsize) + (this.gridsize / 2);
            this.turnPoint.y = (y * this.gridsize) + (this.gridsize / 2);
            this.sprite.x = this.turnPoint.x;
            this.sprite.y = this.turnPoint.y;
            this.sprite.body.reset(this.turnPoint.x, this.turnPoint.y);
            this.mode = this.AT_HOME;
            this.game.gimeMeExitOrder(this);
          }
          break;

        case this.CHASE:
          if (this.turnTimer < this.game.time.time) {
            var distanceToObj = 999999;
            var direction, decision, bestDecision;
            for (q = 0; q < possibleExits.length; q++) {
              direction = possibleExits[q];
              switch (direction) {
                case Phaser.LEFT:
                  decision = new Phaser.Point((x - 1) * this.gridsize + (this.gridsize / 2), (y * this.gridsize) + (this.gridsize / 2));
                  break;
                case Phaser.RIGHT:
                  decision = new Phaser.Point((x + 1) * this.gridsize + (this.gridsize / 2), (y * this.gridsize) + (this.gridsize / 2));
                  break;
                case Phaser.UP:
                  decision = new Phaser.Point(x * this.gridsize + (this.gridsize / 2), ((y - 1) * this.gridsize) + (this.gridsize / 2));
                  break;
                case Phaser.DOWN:
                  decision = new Phaser.Point(x * this.gridsize + (this.gridsize / 2), ((y + 1) * this.gridsize) + (this.gridsize / 2));
                  break;
                default:
                  break;
              }
              var dist = this.spriteDestination.distance(decision);
              if (dist < distanceToObj) {
                bestDecision = direction;
                distanceToObj = dist;
              }
            }

            if (this.game.isSpecialTile({
                x: x,
                y: y
              }) && bestDecision === Phaser.UP) {
              bestDecision = this.currentDir;
            }

            this.turnPoint.x = (x * this.gridsize) + (this.gridsize / 2);
            this.turnPoint.y = (y * this.gridsize) + (this.gridsize / 2);

            // snap to grid exact position before turning
            this.sprite.x = this.turnPoint.x;
            this.sprite.y = this.turnPoint.y;

            this.lastPosition = {
              x: x,
              y: y
            };

            this.sprite.body.reset(this.turnPoint.x, this.turnPoint.y);
            this.move(bestDecision);

            this.turnTimer = this.game.time.time + this.TURNING_COOLDOWN;
          }
          break;

        case this.AT_HOME:
          if (!canContinue) {
            this.turnPoint.x = (x * this.gridsize) + (this.gridsize / 2);
            this.turnPoint.y = (14 * this.gridsize) + (this.gridsize / 2);
            this.sprite.x = this.turnPoint.x;
            this.sprite.y = this.turnPoint.y;
            this.sprite.body.reset(this.turnPoint.x, this.turnPoint.y);
            var dir = (this.currentDir === Phaser.LEFT) ? Phaser.RIGHT : Phaser.LEFT;
            this.move(dir);
          } else {
            this.move(this.currentDir);
          }
          break;

        case this.EXIT_HOME:
          if (this.currentDir !== Phaser.UP && (x >= 13 || x <= 14)) {
            this.turnPoint.x = (13 * this.gridsize) + (this.gridsize / 2);
            this.turnPoint.y = (y * this.gridsize) + (this.gridsize / 2);
            this.sprite.x = this.turnPoint.x;
            this.sprite.y = this.turnPoint.y;
            this.sprite.body.reset(this.turnPoint.x, this.turnPoint.y);
            this.move(Phaser.UP);
          } else if (this.currentDir === Phaser.UP && y == 11) {
            this.turnPoint.x = (x * this.gridsize) + (this.gridsize / 2);
            this.turnPoint.y = (y * this.gridsize) + (this.gridsize / 2);
            this.sprite.x = this.turnPoint.x;
            this.sprite.y = this.turnPoint.y;
            this.sprite.body.reset(this.turnPoint.x, this.turnPoint.y);
            this.safetiles = [this.game.safetile];
            this.mode = this.game.getCurrentMode();
            return;
          } else if (!canContinue) {
            this.turnPoint.x = (x * this.gridsize) + (this.gridsize / 2);
            this.turnPoint.y = (y * this.gridsize) + (this.gridsize / 2);
            this.sprite.x = this.turnPoint.x;
            this.sprite.y = this.turnPoint.y;
            this.sprite.body.reset(this.turnPoint.x, this.turnPoint.y);
            var dir = (this.currentDir === Phaser.LEFT) ? Phaser.RIGHT : Phaser.LEFT;
            this.move(dir);
          }
          break;

        case this.SCATTER:
          this.spriteDestination = new Phaser.Point(this.scatterDestination.x, this.scatterDestination.y);
          this.mode = this.CHASE;
          break;

        case this.STOP:
          this.move(Phaser.NONE);
          break;
      }
    }
  },

  turn: function() {
    var cx = Math.floor(this.sprite.x);
    var cy = Math.floor(this.sprite.y);

    //  This needs a threshold, because at high speeds you can't turn because the coordinates skip past
    if (!this.game.math.fuzzyEqual(cx, this.turnPoint.x, this.threshold) || !this.game.math.fuzzyEqual(cy, this.turnPoint.y, this.threshold)) {
      return false;
    }

    //  Grid align before turning
    this.sprite.x = this.turnPoint.x;
    this.sprite.y = this.turnPoint.y;

    this.sprite.body.reset(this.turnPoint.x, this.turnPoint.y);
    this.move(this.turning);
    this.turning = Phaser.NONE;

    return true;
  },

  checkKeys: function(cursors) {
    // don't accept input in this state
    if (this.mode === this.RETURNING_HOME || this.mode === this.AT_HOME) {
      return;
    }

    if (cursors.left.isDown ||
      cursors.right.isDown ||
      cursors.up.isDown ||
      cursors.down.isDown) {
      this.keyPressTimer = this.game.time.time + this.KEY_COOLING_DOWN_TIME;
    }

    if (cursors.left.isDown && this.currentDir !== Phaser.LEFT) {
      this.want2go = Phaser.LEFT;
    } else if (cursors.right.isDown && this.currentDir !== Phaser.RIGHT) {
      this.want2go = Phaser.RIGHT;
    } else if (cursors.up.isDown && this.currentDir !== Phaser.UP) {
      this.want2go = Phaser.UP;
    } else if (cursors.down.isDown && this.currentDir !== Phaser.DOWN) {
      this.want2go = Phaser.DOWN;
    }

    if (this.game.time.time > this.keyPressTimer) {
      //  This forces them to hold the key down to turn the corner
      this.turning = Phaser.NONE;
      this.want2go = Phaser.NONE;
    } else {
      //this.game.socket.emit('move', this.want2go);  
      this.checkDirection(this.want2go);
    }
  },

  checkDirection: function(turnTo) {
    if (this.turning === turnTo || this.directions[turnTo] === null || !this.checkSafetile(this.directions[turnTo].index)) {
      //  Invalid direction if they're already set to turn that way
      //  Or there is no tile there, or the tile isn't index 1 (a floor tile)
      return;
    }

    //  Check if they want to turn around and can
    if (this.currentDir === this.opposites[turnTo]) {
      this.move(turnTo);
      this.keyPressTimer = this.game.time.time;
    } else {
      this.turning = turnTo;

      var x = this.game.math.snapToFloor(Math.floor(this.sprite.x), this.gridsize) / this.gridsize;
      var y = this.game.math.snapToFloor(Math.floor(this.sprite.y), this.gridsize) / this.gridsize;

      this.turnPoint.x = (x * this.gridsize) + (this.gridsize / 2);
      this.turnPoint.y = (y * this.gridsize) + (this.gridsize / 2);
      console.log('turnpoint set x: ' + this.turnPoint.x + ' y:' + this.turnPoint.y);
      this.want2go = Phaser.NONE;
    }
  },

  attack: function() {
    if (this.mode !== this.RETURNING_HOME) {
      this.isAttacking = true;
      this.sprite.animations.play(this.currentDir);
      if (this.mode !== this.AT_HOME && this.mode != this.EXIT_HOME) {
        this.currentDir = this.opposites[this.currentDir];
      }
    }
  },

  checkSafetile: function(tileIndex) {
    for (var q = 0; q < this.safetiles.length; q++) {
      if (this.safetiles[q] == tileIndex) {
        return true;
      }
    }
    return false;
  },

  enterFrightenedMode: function() {
    if (this.mode !== this.AT_HOME && this.mode !== this.EXIT_HOME && this.mode !== this.RETURNING_HOME) {
      this.sprite.play("frightened");
      this.mode = this.RANDOM;
      this.isAttacking = false;
    }
  },

  getGhostDestination: function() {
    switch (this.name) {
      case "blinky":
        return this.game.pacman.getPosition();

      case "pinky":
        var dest = this.game.pacman.getPosition();
        var dir = this.game.pacman.getCurrentDirection();
        var offsetX = 0,
          offsetY = 0;
        if (dir === Phaser.LEFT || dir === Phaser.RIGHT) {
          offsetX = (dir === Phaser.RIGHT) ? -4 : 4;
        }
        if (dir === Phaser.UP || dir === Phaser.DOWN) {
          offsetY = (dir === Phaser.DOWN) ? -4 : 4;
          if (dir === Phaser.UP && this.ORIGINAL_OVERFLOW_ERROR_ON) {
            offsetX = 4;
          }
        }
        offsetX *= this.gridsize;
        offsetY *= this.gridsize;
        dest.x -= offsetX;
        dest.y -= offsetY;
        if (dest.x < this.gridsize / 2) dest.x = this.gridsize / 2;
        if (dest.x > this.game.map.widthInPixels - this.gridsize / 2) dest.x = this.game.map.widthInPixels - this.gridsize / 2;
        if (dest.y < this.gridsize / 2) dest.y = this.gridsize / 2;
        if (dest.y > this.game.map.heightInPixels - this.gridsize / 2) dest.y = this.game.map.heightInPixels - this.gridsize / 2;
        return dest;

      case "inky":
        var pacmanPos = this.game.pacman.getPosition();
        var blinkyPos = this.game.blinky.getPosition();
        var diff = Phaser.Point.subtract(pacmanPos, blinkyPos);
        var dest = Phaser.Point.add(pacmanPos, diff);
        if (dest.x < this.gridsize / 2) dest.x = this.gridsize / 2;
        if (dest.x > this.game.map.widthInPixels - this.gridsize / 2) dest.x = this.game.map.widthInPixels - this.gridsize / 2;
        if (dest.y < this.gridsize / 2) dest.y = this.gridsize / 2;
        if (dest.y > this.game.map.heightInPixels - this.gridsize / 2) dest.y = this.game.map.heightInPixels - this.gridsize / 2;
        return dest;

      case "clyde":
        var pacmanPos = this.game.pacman.getPosition();
        var clydePos = this.getPosition();
        if (clydePos.distance(pacmanPos) > 8 * this.gridsize) {
          return pacmanPos;
        } else {
          return new Phaser.Point(this.scatterDestination.x, this.scatterDestination.y);
        }

      default:
        return new Phaser.Point(this.scatterDestination.x, this.scatterDestination.y);
    }
  },

  getPosition: function() {
    var x = this.game.math.snapToFloor(Math.floor(this.sprite.x), this.gridsize) / this.gridsize;
    var y = this.game.math.snapToFloor(Math.floor(this.sprite.y), this.gridsize) / this.gridsize;
    return new Phaser.Point((x * this.gridsize) + (this.gridsize / 2), (y * this.gridsize) + (this.gridsize / 2));
  },

  hasReachedHome: function() {
    if (this.sprite.x < 11 * this.gridsize || this.sprite.x > 16 * this.gridsize ||
      this.sprite.y < 13 * this.gridsize || this.sprite.y > 15 * this.gridsize) {
      return false;
    }
    return true;
  },

  move: function(dir) {
    if (this.currentDir !== dir) {
      this.currentDir = dir;

      // we only want to send packets for our own char
      if (this.game.socket && this.game.player === this && this.mode !== this.AT_HOME && this.mode !== this.EXIT_HOME) {
        var currentTime = performance.now();
        this.game.socket.emit('move', {
          x: this.sprite.x,
          y: this.sprite.y,
          direction: this.currentDir
        });
      }
    }

    var speed = this.spriteSpeed;
    if (this.game.getCurrentMode() === this.SCATTER) {
      speed = this.spriteScatterSpeed;
    }
    if (this.mode === this.RANDOM) {
      speed = this.spriteFrightenedSpeed;
    } else if (this.mode === this.RETURNING_HOME) {
      speed = this.cruiseElroySpeed;
      this.sprite.animations.play(dir + 20);
    } else {
      this.sprite.animations.play(dir);
      if (this.name === "blinky" && this.game.numDots < 20) {
        speed = this.cruiseElroySpeed;
        this.mode = this.CHASE;
      }
    }

    if (this.currentDir === Phaser.NONE) {
      this.sprite.body.velocity.x = this.sprite.body.velocity.y = 0;
      return;
    }

    // EK: hardcode it for now
    speed = this.spriteScatterSpeed;

    if (dir === Phaser.LEFT || dir === Phaser.UP) {
      speed = -speed;
    }
    if (dir === Phaser.LEFT || dir === Phaser.RIGHT) {
      this.sprite.body.velocity.x = speed;
    } else {
      this.sprite.body.velocity.y = speed;
    }
  },

  resetSafeTiles: function() {
    this.safetiles = [this.game.safetile, 35, 36];
  },

  scatter: function() {
    if (this.mode !== this.RETURNING_HOME) {
      this.sprite.animations.play(this.currentDir);
      this.isAttacking = false;
      if (this.mode !== this.AT_HOME && this.mode != this.EXIT_HOME) {
        this.mode = this.SCATTER;
      }
    }
  }
};
