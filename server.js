const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

let gameState = {
    players: [],
    deck: [],
    discard: "---",
    activeIdx: 0,
    round: 3,
    isEnding: false,
    outPlayer: "",
    deckCount: 1,
    started: false
};

io.on('connection', (socket) => {
    socket.on('join-game', (name) => {
        socket.playerName = name;
        let p = gameState.players.find(p => p.name === name);
        if (!p) {
            gameState.players.push({ name, score: 0, ready: false, hand: [], socketId: socket.id });
        } else {
            p.socketId = socket.id;
        }
        io.emit('update-lobby', gameState.players);
        
        if (gameState.started) {
            socket.emit('game-transition');
            socket.emit('sync-round', gameState.round);
            socket.emit('update-discard', gameState.discard);
            socket.emit('receive-hand', gameState.players.find(p => p.name === name).hand);
        }
    });

    socket.on('player-ready', () => {
        const p = gameState.players.find(p => p.name === socket.playerName);
        if (p) {
            p.ready = !p.ready; 
            io.emit('update-lobby', gameState.players);
        }
    });

    socket.on('start-game-rotation', () => {
        initGame();
    });

    socket.on('play-card', (data) => {
        const p = gameState.players.find(pl => pl.name === socket.playerName);
        if(p && data.card !== "---") {
            const idx = p.hand.indexOf(data.card);
            if (idx > -1) p.hand.splice(idx, 1);
        }
        gameState.discard = data.card;
        io.emit('update-discard', gameState.discard);
        nextTurn();
    });

    socket.on('trigger-out', (name) => {
        gameState.isEnding = true;
        gameState.outPlayer = name;
        io.emit('going-out-alert', name);
        nextTurn();
    });

    socket.on('submit-score', (data) => {
        const p = gameState.players.find(p => p.name === data.name);
        if (p) {
            p.score += data.points;
            io.emit('update-lobby', gameState.players);
        }
    });

    socket.on('broadcast-hand', (data) => { 
        io.emit('log-hand-reveal', data); 
    });

    socket.on('next-round-setup', () => {
        gameState.round = (gameState.round >= 13) ? 3 : gameState.round + 1;
        gameState.isEnding = false;
        gameState.outPlayer = "";
        io.emit('clear-game-logs'); 
        initGame();
    });

    socket.on('reset-whole-game', () => {
        gameState = { players: [], deck: [], discard: "---", activeIdx: 0, round: 3, isEnding: false, outPlayer: "", deckCount: 1, started: false };
        io.emit('game-reset-broadcast');
    });
});

function initGame() {
    gameState.deck = [];
    gameState.started = true;
    const suits = ['♥', '♦', '♣', '♠'], values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    for (let s of suits) { for (let v of values) gameState.deck.push(v + s); }
    gameState.deck.sort(() => Math.random() - 0.5);
    
    gameState.players.forEach(p => {
        p.hand = [];
        for (let i = 0; i < gameState.round; i++) { p.hand.push(gameState.deck.pop()); }
        io.to(p.socketId).emit('receive-hand', p.hand);
    });

    io.emit('shuffle-transition');
    
    setTimeout(() => {
        gameState.discard = gameState.deck.pop();
        io.emit('sync-round', gameState.round);
        io.emit('update-discard', gameState.discard);
        io.emit('game-transition');
        gameState.activeIdx = 0;
        io.emit('update-turn', { activePlayer: gameState.players[0].name, isEnding: false });
    }, 3000);
}

function nextTurn() {
    gameState.activeIdx = (gameState.activeIdx + 1) % gameState.players.length;
    if (gameState.isEnding && gameState.players[gameState.activeIdx].name === gameState.outPlayer) {
        io.emit('force-score-view');
        return;
    }
    io.emit('update-turn', { activePlayer: gameState.players[gameState.activeIdx].name, isEnding: gameState.isEnding });
}

http.listen(3000, () => { console.log('Server running on 3000'); });
