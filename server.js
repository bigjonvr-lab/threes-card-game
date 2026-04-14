const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Tell the server to show your index.html file
app.get('/', (req, res) => {
    res.sendFile(path.join(__currentDir, 'index.html'));
});

io.on('connection', (socket) => {
    // When someone discards
    socket.on('play-card', (data) => {
        io.emit('update-discard', data.card);
        io.emit('log-action', `${data.player} discarded ${data.card}`);
    });

    // When someone draws
    socket.on('draw-event', (playerName) => {
        io.emit('log-action', `${playerName} drew a card`);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Threes game running on port ${PORT}`);
});
