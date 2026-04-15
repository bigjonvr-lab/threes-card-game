const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

let rooms = {};

function getActiveRooms() {
    return Object.keys(rooms).map(id => ({
        id, count: rooms[id].players.length, started: rooms[id].started
    }));
}

io.on('connection', (socket) => {
    socket.emit('room-list', getActiveRooms());

    socket.on('join-room', (data) => {
        const rid = data.roomId.toUpperCase();
        socket.join(rid);
        socket.roomId = rid;
        socket.playerName = data.name;

        if (!rooms[rid]) {
            rooms[rid] = {
                players: [], deck: [], discard: "---",
                activeIdx: 0, round: 3, isEnding: false,
                outPlayer: "", deckCount: 1, started: false
            };
        }
        let r = rooms[rid];
        if (!r.players.find(p => p.name === data.name)) {
            r.players.push({ name: data.name, score: 0, ready: false, hand: [], socketId: socket.id });
        } else {
            // Update socket ID if they reconnected
            const p = r.players.find(p => p.name === data.name);
            p.socketId = socket.id;
        }

        io.to(rid).emit('update-lobby', r.players);
        io.emit('room-list', getActiveRooms());
        
        if (r.started) {
            socket.emit('game-transition');
            socket.emit('sync-round', r.round);
            socket.emit('update-discard', r.discard);
            socket.emit('receive-hand', r.players.find(p => p.name === data.name).hand);
        }
    });

    socket.on('start-game-rotation', () => {
        if (rooms[socket.roomId]) initGame(socket.roomId);
    });

    socket.on('play-card', (data) => {
        let r = rooms[socket.roomId];
        if(!r) return;
        const p = r.players.find(pl => pl.name === socket.playerName);
        if(p && data.card !== "---") {
            const index = p.hand.indexOf(data.card);
            if (index > -1) p.hand.splice(index, 1);
        }
        r.discard = data.card;
        io.to(socket.roomId).emit('update-discard', r.discard);
        nextTurn(socket.roomId);
    });

    socket.on('request-cards', () => {
        let r = rooms[socket.roomId];
        if(r) {
            const p = r.players.find(pl => pl.name === socket.playerName);
            if (p) socket.emit('receive-hand', p.hand);
        }
    });

    socket.on('trigger-out', (name) => {
        let r = rooms[socket.roomId];
        if(!r) return;
        r.isEnding = true;
        r.outPlayer = name;
        io.to(socket.roomId).emit('going-out-alert', name);
        nextTurn(socket.roomId);
    });

    socket.on('submit-score', (data) => {
        let r = rooms[socket.roomId];
        if(!r) return;
        const p = r.players.find(p => p.name === data.name);
        if (p) { p.score += data.points; io.to(socket.roomId).emit('update-lobby', r.players); }
    });

    socket.on('next-round-setup', () => {
        let r = rooms[socket.roomId];
        if(!r) return;
        r.round = (r.round >= 13) ? 1 : r.round + 1;
        r.isEnding = false;
        r.outPlayer = "";
        io.to(socket.roomId).emit('clear-game-logs');
        initGame(socket.roomId);
    });

    socket.on('reset-whole-game', () => {
        if(rooms[socket.roomId]) {
            const rid = socket.roomId;
            delete rooms[rid];
            io.to(rid).emit('game-reset-broadcast');
            io.emit('room-list', getActiveRooms());
        }
    });
});

function initGame(roomId) {
    let r = rooms[roomId];
    r.deck = [];
    r.started = true;
    const suits = ['♥', '♦', '♣', '♠'], values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    for (let i = 0; i < r.deckCount; i++) {
        for (let s of suits) { for (let v of values) r.deck.push(v + s); }
    }
    r.deck.sort(() => Math.random() - 0.5);
    
    r.players.forEach(p => {
        p.hand = [];
        for (let i = 0; i < r.round; i++) { p.hand.push(r.deck.pop()); }
        // Send directly to this player's specific socket
        io.to(p.socketId).emit('receive-hand', p.hand);
    });

    io.to(roomId).emit('shuffle-transition');
    
    setTimeout(() => {
        r.discard = r.deck.pop();
        io.to(roomId).emit('sync-round', r.round);
        io.to(roomId).emit('update-discard', r.discard);
        io.to(roomId).emit('game-transition');
        r.activeIdx = 0;
        io.to(roomId).emit('update-turn', { activePlayer: r.players[0].name, isEnding: false });
    }, 3000);
}

function nextTurn(roomId) {
    let r = rooms[roomId];
    r.activeIdx = (r.activeIdx + 1) % r.players.length;
    if (r.isEnding && r.players[r.activeIdx].name === r.outPlayer) {
        io.to(roomId).emit('force-score-view');
        return;
    }
    io.to(roomId).emit('update-turn', { activePlayer: r.players[r.activeIdx].name, isEnding: r.isEnding });
}

http.listen(3000, () => { console.log('Server running on 3000'); });
