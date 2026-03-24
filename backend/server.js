const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;

// Basic Mock Questions
const questions = [
  {
    id: 1,
    question: "What is the capital of France?",
    options: ["Berlin", "Madrid", "Paris", "Rome"],
    answerIndex: 2,
    timeLimit: 10
  },
  {
    id: 2,
    question: "Which planet is known as the Red Planet?",
    options: ["Mars", "Jupiter", "Venus", "Saturn"],
    answerIndex: 0,
    timeLimit: 10
  },
  {
    id: 3,
    question: "Who wrote 'Romeo and Juliet'?",
    options: ["Charles Dickens", "William Shakespeare", "Mark Twain", "Homer"],
    answerIndex: 1,
    timeLimit: 10
  }
];

// In-memory state
const rooms = {};

io.on('connection', (socket) => {
  console.log(`User Connected: ${socket.id}`);

  socket.on('join_room', ({ roomId, username, avatar }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        hostId: socket.id,
        players: {},
        status: 'lobby',
        currentQuestionIndex: -1,
        questions: [...questions], 
        questionStartTime: 0,
        scores: {} // Kept scores, as it was in original and not removed by diff
      };
    } else {
      // Check for duplicate username
      const nameExists = Object.values(rooms[roomId].players).some(
        p => p.name.toLowerCase() === username.toLowerCase()
      );
      
      if (nameExists) {
        return socket.emit('join_error', 'Tên này đã có người sử dụng trong phòng này rồi!');
      }
    }

    socket.join(roomId);
    rooms[roomId].players[socket.id] = {
      id: socket.id,
      name: username,
      avatar: avatar || '🐱',
      score: 0,
      categories: 0
    };

    const getSafeRoom = (r) => {
      const { timeout, ...safeRoom } = r;
      return safeRoom;
    };

    io.to(roomId).emit('room_update', getSafeRoom(rooms[roomId]));
    console.log(`User ${username} joined room: ${roomId}`);
  });

  socket.on('start_game', (roomId) => {
    const room = rooms[roomId];
    if (room && room.hostId === socket.id) {
      room.status = 'playing';
      room.currentQuestionIndex = 0;
      // Reset scores and categories
      Object.keys(room.players).forEach(pId => {
        room.players[pId].score = 0;
        room.players[pId].categories = 0;
      });
      
      io.to(roomId).emit('game_started');
      
      const safeRoom = { ...room };
      delete safeRoom.timeout;
      io.to(roomId).emit('room_update', safeRoom);

      sendQuestion(roomId);
    }
  });

  function sendQuestion(roomId) {
    const room = rooms[roomId];
    if (!room || !room.questions) return;

    if (room.currentQuestionIndex < room.questions.length) {
      const q = room.questions[room.currentQuestionIndex];
      // Do not send answerIndex to clients!
      const questionData = {
        id: q.id,
        question: q.question,
        options: q.options,
        timeLimit: q.timeLimit,
        round: room.currentQuestionIndex + 1,
        totalRounds: questions.length
      };
      
      io.to(roomId).emit('new_question', questionData);
      room.questionStartTime = Date.now();

      // Simple implementation: wait for timer then move to next
      // We handle answers via socket events before timer ends.
      // E.g., a simple setTimeout for the round
      room.timeout = setTimeout(() => {
        io.to(roomId).emit('round_end', {
            correctAnswer: q.options[q.answerIndex]
        });
        
        setTimeout(() => {
            room.currentQuestionIndex++;
            if(room.currentQuestionIndex >= room.questions.length) {
               room.status = 'game_over';
               io.to(roomId).emit('game_over', room.players);
               
               const safeRoom = { ...room };
               delete safeRoom.timeout;
               io.to(roomId).emit('room_update', safeRoom);

               // After 10 seconds, go back to lobby
               setTimeout(() => {
                 if (rooms[roomId]) {
                   rooms[roomId].status = 'lobby';
                   rooms[roomId].currentQuestionIndex = -1;
                   const lobbyRoom = { ...rooms[roomId] };
                   delete lobbyRoom.timeout;
                   io.to(roomId).emit('room_update', lobbyRoom);
                 }
               }, 10000);
            } else {
               sendQuestion(roomId);
            }
        }, 5000); // Wait 5s between rounds

      }, q.timeLimit * 1000);

    }
  }

  socket.on('submit_answer', ({ roomId, answerIndex }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const currentQ = room.questions[room.currentQuestionIndex];
    if (currentQ && currentQ.answerIndex === answerIndex) {
      if (room.players[socket.id]) {
        // Calculate speed-based score
        const timeElapsed = (Date.now() - room.questionStartTime) / 1000;
        const timeLimit = currentQ.timeLimit;
        
        // Points = max_points * (0.3 + 0.7 * (remaining_time / total_time))
        const remainingRatio = Math.max(0, (timeLimit - timeElapsed) / timeLimit);
        const points = Math.floor(100 * (0.3 + 0.7 * remainingRatio));

        room.players[socket.id].score += points;
        // update categories for pie chart mock
        room.players[socket.id].categories = Math.min(6, room.players[socket.id].categories + 1);
        
        // Broadcast updated scores
        const safeRoom = { ...room };
        delete safeRoom.timeout;
        io.to(roomId).emit('room_update', safeRoom);
      }
    }
  });

  socket.on('import_questions', ({ roomId, questionsList }) => {
    const room = rooms[roomId];
    if (room && room.hostId === socket.id) {
       room.questions = questionsList;
       console.log(`Room ${roomId} updated with ${questionsList.length} custom questions.`);
       
       const safeRoom = { ...room };
       delete safeRoom.timeout;
       io.to(roomId).emit('room_update', safeRoom);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User Disconnected: ${socket.id}`);
    // Handle cleanup
    for (const roomId in rooms) {
      if (rooms[roomId].players[socket.id]) {
        delete rooms[roomId].players[socket.id];
        
        // if host leaves, maybe assign new host or delete room
        // if empty, delete room
        if (Object.keys(rooms[roomId].players).length === 0) {
            if(rooms[roomId].timeout) clearTimeout(rooms[roomId].timeout);
            delete rooms[roomId];
        } else {
            const safeRoom = { ...rooms[roomId] };
            delete safeRoom.timeout;
            io.to(roomId).emit('room_update', safeRoom);
        }
      }
    }
  });
});

// Serve static files from the React frontend app
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Anything that doesn't match the above, send back index.html
app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

server.listen(PORT, () => {
  console.log(`Socket.IO Server running on port ${PORT}`);
});
