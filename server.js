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
        // Clear any old session for this specific connection
        players = players.filter(p => p.id !== socket.id);
        players.push({ id: socket.id, name: name });
        io.emit('update-players', players);
        
        // If a game is already running, sync the new person
        if (players.length > 0) {
            io.emit('update-turn', { activePlayer: players[turnIndex].name, isEnding: roundEnding });
        }
    });

    socket.on('start-game-rotation', () => {
        // Safety check: Don't start if no one is here
        if (players.length === 0) return;
        
        // Reset turn to the person who clicked DEAL
        const dealerIndex = players.findIndex(p => p.id === socket.id);
        turnIndex = (dealerIndex !== -1) ? dealerIndex : 0;
        
        roundEnding = false;
        stopperId = null;
        
        // Tell EVERYONE who goes first
        io.emit('update-turn', { activePlayer: players[turnIndex].name, isEnding: false });
        io.emit('log-action', `Round started! ${players[turnIndex].name} goes first.`);
    });

    socket.on('play-card', (data) => {
        if (players.length === 0) return;
        io.emit('update-discard', data.card);
        
        // Move to next player
        turnIndex = (turnIndex + 1) % players.length;
        
        if (roundEnding && players[turnIndex].id === stopperId) {
            io.emit('log-action', "ROUND OVER! Submit scores.");
            io.emit('force-score-view');
        } else {
            io.emit('update-turn', { activePlayer: players[turnIndex].name, isEnding: roundEnding });
        }
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        if (turnIndex >= players.length) turnIndex = 0;
        io.emit('update-players', players);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`OSU Edition live on ${PORT}`));
