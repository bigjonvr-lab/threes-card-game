const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

let rooms = {};

// Helper to check if a group of cards is a Set (3 of a kind) or Run (Sequence)
function isMeld(cards) {
    if (cards.length < 3) return false;
    
    const values = cards.map(c => c.replace(/[♥♦♣♠]/, ''));
    const suits = cards.map(c => c.slice(-1));

    // Check Set: All values same
    if (values.every(v => v === values[0])) return true;

    // Check Run: Same suit + consecutive numbers
    if (suits.every(s => s === suits[0])) {
        const order = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
        let indices = values.map(v => order.indexOf(v)).sort((a, b) => a - b);
        for (let i = 0; i < indices.length - 1; i++) {
            if (indices[i+1] !== indices[i] + 1) return false;
        }
        return true;
    }
    return false;
}

io.on('connection', (socket) => {
    socket.on('join-room', (data) => {
        const { room, name } = data;
        socket.join(room);
        if (!rooms[room]) {
            rooms[room] = { players: [], turnIndex: 0, cardsInHand: 3, discard: "---", deck: [] };
        }
        rooms[room].players.push({ id: socket.id, name, hand: [], score: 0, ready: false, isAI: false });
        io.to(room).emit('update-lobby', rooms[room].players);
    });

    socket.on('add-ai', (room) => {
        const aiName = "CPU_" + Math.floor(Math.random()*99);
        rooms[room].players.push({ id: 'ai-'+Date.now(), name: aiName, hand: [], score: 0, ready: true, isAI: true });
        io.to(room).emit('update-lobby', rooms[room].players);
    });

    socket.on('start-game-rotation', (room) => {
        const game = rooms[room];
        // ... (Dealing logic similar to before, but checking melds for AI)
    });
    
    // Logic for AI to decide if it can "Go Out"
    // (In a meld game, the AI would check if its hand can be partitioned into isMeld() groups)
});

http.listen(3000, () => console.log("Multi-room Meld Server live."));
