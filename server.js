const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

app.get('/', (req, res) => {
    const locations = [path.join(__dirname, 'public', 'index.html'), path.join(__dirname, 'index.html')];
    for (let loc of locations) { if (fs.existsSync(loc)) return res.sendFile(loc); }
    res.status(404).send("Big Jon Games Error: index.html not found.");
});
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

let players = [];
let deck = [];
let currentDiscard = "---";
let activePlayerIndex = 0;
let roundCount = 3; 
let isEnding = false;
let playerWhoWentOut = "";
let deckCount = 1;

io.on('connection', (socket) => {
    socket.on('join-game', (name) => {
        socket.playerName = name;
        if (!players.find(p => p.name === name)) {
            players.push({ name, score: 0, ready: false, hand: [] });
        }
        io.emit('update-lobby', players);
    });

    socket.on('set-decks', (num) => { deckCount = parseInt(num); });

    socket.on('player-ready', () => {
        const p = players.find(p => p.name === socket.playerName);
        if (p) { p.ready = true; io.emit('update-lobby', players); }
    });

    socket.on('request-cards', (name) => {
        const p = players.find(player => player.name === name);
        // ONLY SEND IF HAND EXISTS AND IS THE CORRECT SIZE
        if (p) io.emit('receive-hand-' + p.name, p.hand);
    });

    socket.on('start-game-rotation', () => { initGame(); });

    socket.on('play-card', (data) => {
        currentDiscard = data.card;
        io.emit('update-discard', currentDiscard);
        nextTurn();
    });

    socket.on('trigger-out', (name) => {
        isEnding = true;
        playerWhoWentOut = name;
        io.emit('going-out-alert', name);
        nextTurn();
    });

    socket.on('broadcast-hand', (data) => { io.emit('log-hand-reveal', data); });

    socket.on('submit-score', (data) => {
        const p = players.find(p => p.name === data.name);
        if (p) { p.score += data.points; io.emit('update-lobby', players); }
    });

    socket.on('next-round-setup', () => {
        roundCount++;
        if (roundCount > 13) roundCount = 3;
        isEnding = false;
        playerWhoWentOut = "";
    });
});

function initGame() {
    deck = [];
    const suits = ['♥', '♦', '♣', '♠'], values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    for (let i = 0; i < deckCount; i++) {
        for (let s of suits) { for (let v of values) deck.push(v + s); }
    }
    deck.sort(() => Math.random() - 0.5);
    
    // Exact Math: Round + 2
    let handSize = roundCount + 2;

    players.forEach(p => {
        p.hand = []; // FORCED RESET
        for (let i = 0; i < handSize; i++) {
            if (deck.length > 0) p.hand.push(deck.pop());
        }
    });
    
    // SHUFFLE ANIMATION TRIGGER
    io.emit('shuffle-transition');
    
    // 3 Second Delay for Shuffling
    setTimeout(() => {
        currentDiscard = deck.pop();
        io.emit('sync-round', roundCount);
        io.emit('update-discard', currentDiscard);
        io.emit('game-transition');
        io.emit('trigger-card-request'); 
        activePlayerIndex = 0;
        io.emit('update-turn', { activePlayer: players[0].name, isEnding: false });
    }, 3000);
}

function nextTurn() {
    if (players.length === 0) return;
    activePlayerIndex = (activePlayerIndex + 1) % players.length;
    if (isEnding && players[activePlayerIndex].name === playerWhoWentOut) {
        io.emit('force-score-view');
        return;
    }
    io.emit('update-turn', { activePlayer: players[activePlayerIndex].name, isEnding });
}

http.listen(3000, () => { console.log('Server running on 3000'); });
