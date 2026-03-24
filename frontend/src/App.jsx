import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import './index.css';

const socketUrl = import.meta.env.PROD ? undefined : 'http://localhost:3001';
const socket = io(socketUrl);

function App() {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [room, setRoom] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [correctAnswer, setCorrectAnswer] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState('🐱');

  const avatars = ['🐱', '🦄', '🐶', '🐼', '🦁', '🐻', '🐰', '🐵', '🐧', '🐉', '🐴', '🐷', '🦆', '🐂', '🐐', '🐓'];

  useEffect(() => {
    socket.on('room_update', (roomData) => {
      setRoom(roomData);
    });

    socket.on('game_started', () => {
      setCurrentQuestion(null);
      setSelectedAnswer(null);
      setCorrectAnswer(null);
    });

    socket.on('new_question', (questionData) => {
      setCurrentQuestion(questionData);
      setSelectedAnswer(null);
      setCorrectAnswer(null);
    });

    socket.on('round_end', ({ correctAnswer }) => {
      setCorrectAnswer(correctAnswer);
    });

    socket.on('game_over', (players) => {
      setCurrentQuestion(null);
      // Room state will be updated via room_update to lobby
    });

    socket.on('join_error', (message) => {
      alert(message);
    });

    return () => {
      socket.off('room_update');
      socket.off('game_started');
      socket.off('new_question');
      socket.off('round_end');
      socket.off('game_over');
      socket.off('join_error');
    };
  }, []);

  const joinRoom = (e) => {
    e.preventDefault();
    if (username && roomId) {
      socket.emit('join_room', { roomId, username, avatar: selectedAvatar });
    }
  };

  const startGame = () => {
    if (room && room.hostId === socket.id) {
      socket.emit('start_game', roomId);
    }
  };

  const handleAnswer = (index) => {
    if (selectedAnswer === null && !correctAnswer) {
      setSelectedAnswer(index);
      socket.emit('submit_answer', { roomId, answerIndex: index });
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = "Question,Option 1,Option 2,Option 3,Option 4,Answer (1-4),Time (seconds)\nWhat is 2+2?,3,4,5,6,2,10\nCapital of Japan?,Seoul,Beijing,Tokyo,Bangkok,3,15";
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trivia_template.csv';
    a.click();
  };

  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = text.split('\n').slice(1); // skip header
      const importedQuestions = rows.map((row, idx) => {
        const [q, o1, o2, o3, o4, ans, time] = row.split(',').map(s => s?.trim());
        if (!q) return null;
        return {
          id: idx + 100, // random offset
          question: q,
          options: [o1, o2, o3, o4],
          answerIndex: parseInt(ans) - 1,
          timeLimit: parseInt(time) || 10
        };
      }).filter(q => q !== null);

      if (importedQuestions.length > 0) {
        socket.emit('import_questions', { roomId, questionsList: importedQuestions });
        setShowImportModal(false);
        alert(`Successfully imported ${importedQuestions.length} questions!`);
      }
    };
    reader.readAsText(file);
  };

  const renderLobby = () => (
    <div className="lobby-card">
      <h1 className="title-neon">TRIVIA MASTER</h1>
      <form onSubmit={joinRoom} style={{display:'flex', flexDirection:'column', gap:'15px'}}>
        <input 
          type="text" 
          placeholder="Enter Username" 
          className="input-glow" 
          value={username} 
          onChange={(e) => setUsername(e.target.value)} 
          maxLength={12}
          required 
        />
        <input 
          type="text" 
          placeholder="Room Code (e.g., 123)" 
          className="input-glow" 
          value={roomId} 
          onChange={(e) => setRoomId(e.target.value)} 
          required 
        />
        
        <p style={{textAlign:'center', opacity:0.8, fontSize:'0.9rem'}}>Pick your Avatar:</p>
        <div className="avatar-grid">
           {avatars.map(a => (
              <div 
                key={a} 
                className={`avatar-option ${selectedAvatar === a ? 'selected' : ''}`}
                onClick={() => setSelectedAvatar(a)}
              >
                {a}
              </div>
           ))}
        </div>

        <button type="submit" className="btn-glossy">Join the Battle</button>
      </form>
    </div>
  );

  const renderLeaderboard = () => {
    if (!room) return null;
    const sortedPlayers = Object.values(room.players).sort((a, b) => b.score - a.score);
    const maxScore = Math.max(...sortedPlayers.map(p => p.score), 1);

    return (
      <div className="side-column">
        <h2 className="leaderboard-title">Leaderboard</h2>
        <div className="leaderboard-list">
          {sortedPlayers.map((player, index) => {
             const scoreWidth = (player.score / maxScore) * 100;
             return (
              <div key={player.id} className={`player-row rank-${index + 1} ${player.id === socket.id ? 'is-me' : ''}`}>
                <div className="player-header">
                  <div className="player-rank">#{index + 1}</div>
                  <div className="player-avatar">
                     {player.avatar}
                  </div>
                  <div className="player-info">
                    <div className="player-name">{player.name}</div>
                    <div className="player-score">{player.score} pts</div>
                  </div>
                </div>
                <div className="score-bar-bg">
                  <div className="score-bar-fill" style={{width: `${scoreWidth}%`}}></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderGameArea = () => {
    if (!room) return null;

    if (room.status === 'lobby') {
      return (
        <div className="main-column">
          <div className="neon-card">
            <h2 className="title-neon" style={{fontSize: '2.5rem'}}>Waiting in Lobby</h2>
            <div style={{background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '15px', marginBottom: '30px', border: '1px dashed var(--accent-cyan)'}}>
               <h3 style={{color: 'var(--accent-cyan)', marginBottom: '5px'}}>Room: {roomId}</h3>
               <p style={{opacity: 0.7}}>Share this code with your friends!</p>
            </div>
            {room.hostId === socket.id ? (
              <div style={{display: 'flex', flexDirection: 'column', gap: '15px', width: '100%', alignItems: 'center'}}>
                <button onClick={startGame} className="btn-glossy" style={{width: '100%'}}>START GAME</button>
                <button 
                   onClick={() => setShowImportModal(true)} 
                   className="import-btn-outline" 
                   style={{width: '100%', textTransform: 'uppercase'}}
                >
                   ⚙️ Import Questions
                </button>
              </div>
            ) : (
              <p style={{fontSize: '1.2rem', animation: 'pulse 1.5s infinite'}}>Waiting for host to start...</p>
            )}
          </div>
        </div>
      );
    }

    if (room.status === 'game_over') {
      const winners = Object.values(room.players).sort((a, b) => b.score - a.score);
      return (
        <div className="main-column">
          <div className="neon-card" style={{borderColor: 'var(--accent-gold)'}}>
            <h1 className="title-neon" style={{color: 'var(--accent-gold)', textShadow: '0 0 20px var(--accent-gold)'}}>🏆 LỄ TRAO GIẢI 🏆</h1>
            <div style={{display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '30px', width: '100%'}}>
               {winners.slice(0, 3).map((w, i) => (
                 <div key={w.id} className={`player-row rank-${i+1}`} style={{padding: '20px', display: 'flex', flexDirection: 'row', alignItems: 'center', background: 'rgba(255,255,255,0.05)'}}>
                    <span style={{fontSize: '2rem', fontWeight: 'bold', width: '40px'}}>#{i+1}</span>
                    <span style={{fontSize: '3rem', marginLeft: '20px'}}>{w.avatar}</span>
                    <span style={{flex: 1, fontSize: '1.8rem', textAlign: 'left', marginLeft: '20px'}}>{w.name}</span>
                    <span style={{fontSize: '1.8rem', fontWeight: 'bold'}}>{w.score} pts</span>
                 </div>
               ))}
            </div>
            <p style={{marginTop: '30px', opacity: 0.7}}>Quay lại sảnh chờ sau 10 giây...</p>
          </div>
        </div>
      );
    }

    if (currentQuestion) {
      return (
        <div className="main-column">
          <div className="neon-card">
            <div style={{position: 'absolute', top: '-20px', left: '50%', transform: 'translateX(-50%)', background: 'var(--accent-magenta)', padding: '5px 20px', borderRadius: '20px', fontWeight: 'bold'}}>
              ROUND {currentQuestion.round} / {currentQuestion.totalRounds}
            </div>
            
            <h3 className="question-text">{currentQuestion.question}</h3>
            
            <div className="options-grid">
              {currentQuestion.options.map((option, index) => {
                let btnClass = "option-btn";
                if (correctAnswer) {
                  if (option === correctAnswer) btnClass += " correct";
                  else if (selectedAnswer === index) btnClass += " wrong";
                } else if (selectedAnswer === index) {
                  btnClass += " selected";
                }

                return (
                  <button 
                    key={index} 
                    className={btnClass}
                    onClick={() => handleAnswer(index)}
                    disabled={selectedAnswer !== null || correctAnswer}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {!correctAnswer && (
               <div className="timer-container">
                 <div 
                   key={currentQuestion.id} 
                   className="timer-bar timer-running" 
                   style={{animationDuration: `${currentQuestion.timeLimit}s`}}
                 ></div>
               </div>
            )}
            
            {correctAnswer && (
               <div style={{marginTop: '20px', fontSize: '1.5rem', color: 'var(--accent-gold)'}}>
                  Waiting for next round...
               </div>
            )}
          </div>
        </div>
      );
    }

    return (
       <div className="main-column">
           <div className="neon-card">
              <h2>Loading...</h2>
           </div>
       </div>
    );
  };

  return (
    <div className="game-container">
      {!room ? (
        <div className="main-column">
           {renderLobby()}
        </div>
      ) : (
        <>
          {renderGameArea()}
          {renderLeaderboard()}
          
          {showImportModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <button className="close-modal" onClick={() => setShowImportModal(false)}>×</button>
                <h2 className="title-neon" style={{fontSize: '1.8rem', marginBottom: '20px'}}>Import Questions</h2>
                <div className="import-actions">
                   <p>Do you have a CSV template?</p>
                   <button className="btn-glossy" onClick={handleDownloadTemplate} style={{fontSize: '0.9rem'}}>
                      Download Template
                   </button>
                   <div className="file-input-wrapper">
                      <p style={{marginBottom: '10px', fontSize: '0.9rem'}}>Select your filled template:</p>
                      <input 
                        type="file" 
                        accept=".csv" 
                        onChange={handleImportCSV} 
                        style={{cursor: 'pointer'}} 
                      />
                   </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
