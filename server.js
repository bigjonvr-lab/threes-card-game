const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

let players = [];
let turnIndex = 0;

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    socket.on('join-game', (name) => {
        if (!players.find(p => p.id === socket.id)) {
            players.push({ id: socket.id, name: name });
        }
        io.emit('update-players', players);
        io.emit('update-turn', players[turnIndex]?.name);
    });

    socket.on('play-card', (data) => {
        io.emit('update-discard', data.card);
        // Move to the next player after a discard
        turnIndex = (turnIndex + 1) % players.length;
        io.emit('update-turn', players[turnIndex].name);
        io.emit('log-action', `${data.player} discarded ${data.card}. It is now ${players[turnIndex].name}'s turn.`);
    });

    socket.on('draw-event', (name) => {
        io.emit('log-action', `${name} drew a card.`);
    });

    socket.on('submit-score', (data) => io.emit('submit-score', data));
    socket.on('log-action', (msg) => io.emit('log-action', msg));

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        if (turnIndex >= players.length) turnIndex = 0;
        io.emit('update-players', players);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Threes running on ${PORT}`));
