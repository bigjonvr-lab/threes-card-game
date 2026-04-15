const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

// THE SAFETY NET: Finds your file even if it's capitalized or in/out of a folder
app.get('/', (req, res) => {
    const locations = [
        path.join(__dirname, 'public', 'index.html'),
        path.join(__dirname, 'public', 'Index.html'),
        path.join(__dirname, 'index.html'),
        path.join(__dirname, 'Index.html')
    ];
    for (let loc of locations) {
        if (fs.existsSync(loc)) return res.sendFile(loc);
    }
    res.status(404).send("Big Jon Games Error: index.html not found. Check your folder!");
});
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

let players = [];
let deck = [];
let currentDiscard = "---";
let roundCount = 3; 
let isEnding = false;

io.on('connection', (socket) => {
    socket.on('join-game', (name) => {
        socket.playerName = name;
        if (!players.find(p => p.name === name)) {
            players.push({ name, score: 0, ready: false, hand: [], isBot: false });
        }
        io.emit('update-lobby', players);
    });

    // NEW HANDSHAKE: When the player's screen is ready, they call this
    socket.on('request-cards', (name) => {
        const p = players.find(player => player.name === name);
        if (p && p.hand.length > 0) {
            console.log(`Dealing to ${name}`);
            io.emit('receive-hand-' + p.name, p.hand);
        }
    });

    socket.on('add-bot', () => {
        const botName = `Bot_${players.filter(p => p.isBot).length + 1}`;
        players.push({ name: botName, score: 0, ready: true, hand: [], isBot: true });
        io.emit('update-lobby', players);
    });

    socket.on('start-game-rotation', () => { initGame(); });

    socket.on('play-card', (data) => {
        currentDiscard = data.card;
        io.emit('update-discard', currentDiscard);
        nextTurn();
    });
});

function initGame() {
    deck = [];
    const suits = ['♥', '♦', '♣', '♠'];
    const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    for (let s of suits) { for (let v of values) deck.push(v + s); }
    deck.sort(() => Math.random() - 0.5);

    players.forEach(p => {
        p.hand = [];
        for (let i = 0; i < roundCount; i++) p.hand.push(deck.pop());
    });

    io.emit('shuffle-transition');
    setTimeout(() => {
        currentDiscard = deck.pop();
        io.emit('sync-round', roundCount);
        io.emit('update-discard', currentDiscard);
        io.emit('game-transition');
        
        // Tell everyone to request their cards now that the shuffle is done
        io.emit('trigger-card-request');
    }, 3000);
}

// ... (rest of nextTurn and runBotLogic from previous versions)

http.listen(3000, () => { console.log('Server running on port 3000'); });
