const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

// This object tracks all our active lobbies!
const rooms = {};

io.on('connection', (socket) => {
  console.log('⛵ A sailor connected: ' + socket.id);

  // Send the list of active rooms to someone looking to join
  socket.on('getRooms', () => {
    const roomList = Object.keys(rooms).map(name => ({
      name,
      players: Object.keys(rooms[name].players).length,
      max: rooms[name].maxPlayers,
      started: rooms[name].raceStarted
    }));
    socket.emit('roomList', roomList);
  });

  // When a player creates a new room
  socket.on('createRoom', (data) => {
    rooms[data.roomName] = { host: socket.id, maxPlayers: data.maxPlayers, players: {}, raceStarted: false };
    socket.join(data.roomName);
    rooms[data.roomName].players[socket.id] = { x: 55, z: 110, rotation: Math.PI, type: data.boatType };
    socket.emit('joinedLobby', { roomName: data.roomName, isHost: true });
  });

  // When a player joins an existing room
  socket.on('joinRoom', (data) => {
    const room = rooms[data.roomName];
    if (room && Object.keys(room.players).length < room.maxPlayers && !room.raceStarted) {
      socket.join(data.roomName);
      // Give them a slightly random start position so boats don't overlap
      room.players[socket.id] = { x: 55 + (Math.random() * 15 - 7.5), z: 110, rotation: Math.PI, type: data.boatType };
      socket.emit('joinedLobby', { roomName: data.roomName, isHost: false });

      // Tell everyone in the room to load the new player
      socket.to(data.roomName).emit('newPlayer', { id: socket.id, playerInfo: room.players[socket.id] });

      // Tell the new player about everyone already in the room
      socket.emit('currentPlayers', room.players);
    } else {
      socket.emit('roomError', 'Room is full or race already started!');
    }
  });

  // Only the host can trigger this!
  socket.on('startRace', (roomName) => {
    if (rooms[roomName] && rooms[roomName].host === socket.id) {
      rooms[roomName].raceStarted = true;
      io.to(roomName).emit('startPreStart'); // Tells all clients in the room to start the timer
    }
  });

  // Handle movement within specific rooms
  socket.on('playerMovement', (data) => {
    if (rooms[data.roomName] && rooms[data.roomName].players[socket.id]) {
      rooms[data.roomName].players[socket.id] = data.movementData;
      socket.to(data.roomName).emit('playerMoved', { id: socket.id, playerInfo: data.movementData });
    }
  });

  // Cleanup when someone leaves
  socket.on('disconnect', () => {
    console.log('👋 Sailor disconnected: ' + socket.id);
    for (let roomName in rooms) {
      if (rooms[roomName].players[socket.id]) {
        delete rooms[roomName].players[socket.id];
        io.to(roomName).emit('playerDisconnected', socket.id);

        // If the room is empty, delete it
        if (Object.keys(rooms[roomName].players).length === 0) {
          delete rooms[roomName]; 
        } 
        // If the host left, give the host powers to the next person in the room
        else if (rooms[roomName].host === socket.id) {
          rooms[roomName].host = Object.keys(rooms[roomName].players)[0];
          io.to(rooms[roomName].host).emit('youAreHost');
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Lobby Server running on port ${PORT}`));