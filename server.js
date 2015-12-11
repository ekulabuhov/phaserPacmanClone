var fs = require('fs'),
  express = require('express'),
  app = express(),
  server = require('http').createServer(app),
  io = require('socket.io').listen(server),
  pacmanMap = JSON.parse(fs.readFileSync('./assets/pacman-map.json', 'utf8')).layers[0].data;

server.listen(process.env.PORT || 3000, function() {
  console.log('\033[2J'); // clear screen
  console.log('listening on *:' + server.address().port);
});

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

var startingLocations = {
  'blinky': {
    x: 13,
    y: 11,
    direction: Phaser.RIGHT
  },
  'pacman': {
    x: 14,
    y: 17,
    direction: Phaser.RIGHT
  },
  'pacman2': {
    x: 14,
    y: 17,
    direction: Phaser.LEFT
  }
}

var Mode = {
  NONE: 0,
  RETURNING_HOME: 1
}

var FRIGHTENED_MODE_TIME = 7000;

var Server = function(socket, characters, name) {
  this.speed = name === 'blinky' ? 125 : 150;
  this.isDead = false;

  this.gridsize = 16; // this.game.gridsize;
  this.safetile = 14; // this.game.safetile;

  this.marker = new Phaser.Point();
  this.turnPoint = new Phaser.Point();
  this.threshold = 16;

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
  this.name = name;

  this.frightenedMode = false;
  this.mode = Mode.NONE;

  // 6 updates per second, every 25 pixels (150/6=25)
  // 1000/50 = 20 updates per second, every 7.5 pixels (150/20=7.5)
  var _this = this;
  setTimeout(function() {
    _this.time = process.hrtime();
    _this.updateTimer = setInterval(_this.update.bind(_this), 53);
  }, 4000)

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
    x: (startingLocations[name].x * 16) + 8,
    y: (startingLocations[name].y * 16) + 8,
    body: {
      velocity: {
        x: 0,
        y: 0
      }
    }
  }
}

// 7: dots 40: pills, 14: ground, 35,36: ghost bunker
Server.prototype.tilePassable = function(tileId) {
  return [7, 40, 14, 35, 36].indexOf(tileId) !== -1
}

Server.prototype.checkDirection = function(turnTo) {
  if (this.turning === turnTo || this.directions[turnTo] === null || !this.tilePassable(this.directions[turnTo])) {
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

var directionEnum = ['None', 'Left', 'Right', 'Up', 'Down'];

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

  if (this.isDead) {
    this.move(Phaser.NONE);
    // if (!this.isAnimatingDeath) {
    //   this.sprite.play("death");
    //   this.isAnimatingDeath = true;
    // }
    return;
  }

  //this.game.physics.arcade.collide(this.sprite, this.game.layer);


  //this.game.physics.arcade.overlap(this.sprite, this.game.dots, this.eatDot, null, this);
  //this.game.physics.arcade.overlap(this.sprite, this.game.pills, this.eatPill, null, this);

  this.marker.x = snapToFloor(Math.floor(this.sprite.x), this.gridsize) / this.gridsize;
  this.marker.y = snapToFloor(Math.floor(this.sprite.y), this.gridsize) / this.gridsize;

  // check if we're hitting a pill
  if (this.name.startsWith('pacman')) {
    var _this = this;
    Object.keys(this.characters).forEach(function(socketId) {
      var character = _this.characters[socketId];
      if (character.name === 'blinky' && fuzzyEqual(_this.marker.x, character.marker.x, 2) &&
        fuzzyEqual(_this.marker.y, character.marker.y, 2)) {
        if (_this.frightenedMode) {
          character.mode = Mode.RETURNING_HOME;
          character.sprite.x = 13 * 16 + 8;
          character.sprite.y = 11 * 16 + 8;
        }
      }
    });
    // a pill
    if (nextTile === 40) {
      // replace pill with emptiness
      pacmanMap[nextYTile * 28 + nextXTile] = 14;
      this.frightenedMode = true;
      setTimeout(function() {
        _this.frightenedMode = false;
      }, FRIGHTENED_MODE_TIME);
    }
  }

  //logOnLine(3, 'marker x:' + this.marker.x + ' y:' + this.marker.y + ' want2go:' + directionEnum[this.want2go]);

  if (this.marker.x < 0) {
    this.sprite.x = this.game.map.widthInPixels - 1;
  }
  if (this.marker.x >= this.game.map.width) {
    this.sprite.x = 1;
  }

  //  Update our grid sensors
  this.directions[Phaser.LEFT] = this.game.map.getTileLeft(this.marker.x, this.marker.y);
  this.directions[Phaser.RIGHT] = this.game.map.getTileRight(this.marker.x, this.marker.y);
  this.directions[Phaser.UP] = this.game.map.getTileAbove(this.marker.x, this.marker.y);
  this.directions[Phaser.DOWN] = this.game.map.getTileBelow(this.marker.x, this.marker.y);

  logOnLine(debugLines[this.name], this.name + ': coords(x:' + this.sprite.x + ', y:' + this.sprite.y + '), tile(x:' +
    nextXTile + ', y:' + nextYTile + ') vel.x:' + this.sprite.body.velocity.x +
    ' vel.y:' + this.sprite.body.velocity.y + ' turning:' + this.turning +
    ' turnpoint(x:' + this.turnPoint.x + ', y:' + this.turnPoint.y +
    ') pass(l:' + this.tilePassable(this.directions[Phaser.LEFT]).toString()[0] +
    ', u:' + this.tilePassable(this.directions[Phaser.UP]).toString()[0] +
    ', r:' + this.tilePassable(this.directions[Phaser.RIGHT]).toString()[0] +
    ', d:' + this.tilePassable(this.directions[Phaser.DOWN]).toString()[0] + ')' +
    ', fm:' + this.frightenedMode.toString()[0] +
    ', mode:' + this.mode);

  if (this.turning !== Phaser.NONE) {
    this.turn();
  }

  var nextSpriteX = this.sprite.x + Math.round(this.sprite.body.velocity.x / 1000 * diffInMs),
    nextSpriteY = this.sprite.y + Math.round(this.sprite.body.velocity.y / 1000 * diffInMs),
    nextXTile = Math.round((nextSpriteX + this.sprite.body.velocity.x / 18.75 - 0.1) / 16),
    nextYTile = Math.round((nextSpriteY + this.sprite.body.velocity.y / 18.75 - 0.1) / 16),
    nextTile = pacmanMap[nextYTile * 28 + nextXTile],
    wrapAround = (nextXTile <= 0 || nextXTile >= 28) && nextYTile == 14;
  nextTilePassable = wrapAround || this.tilePassable(nextTile);

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
  //logOnLine(8, 'turnpoint executed at x:' + this.sprite.x + ' y:' + this.sprite.y + ' dir:' + directionEnum[this.turning]);
  this.turning = Phaser.NONE;

  return true;
};

function logOnLine(line, message) {
  console.log('\033[' + line + ';1f');
  console.log('\033[K');
  console.log('\033[' + line + ';1f');
  console.log(message);
}

Server.prototype.sendGameState = function() {
  var x = this.sprite.x,
    y = this.sprite.y,
    direction = this.current,
    alreadySent = ((this.sentX == x) && (this.sentY == y) && (this.sentDirection == direction));

  if ((this.userSocket && !alreadySent)) {

    //logOnLine(5, 'sent game state y:' + y + ' x:' + x + ' direction:' + directionEnum[direction])
    io.emit('game state', {
      pacman: {
        x: x,
        y: y,
        direction: direction
      },
      character: {
        name: this.name,
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

app.use(express.static('.'));

var characters = {},
  charPool = ['pacman2', 'pacman', 'blinky'];

io.on('connection', function(socket) {
  io.emit('new game');

  Object.keys(characters).forEach(function(key) {
    var character = characters[key];
    clearInterval(character.updateTimer);
    characters[key] = new Server(character.userSocket, characters, character.name);
    characters[key].move(startingLocations[character.name].direction);
  });


  characters[socket.id] = new Server(socket, characters, charPool.pop());
  var character = characters[socket.id];
  character.move(startingLocations[character.name].direction);

  // every time somebody connects - reset the map
  pacmanMap = JSON.parse(fs.readFileSync('./assets/pacman-map.json', 'utf8')).layers[0].data;

  logActiveClientCount();

  socket.on('move', function(state) {
    var character = characters[socket.id];
    logOnLine(debugLines[character.name] + 1, 'new direction: ' + directionEnum[state.direction] + ' x:' + character.sprite.x + ' y:' + character.sprite.y);
    character.sprite.x = state.x;
    character.sprite.y = state.y;
    character.want2go = state.direction;
    character.checkDirection.bind(character)(character.want2go);
  });

  socket.on('disconnect', function() {
    var character = characters[socket.id];
    charPool.push(character.name);
    clearInterval(character.updateTimer);
    logOnLine(debugLines[character.name], '');
    logOnLine(debugLines[character.name] + 1, '');
    delete characters[socket.id];
    logActiveClientCount();
  });
});

function logActiveClientCount() {
  logOnLine(9, 'active connections: ' + Object.keys(characters).length);
}
