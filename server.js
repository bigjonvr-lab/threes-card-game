const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

let players = [];
let turnIndex = 0;
let roundEnding = false;
let stopperId = null;

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    socket.on('join-game', (name) => {
        if (!players.find(p => p.id === socket.id)) {
            players.push({ id: socket.id, name: name });
        }
        io.emit('update-players', players);
        io.emit('update-turn', { activePlayer: players[turnIndex]?.name, isEnding: roundEnding });
    });

    socket.on('play-card', (data) => {
        io.emit('update-discard', data.card);
        
        turnIndex = (turnIndex + 1) % players.length;
        
        // Check if the round is officially over
        if (roundEnding && players[turnIndex].id === stopperId) {
            io.emit('log-action', "ROUND OVER! Everyone submit your scores.");
            io.emit('force-score-view');
        } else {
            io.emit('update-turn', { activePlayer: players[turnIndex].name, isEnding: roundEnding });
            io.emit('log-action', `${data.player} discarded. Next: ${players[turnIndex].name}`);
        }
    });

    socket.on('trigger-out', (name) => {
        roundEnding = true;
        stopperId = socket.id;
        io.emit('log-action', `🚨 ${name} is GOING OUT! Everyone has ONE last turn!`);
        // Discarding happens after this in the frontend
    });

    socket.on('submit-score', (data) => io.emit('submit-score', data));
    socket.on('log-action', (msg) => io.emit('log-action', msg));

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        io.emit('update-players', players);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Threes running on ${PORT}`));
