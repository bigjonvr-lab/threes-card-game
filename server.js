const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

let players = [];
let deck = [];
let currentDiscard = "---";
let activePlayerIndex = 0;
let roundCount = 3; 
let isEnding = false;
let playersFinishedScoring = 0;
let deckCount = 1;

app.use(express.static(__dirname + '/public'));

io.on('connection', (socket) => {
    socket.on('join-game', (name) => {
        socket.playerName = name;
        if (!players.find(p => p.name === name)) {
            players.push({ name, score: 0, ready: false, hand: [], isBot: false });
        }
        io.emit('update-lobby', players);
    });

    socket.on('add-bot', () => {
        const botName = `Bot_${players.filter(p => p.isBot).length + 1}`;
        players.push({ name: botName, score: 0, ready: true, hand: [], isBot: true });
        io.emit('update-lobby', players);
    });

    socket.on('set-decks', (num) => { deckCount = parseInt(num); });

    socket.on('player-ready', () => {
        const p = players.find(p => p.name === socket.playerName);
        if (p) p.ready = true;
        io.emit('update-lobby', players);
    });

    socket.on('start-game-rotation', () => { initGame(); });

    socket.on('play-card', (data) => {
        currentDiscard = data.card;
        io.emit('update-discard', currentDiscard);
        nextTurn();
    });

    socket.on('trigger-out', (name) => {
        isEnding = true;
        io.emit('going-out-alert', name);
        nextTurn();
    });

    socket.on('broadcast-hand', (data) => { io.emit('log-hand-reveal', data); });

    socket.on('submit-score', (data) => {
        const p = players.find(p => p.name === data.name);
        if (p) {
            p.score += data.points;
            playersFinishedScoring++;
            io.emit('update-lobby', players);
            if (playersFinishedScoring >= players.length) io.emit('show-next-deal-btn');
        }
    });

    socket.on('next-round-setup', () => {
        roundCount++;
        if (roundCount > 13) roundCount = 3;
        isEnding = false;
        playersFinishedScoring = 0;
    });
});

function initGame() {
    deck = [];
    const suits = ['♥', '♦', '♣', '♠'];
    const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    for (let d = 0; d < deckCount; d++) {
        for (let s of suits) { for (let v of values) deck.push(v + s); }
    }
    deck.sort(() => Math.random() - 0.5);

    players.forEach(p => {
        p.hand = [];
        for (let i = 0; i < roundCount; i++) { if(deck.length > 0) p.hand.push(deck.pop()); }
        // The private channel for dealing
        io.emit('receive-hand-' + p.name, p.hand);
    });

    io.emit('shuffle-transition');
    setTimeout(() => {
        currentDiscard = deck.pop();
        io.emit('sync-round', roundCount);
        io.emit('update-discard', currentDiscard);
        io.emit('game-transition');
        activePlayerIndex = 0;
        sendTurnUpdate();
    }, 3000);
}

function sendTurnUpdate() {
    const activePlayer = players[activePlayerIndex];
    if (!activePlayer) return;
    io.emit('update-turn', { activePlayer: activePlayer.name, isEnding });
    if (activePlayer.isBot) runBotLogic(activePlayer);
}

function nextTurn() {
    activePlayerIndex = (activePlayerIndex + 1) % players.length;
    if (isEnding && players[activePlayerIndex].name === "The person who went out") {
        io.emit('force-score-view');
        return;
    }
    sendTurnUpdate();
}

function runBotLogic(bot) {
    setTimeout(() => {
        bot.hand.push(deck.pop());
        setTimeout(() => {
            const discard = bot.hand.shift();
            currentDiscard = discard;
            io.emit('update-discard', currentDiscard);
            nextTurn();
        }, 1200);
    }, 1500);
}

http.listen(3000, () => { console.log('Server running on port 3000'); });
