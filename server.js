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
        // Remove any old instance of this socket and add fresh
        players = players.filter(p => p.id !== socket.id);
        players.push({ id: socket.id, name: name });
        io.emit('update-players', players);
    });

    socket.on('start-game-rotation', () => {
        // The person who clicked "DEAL" starts the rotation
        const dealerIndex = players.findIndex(p => p.id === socket.id);
        turnIndex = (dealerIndex !== -1) ? dealerIndex : 0;
        
        roundEnding = false;
        stopperId = null;
        
        io.emit('update-turn', { activePlayer: players[turnIndex].name, isEnding: false });
        io.emit('log-action', `New Round! ${players[turnIndex].name} starts.`);
    });

    socket.on('play-card', (data) => {
        io.emit('update-discard', data.card);
        
        // Move to next player in the list
        turnIndex = (turnIndex + 1) % players.length;
        
        if (roundEnding && players[turnIndex].id === stopperId) {
            io.emit('log-action', "ROUND OVER! Submit your scores.");
            io.emit('force-score-view');
        } else {
            io.emit('update-turn', { activePlayer: players[turnIndex].name, isEnding: roundEnding });
        }
    });

    socket.on('trigger-out', (name) => {
        roundEnding = true;
        stopperId = socket.id;
        io.emit('log-action', `🚨 ${name} is GOING OUT!`);
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        io.emit('update-players', players);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server live on ${PORT}`));
