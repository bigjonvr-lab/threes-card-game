const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

let rooms = {};

// --- GAME LOGIC UTILITIES ---

function createDeck() {
    const suits = ['♥', '♦', '♣', '♠'];
    const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    let deck = [];
    for(let i=0; i<2; i++) suits.forEach(s => values.forEach(v => deck.push(v + s)));
    return deck.sort(() => Math.random() - 0.5);
}

function getVal(card) {
    let v = card.replace(/[♥♦♣♠]/, '');
    if (v === 'A') return 1;
    if (['J','Q','K'].includes(v)) return 10;
    return parseInt(v) || 0;
}

// Check if a hand is "Out" (Simple version: hand is mostly melded)
function canGoOut(hand) {
    // This is a placeholder for complex meld logic
    // For now, if AI has less than 5 points, it "Goes Out"
    let score = hand.reduce((sum, c) => sum + getVal(c), 0);
    return score < 7;
}

// --- SOCKET CONNECTION ---

io.on('connection', (socket) => {
    
    socket.on('join-room', (data) => {
        const { room, name } = data;
        socket.join(room);
        if (!rooms[room]) {
            rooms[room] = { players: [], turnIndex: 0, cardsInHand: 3, discard: "---", deck: [], roundEnding: false };
        }
        rooms[room].players.push({ id: socket.id, name, hand: [], score: 0, ready: false, isAI: false });
        io.to(room).emit('update-lobby', rooms[room].players);
    });

    socket.on('add-ai', (room) => {
        if (!rooms[room]) return;
        const aiName = "CPU_" + (rooms[room].players.filter(p => p.isAI).length + 1);
        rooms[room].players.push({ id: 'ai-' + Date.now(), name: aiName, hand: [], score: 0, ready: true, isAI: true });
        io.to(room).emit('update-lobby', rooms[room].players);
    });

    socket.on('start-game', (room) => {
        const game = rooms[room];
        game.deck = createDeck();
        game.discard = game.deck.pop();
        game.roundEnding = false;
        game.turnIndex = 0;

        game.players.forEach(p => {
            p.hand = [];
            for(let i=0; i < game.cardsInHand; i++) p.hand.push(game.deck.pop());
            if(!p.isAI) io.to(p.id).emit('receive-hand', p.hand);
        });

        io.to(room).emit('game-start', { cards: game.cardsInHand, discard: game.discard });
        sendTurnUpdate(room);
    });

    function sendTurnUpdate(room) {
        const game = rooms[room];
        const activePlayer = game.players[game.turnIndex];
        io.to(room).emit('update-turn', { activePlayer: activePlayer.name, isEnding: game.roundEnding });

        if (activePlayer.isAI && !game.roundEnding) {
            setTimeout(() => runAITurn(room), 1500);
        }
    }

    function runAITurn(room) {
        const game = rooms[room];
        const ai = game.players[game.turnIndex];
        
        // AI Logic: Draw from deck
        ai.hand.push(game.deck.pop());
        
        // AI Logic: Discard highest card
        ai.hand.sort((a, b) => getVal(b) - getVal(a));
        const discard = ai.hand.shift();
        game.discard = discard;
        
        io.to(room).emit('update-discard', discard);
        
        // Check if AI wants to "Go Out"
        if (canGoOut(ai.hand)) {
            game.roundEnding = true;
            io.to(room).emit('log-action', `${ai.name} is GOING OUT!`);
        }

        game.turnIndex = (game.turnIndex + 1) % game.players.length;
        
        if (game.roundEnding && game.turnIndex === 0) {
            io.to(room).emit('force-score-view');
        } else {
            sendTurnUpdate(room);
        }
    }

    socket.on('play-card', (data) => {
        const { room, card, name } = data;
        const game = rooms[room];
        game.discard = card;
        io.to(room).emit('update-discard', card);
        
        game.turnIndex = (game.turnIndex + 1) % game.players.length;
        if (game.roundEnding && game.turnIndex === 0) {
            io.to(room).emit('force-score-view');
        } else {
            sendTurnUpdate(room);
        }
    });

    socket.on('submit-score', (data) => {
        const game = rooms[data.room];
        const p = game.players.find(p => p.name === data.name);
        if(p) p.score += data.points;
        io.to(data.room).emit('update-lobby', game.players);
        io.to(data.room).emit('show-next-deal-btn');
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
http.listen(3000, () => console.log('Varsity Threes Multi-Room live on 3000'));
