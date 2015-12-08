var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var pacmanMap = require('./assets/pacman-map.json').layers[0].data;

var debugLines = {
  'blinky': 2,
  'pacman': 5,
  'pacman2': 8,
}

var Phaser = {
  NONE: 0,
  LEFT: 1,
  RIGHT: 2,
  UP: 3,
  DOWN: 4,
  Point: function() {
    this.x = 0;
    this.y = 0;
  }
}

var Server = function(socket, characters, characterName) {
  this.time = process.hrtime();

  this.speed = characterName === 'Blinky' ? 125 : 150;
  this.isDead = false;

  this.gridsize = 16; // this.game.gridsize;
  this.safetile = 14; // this.game.safetile;

  this.marker = new Phaser.Point();
  this.turnPoint = new Phaser.Point();
  this.threshold = 12;

  this.directions = [null, null, null, null, null];
  this.opposites = [Phaser.NONE, Phaser.RIGHT, Phaser.LEFT, Phaser.DOWN, Phaser.UP];

  this.current = Phaser.NONE;
  this.turning = Phaser.NONE;
  this.want2go = Phaser.NONE;

  this.sentY = null;
  this.sentX = null;
  this.sentDirection = null;
  this.userSocket = socket;
  this.characters = characters;
  this.characterName = characterName;

  // Phaser structures
  this.game = {
    map: {
      widthInPixels: 448,
      width: 28,
      getTileLeft: function(x, y) {
        return pacmanMap[y * 28 + x - 1];
      },
      getTileRight: function(x, y) {
        return pacmanMap[y * 28 + x + 1];
      },
      getTileAbove: function(x, y) {
        return pacmanMap[(y - 1) * 28 + x];
      },
      getTileBelow: function(x, y) {
        return pacmanMap[(y + 1) * 28 + x];
      }
    }
  }
  this.sprite = {
    x: (1 * 16) + 8,
    y: (1 * 16) + 8,
    body: {
      velocity: {
        x: 0,
        y: 0
      }
    }
  }
}

Server.prototype.checkDirection = function(turnTo) {
  if (this.turning === turnTo || this.directions[turnTo] === null || !([7, 40].indexOf(this.directions[turnTo]) !== -1)) {
    //  Invalid direction if they're already set to turn that way
    //  Or there is no tile there, or the tile isn't index 1 (a floor tile)
    return;
  }

  //  Check if they want to turn around and can
  if (this.current === this.opposites[turnTo]) {
    this.move(turnTo);
    //this.keyPressTimer = this.game.time.time;
  } else {
    this.turning = turnTo;

    this.turnPoint.x = (this.marker.x * this.gridsize) + (this.gridsize / 2);
    this.turnPoint.y = (this.marker.y * this.gridsize) + (this.gridsize / 2);
    this.want2go = Phaser.NONE;
  }
};

Server.prototype.move = function(direction) {
  if (direction === Phaser.NONE) {
    this.sprite.body.velocity.x = this.sprite.body.velocity.y = 0;
    return;
  }

  var speed = this.speed;

  if (direction === Phaser.LEFT || direction === Phaser.UP) {
    speed = -speed;
  }

  if (direction === Phaser.LEFT || direction === Phaser.RIGHT) {
    this.sprite.body.velocity.x = speed;
  } else {
    this.sprite.body.velocity.y = speed;
  }

  this.current = direction;
  this.sendGameState();
};

var time = process.hrtime(),
  y = 20,
  x = 104,
  direction = 4,
  speed = 150,
  directionEnum = ['None', 'Left', 'Right', 'Up', 'Down'],
  leftTilePassable = false,
  rightTilePassable = false,
  topTilePassable = false,
  bottomTilePassable = false;

function snapToFloor(input, gap) {
  return gap * Math.floor(input / gap);
}

Server.prototype.update = function() {
  var diff = process.hrtime(this.time),
    diffInMs = parseInt((diff[0] * 1e9 + diff[1]) / 1e6);
  //diffInMs = 53;

  this.time = process.hrtime();

  if (this.want2go !== Phaser.NONE) {
    this.checkDirection(this.want2go);
  }

  if (!this.isDead) {
    //this.game.physics.arcade.collide(this.sprite, this.game.layer);
    var nextSpriteX = this.sprite.x + Math.round(this.sprite.body.velocity.x / 1000 * diffInMs),
      nextSpriteY = this.sprite.y + Math.round(this.sprite.body.velocity.y / 1000 * diffInMs),
      nextXTile = Math.round((nextSpriteX + this.sprite.body.velocity.x / 18.75 - 0.1) / 16),
      nextYTile = Math.round((nextSpriteY + this.sprite.body.velocity.y / 18.75 - 0.1) / 16),
      nextTile = pacmanMap[nextYTile * 28 + nextXTile],
      // 7 and 40 is ground and dots
      nextTilePassable = ([7, 40].indexOf(nextTile) !== -1);

    if (nextTilePassable) {
      this.sprite.x = nextSpriteX;
      this.sprite.y = nextSpriteY;
    } else {
      this.sprite.body.velocity.y = this.sprite.body.velocity.x = 0;
      //console.log('update1! ' + this.sprite.x + ' tx:' + nextTile);
      this.sprite.x = Math.round((this.sprite.x - 0.1) / 16) * 16 + 8;
      //console.log('update2! ' + this.sprite.x);
      this.sprite.y = Math.round((this.sprite.y - 0.1) / 16) * 16 + 8;
    }

    logOnLine(debugLines[this.characterName], this.characterName + ': coords y:' + this.sprite.y + ' x:' + this.sprite.x + ' p:' + nextTilePassable + ' xtile:' +
      nextXTile + ' ytile:' + nextYTile + ' nextTileId:' + nextTile + ' vel.x:' + this.sprite.body.velocity.x +
      ' vel.y:' + this.sprite.body.velocity.y + ' turning:' + this.turning +
      ' turnpoint(x:' + this.turnPoint.x + ', y:' + this.turnPoint.y + ')');


    //this.game.physics.arcade.overlap(this.sprite, this.game.dots, this.eatDot, null, this);
    //this.game.physics.arcade.overlap(this.sprite, this.game.pills, this.eatPill, null, this);

    this.marker.x = snapToFloor(Math.floor(this.sprite.x), this.gridsize) / this.gridsize;
    this.marker.y = snapToFloor(Math.floor(this.sprite.y), this.gridsize) / this.gridsize;

    //logOnLine(3, 'marker x:' + this.marker.x + ' y:' + this.marker.y + ' want2go:' + directionEnum[this.want2go]);

    if (this.marker.x < 0) {
      this.sprite.x = this.game.map.widthInPixels - 1;
    }
    if (this.marker.x >= this.game.map.width) {
      this.sprite.x = 1;
    }

    //  Update our grid sensors
    this.directions[1] = this.game.map.getTileLeft(this.marker.x, this.marker.y);
    this.directions[2] = this.game.map.getTileRight(this.marker.x, this.marker.y);
    this.directions[3] = this.game.map.getTileAbove(this.marker.x, this.marker.y);
    this.directions[4] = this.game.map.getTileBelow(this.marker.x, this.marker.y);

    if (this.turning !== Phaser.NONE) {
      this.turn();
    }
  } else {
    this.move(Phaser.NONE);
    // if (!this.isAnimatingDeath) {
    //   this.sprite.play("death");
    //   this.isAnimatingDeath = true;
    // }
  }
};

function fuzzyEqual(a, b, epsilon) {
  if (epsilon === undefined) {
    epsilon = 0.0001;
  }
  return Math.abs(a - b) < epsilon;
}

Server.prototype.turn = function() {
  var cx = Math.floor(this.sprite.x);
  var cy = Math.floor(this.sprite.y);

  //  This needs a threshold, because at high speeds you can't turn because the coordinates skip past
  if (!fuzzyEqual(cx, this.turnPoint.x, this.threshold) || !fuzzyEqual(cy, this.turnPoint.y, this.threshold)) {
    return false;
  }

  //  Grid align before turning
  this.sprite.x = this.turnPoint.x;
  this.sprite.y = this.turnPoint.y;

  //this.sprite.body.reset(this.turnPoint.x, this.turnPoint.y);
  this.sprite.body.velocity.x = this.sprite.body.velocity.y = 0;

  this.move(this.turning);
  logOnLine(8, 'turnpoint executed at x:' + this.sprite.x + ' y:' + this.sprite.y + ' dir:' + directionEnum[this.turning]);
  this.turning = Phaser.NONE;

  return true;
};

function logOnLine(line, message) {
  console.log('\033[' + line + ';1f');
  console.log('\033[K');
  console.log('\033[' + line + ';1f');
  console.log(message);
}

Server.prototype.sendGameState = function(force) {
  var x = this.sprite.x,
    y = this.sprite.y,
    direction = this.current,
    alreadySent = ((this.sentX == x) && (this.sentY == y) && (this.sentDirection == direction));

  if ((this.userSocket && !alreadySent) || force) {
    logOnLine(5, 'sent game state y:' + y + ' x:' + x + ' direction:' + directionEnum[direction])
    io.emit('game state', {
      pacman: {
        x: x,
        y: y,
        direction: direction
      },
      character: {
        name: this.characterName,
        id: this.userSocket.id
      }
    })
    this.sentX = x;
    this.sentY = y;
    this.sentDirection = this.current;
  }
}


app.get('/', function(req, res) {
  res.sendfile('Pacman.html');
});

http.listen(3000, function() {
  console.log('\033[2J'); // clear screen
  console.log('listening on *:3000');
});

app.use(express.static('.'));

var characters = {},
  charPool = ['blinky', 'pacman', 'pacman2'];

io.on('connection', function(socket) {
  characters[socket.id] = new Server(socket, characters, charPool.pop());
  var serverGame = characters[socket.id];
  // 6 updates per second, every 25 pixels (150/6=25)
  // 1000/50 = 20 updates per second, every 7.5 pixels (150/20=7.5)
  setInterval(serverGame.update.bind(serverGame), 53);
  serverGame.move(Phaser.RIGHT);

  logActiveClientCount();

  socket.on('move', function(wantedDirection) {
    var character = characters[socket.id];
    logOnLine(debugLines[character.characterName] + 1, 'new direction: ' + directionEnum[wantedDirection] + ' x:' + character.sprite.x + ' y:' + character.sprite.y);
    character.want2go = wantedDirection;
    character.checkDirection.bind(character)(character.want2go);
  });

  socket.on('disconnect', function() {
    charPool.push(characters[socket.id].characterName);
    delete characters[socket.id];
    logActiveClientCount();
  });

  serverGame.sendGameState(true);
});

function logActiveClientCount() {
  logOnLine(9, 'active connections: ' + Object.keys(characters).length);
}




//setInterval(clientUpdateLoop, 200);
