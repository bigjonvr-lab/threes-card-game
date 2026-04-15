const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

let players = [];
let deck = [];
let currentDiscard = "---";
let activePlayerIndex = 0;
let roundCount = 3; // Starts at 3s
let isEnding = false;
let playersFinishedScoring = 0;
let deckCount = 1;

app.use(express.static('public'));

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

    socket.on('set-decks', (num) => {
        deckCount = parseInt(num);
    });

    socket.on('player-ready', () => {
        const p = players.find(p => p.name === socket.playerName);
        if (p) p.ready = true;
        io.emit('update-lobby', players);
    });

    socket.on('start-game-rotation', () => {
        initGame();
    });

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

    socket.on('broadcast-hand', (data) => {
        io.emit('log-hand-reveal', data);
    });

    socket.on('submit-score', (data) => {
        const p = players.find(p => p.name === data.name);
        if (p) {
            p.score += data.points;
            playersFinishedScoring++;
            io.emit('update-lobby', players);
            
            if (playersFinishedScoring >= players.length) {
                io.emit('show-next-deal-btn');
            }
        }
    });

    socket.on('next-round-setup', () => {
        roundCount++;
        if (roundCount > 13) roundCount = 3; // Loop back to 3s or end game
        isEnding = false;
        playersFinishedScoring = 0;
    });
});

function initGame() {
    // Create Decks
    deck = [];
    const suits = ['♥', '♦', '♣', '♠'];
    const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    for (let d = 0; d < deckCount; d++) {
        for (let s of suits) {
            for (let v of values) deck.push(v + s);
        }
    }
    // Shuffle
    deck.sort(() => Math.random() - 0.5);

    // Deal
    players.forEach(p => {
        p.hand = [];
        for (let i = 0; i < roundCount; i++) p.hand.push(deck.pop());
        io.emit('receive-hand-to-' + p.name, p.hand); // Private event per player
    });

    // We use a general emit for this demo, but usually you'd target sockets
    io.emit('receive-hand', []); 
    // Trigger the shuffle animation on front-end
    io.emit('shuffle-transition');
    
    setTimeout(() => {
        currentDiscard = deck.pop();
        io.emit('sync-round', roundCount);
        io.emit('update-discard', currentDiscard);
        io.emit('game-transition');
        startTurns();
    }, 3000);
}

function startTurns() {
    activePlayerIndex = 0;
    sendTurnUpdate();
}

function sendTurnUpdate() {
    const activePlayer = players[activePlayerIndex];
    io.emit('update-turn', { activePlayer: activePlayer.name, isEnding });

    if (activePlayer.isBot && !isEnding) {
        runBotLogic(activePlayer);
    } else if (activePlayer.isBot && isEnding) {
        // Bot just takes its last turn and the round ends
        setTimeout(() => { botFinishRound(activePlayer); }, 1000);
    }
}

function nextTurn() {
    activePlayerIndex = (activePlayerIndex + 1) % players.length;
    
    // Check if we've come back to the person who went out
    if (isEnding && players[activePlayerIndex].name === "The person who went out") {
        io.emit('force-score-view');
        // Auto-score bots
        players.filter(p => p.isBot).forEach(bot => {
            let botScore = calculateBotScore(bot.hand);
            io.emit('log-hand-reveal', {name: bot.name, hand: bot.hand, points: botScore});
            bot.score += botScore;
            playersFinishedScoring++;
        });
        io.emit('update-lobby', players);
        return;
    }
    
    sendTurnUpdate();
}

function runBotLogic(bot) {
    setTimeout(() => {
        // Bot draws
        const drawn = deck.pop();
        bot.hand.push(drawn);
        
        setTimeout(() => {
            // Bot discards highest card that isn't wild
            bot.hand.sort((a,b) => b.length - a.length); // Very basic sort
            const discard = bot.hand.shift();
            currentDiscard = discard;
            io.emit('update-discard', currentDiscard);
            nextTurn();
        }, 1000);
    }, 1000);
}

function calculateBotScore(hand) {
    let pts = 0;
    hand.forEach(card => {
        let val = card.replace(/[♥♦♣♠]/, '');
        if (val === 'A') pts += 1; 
        else if (['J','Q','K'].includes(val)) pts += 10; 
        else pts += parseInt(val) || 0;
    });
    return Math.floor(pts * 0.5); // Bots "cheat" slightly and match half their cards
}

http.listen(3000, () => { console.log('Big Jon Games Server Running on port 3000'); });
