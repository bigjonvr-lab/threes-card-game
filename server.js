const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

let players = [];
let turnIndex = 0;
let roundEnding = false;
let stopperId = null;
let serverCardsThisRound = 3; 

function createMasterDeck() {
    const suits = ['♥', '♦', '♣', '♠'];
    const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    let deck = [];
    for(let i=0; i<2; i++) {
        suits.forEach(s => values.forEach(v => deck.push(v + s)));
    }
    return deck.sort(() => Math.random() - 0.5);
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    // 1. Join the Lobby
    socket.on('join-game', (name) => {
        players.push({ id: socket.id, name: name, hand: [], score: 0, ready: false });
        io.emit('update-lobby', players);
    });

    // 2. Toggle Ready Status
    socket.on('player-ready', () => {
        const p = players.find(p => p.id === socket.id);
        if(p) p.ready = !p.ready;
        io.emit('update-lobby', players);
    });

    // 3. Start Game (Triggered from Lobby)
    socket.on('start-game-rotation', () => {
        io.emit('shuffle-transition'); // Start the animation on all screens

        setTimeout(() => {
            let masterDeck = createMasterDeck();
            players.forEach(p => {
                p.hand = [];
                for(let i=0; i < serverCardsThisRound; i++) p.hand.push(masterDeck.pop());
                io.to(p.id).emit('receive-hand', p.hand);
            });

            turnIndex = 0;
            roundEnding = false;
            stopperId = null;
            
            io.emit('game-transition');
            io.emit('sync-round', serverCardsThisRound);
            io.emit('update-turn', { activePlayer: players[turnIndex].name, isEnding: false });
            io.emit('update-discard', "---");
        }, 3000); // 3-second shuffle
    });

    socket.on('play-card', (data) => {
        io.emit('update-discard', data.card);
        turnIndex = (turnIndex + 1) % players.length;
        if (roundEnding && players[turnIndex].id === stopperId) {
            io.emit('force-score-view');
        } else {
            io.emit('update-turn', { activePlayer: players[turnIndex].name, isEnding: roundEnding });
        }
    });

    socket.on('submit-score', (data) => {
        const p = players.find(p => p.name === data.name);
        if(p) p.score = data.score;
        io.emit('update-lobby', players);
    });

    socket.on('next-round-setup', () => {
        serverCardsThisRound++;
        io.emit('sync-round', serverCardsThisRound);
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        io.emit('update-lobby', players);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Varsity Threes live on ${PORT}`));
