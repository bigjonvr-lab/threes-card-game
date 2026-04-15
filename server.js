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
let gameStarted = false;

// Helpers
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
    socket.on('join-game', (name) => {
        players.push({ id: socket.id, name: name, hand: [], score: 0, ready: false });
        io.emit('update-lobby', players);
    });

    socket.on('player-ready', () => {
        const p = players.find(p => p.id === socket.id);
        if(p) p.ready = !p.ready;
        io.emit('update-lobby', players);
    });

    socket.on('start-game-rotation', () => {
        // --- Start the Shuffling Transition ---
        io.emit('shuffle-transition', true);

        // Define the dealing function
        const dealHands = () => {
            gameStarted = true;
            let masterDeck = createMasterDeck();
            
            // Deal the hands internally
            players.forEach(p => {
                p.hand = [];
                for(let i=0; i < serverCardsThisRound; i++) p.hand.push(masterDeck.pop());
                // Send private hand data to each specific player
                io.to(p.id).emit('receive-hand', p.hand);
            });

            // Set up the initial game state
            turnIndex = 0;
            roundEnding = false;
            stopperId = null;
            
            // Sync all clients for the final game room transition
            io.emit('game-transition', true);
            io.emit('sync-round', serverCardsThisRound);
            io.emit('update-turn', { activePlayer: players[turnIndex].name, isEnding: false });
            io.emit('update-discard', "---");
        };

        // --- Delay dealing the hands to match the shuffle animation ---
        // (3500ms allows the full 3s animation to finish)
        setTimeout(dealHands, 3500);
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

    socket.on('trigger-out', (name) => {
        roundEnding = true;
        stopperId = socket.id;
        io.emit('log-action', `${name} IS GOING OUT!`);
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
