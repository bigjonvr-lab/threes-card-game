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

// Helper to create and shuffle a master deck
function createMasterDeck() {
    const suits = ['♥', '♦', '♣', '♠'];
    const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    let deck = [];
    // Use 2 decks mixed together for large hands
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
        players = players.filter(p => p.id !== socket.id);
        players.push({ id: socket.id, name: name, hand: [] });
        io.emit('update-players', players);
    });

    socket.on('start-game-rotation', () => {
        if (players.length === 0) return;
        
        // 1. Shuffle and Deal
        let masterDeck = createMasterDeck();
        players.forEach(p => {
            p.hand = []; // Clear old cards
            for(let i=0; i < serverCardsThisRound; i++) {
                p.hand.push(masterDeck.pop());
            }
            // Send private hand to each specific player
            io.to(p.id).emit('receive-hand', p.hand);
        });

        // 2. Set the turn
        const dealerIndex = players.findIndex(p => p.id === socket.id);
        turnIndex = (dealerIndex !== -1) ? dealerIndex : 0;
        roundEnding = false;
        stopperId = null;
        
        io.emit('sync-round', serverCardsThisRound);
        io.emit('update-turn', { activePlayer: players[turnIndex].name, isEnding: false });
        io.emit('update-discard', "---");
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

    socket.on('next-round-setup', () => {
        serverCardsThisRound++; 
        if(serverCardsThisRound > 13) serverCardsThisRound = 13;
        io.emit('sync-round', serverCardsThisRound);
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        io.emit('update-players', players);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Varsity Threes live on ${PORT}`));
