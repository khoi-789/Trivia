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
  const [hostPassword, setHostPassword] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [manualMode, setManualMode] = useState(false);
  const [roomName, setRoomName] = useState('My Trivia Game');
  const [bgUrl, setBgUrl] = useState('');
  const [bgOpacity, setBgOpacity] = useState(0.5);
  const [bgMistColor, setBgMistColor] = useState('#f0f4f8');

  const avatars = ['🐱', '🦄', '🐶', '🐼', '🦁', '🐻', '🐰', '🐵', '🐧', '🐉', '🐴', '🐷', '🦆', '🐂', '🐐', '🐓'];

  useEffect(() => {
    // Check URL for room ID
    const urlParams = new URLSearchParams(window.location.search);
    const r = urlParams.get('room');
    if (r) setRoomId(r);
  }, []);

  useEffect(() => {
    socket.on('room_update', (roomData) => {
      setRoom(roomData);
      // Dynamic background
      if (roomData.bgUrl) {
         document.body.style.background = `url(${roomData.bgUrl}) center/cover no-repeat fixed`;
         document.body.style.setProperty('--mist-opacity', roomData.bgOpacity || 0.5);
         document.body.style.setProperty('--mist-color', roomData.bgMistColor || '#f0f4f8');
      } else {
        document.body.style.background = 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)';
        document.body.style.setProperty('--mist-opacity', 0);
      }
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
      socket.emit('join_room', { roomId, username, avatar: selectedAvatar, hostPassword });
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
    const csvContent = "Question,Option 1,Option 2,Option 3,Option 4,Answer (1-4),Time (seconds),Points\nWhat is 2+2?,3,4,5,6,2,10,100\nCapital of Japan?,Seoul,Beijing,Tokyo,Bangkok,3,15,200";
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
        const [q, o1, o2, o3, o4, ans, time, pts] = row.split(',').map(s => s?.trim());
        if (!q) return null;
        return {
          id: idx + 100,
          question: q,
          options: [o1, o2, o3, o4],
          answerIndex: parseInt(ans) - 1,
          timeLimit: parseInt(time) || 10,
          points: parseInt(pts) || 100
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
        <input 
          type="password" 
          placeholder="Host Password (Leave blank to just join)" 
          className="input-glow" 
          value={hostPassword} 
          onChange={(e) => setHostPassword(e.target.value)} 
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

  const updateSettings = () => {
     socket.emit('update_room_settings', { roomId, maxPlayers, manualMode, roomName, bgUrl, bgOpacity, bgMistColor });
  };
  
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(window.location.origin + '?room=' + roomId)}`;

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
            <h2 className="title-neon" style={{fontSize: '2.5rem'}}>{room.roomName || 'Waiting in Lobby'}</h2>
            
            <div className="lobby-info-grid">
               <div className="share-box">
                  <h3 style={{color: 'var(--accent-blue)', marginBottom: '5px'}}>Room: {roomId}</h3>
                  <div className="qr-container">
                     <img src={qrUrl} alt="Quick Join QR" className="qr-img" />
                     <p style={{fontSize: '0.8rem', marginTop: '10px', opacity:0.6}}>Scan to join!</p>
                  </div>
                  <button 
                     onClick={() => {
                        navigator.clipboard.writeText(window.location.origin + '?room=' + roomId);
                        alert("Link copied!");
                     }}
                     className="btn-tiny-glossy"
                  >
                     📋 Copy Link
                  </button>
               </div>

               {room.hostId === socket.id && (
                  <div className="host-controls-card">
                     <h3>Host Controls</h3>
                     <div className="setting-row">
                        <span>Room Name:</span>
                        <input type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)} onBlur={updateSettings} className="host-input-flat" />
                     </div>
                     <div className="setting-row">
                        <span>Max Players:</span>
                        <input type="number" value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} onBlur={updateSettings} className="host-input-flat" style={{width: '60px'}} />
                     </div>
                     <div className="setting-row">
                        <span>Background URL:</span>
                        <div style={{display:'flex', gap:'5px', width:'60%'}}>
                          <input type="text" value={bgUrl} placeholder="Direct Image Link" onChange={(e) => setBgUrl(e.target.value)} className="host-input-flat" style={{width:'100%'}} />
                          <button onClick={updateSettings} className="btn-tiny-glossy" style={{padding:'5px 10px'}}>SET</button>
                        </div>
                     </div>
                     <div className="setting-row">
                        <span>Fog (Color/Opacity):</span>
                        <div style={{display:'flex', gap:'5px', width:'60%'}}>
                          <input type="color" value={bgMistColor} onChange={(e) => { setBgMistColor(e.target.value); updateSettings(); }} style={{border:'none', width:'30px', background:'none'}} />
                          <input type="range" min="0" max="1" step="0.1" value={bgOpacity} onChange={(e) => { setBgOpacity(e.target.value); updateSettings(); }} style={{flex:1}} />
                        </div>
                     </div>
                     <div className="setting-row toggle-row">
                        <span>Manual Next Question:</span>
                        <label className="switch">
                           <input type="checkbox" checked={manualMode} onChange={(e) => { setManualMode(e.target.checked); socket.emit('update_room_settings', { roomId, manualMode: e.target.checked }); }} />
                           <span className="slider round"></span>
                        </label>
                     </div>
                  </div>
               )}
            </div>

            {room.hostId === socket.id ? (
              <div style={{display: 'flex', flexDirection: 'column', gap: '15px', width: '100%', marginTop: '20px'}}>
                <button onClick={startGame} className="btn-glossy" style={{width: '100%'}}>START THE MISSION</button>
                <button 
                   onClick={() => setShowImportModal(true)} 
                   className="btn-tiny-glossy" 
                   style={{width: '100%', padding:'15px'}}
                >
                   ⚙️ Import Questions
                </button>
              </div>
            ) : (
              <p style={{fontSize: '1.2rem', animation: 'pulse 1.5s infinite', marginTop: '20px'}}>Ready for the Mission...</p>
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
            <div style={{display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px', width: '100%'}}>
               {winners.slice(0, 3).map((w, i) => (
                 <div key={w.id} className={`player-row winner-rank-${i+1}`}>
                    <div style={{display:'flex', alignItems:'center', gap: '15px'}}>
                      <span style={{fontSize: '2rem', fontWeight: '900'}}>#{i+1}</span>
                      <span style={{fontSize: '2.5rem'}}>{w.avatar}</span>
                      <span style={{flex: 1, fontSize: '1.4rem', fontWeight:'bold'}}>{w.name}</span>
                      <span style={{fontSize: '1.4rem', fontWeight: '900', color:'var(--accent-blue)'}}>{w.score} pts</span>
                    </div>
                 </div>
               ))}
            </div>
            
            {room.hostId === socket.id ? (
               <button 
                  onClick={() => socket.emit('back_to_lobby', roomId)} 
                  className="btn-glossy" 
                  style={{width:'100%', marginTop:'30px'}}
               >
                  DONE - BACK TO LOBBY
               </button>
            ) : (
               <p style={{marginTop: '30px', opacity: 0.7}}>Game Finished! Waiting for host...</p>
            )}
          </div>
        </div>
      );
    }

    if (currentQuestion) {
      return (
        <div className="main-column">
          <div className="neon-card">
            <h4 className="topic-badge">{room.roomName}</h4>
            <div className="round-badge">
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
               <div style={{marginTop: '20px', width:'100%'}}>
                  {room.hostId === socket.id && room.manualMode ? (
                     <button onClick={() => socket.emit('next_question', roomId)} className="btn-glossy" style={{width:'100%'}}>NEXT QUESTION</button>
                  ) : (
                     <div style={{fontSize: '1.5rem', color: 'var(--accent-gold)'}}>Waiting for next round...</div>
                  )}
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
    <div className="game-container" style={room?.bgUrl ? {backgroundImage: `url(${room.bgUrl})`, backgroundSize:'cover', backgroundPosition:'center'} : {}}>
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
                      <p style={{marginBottom: '10px', fontSize: '0.9rem', fontWeight:'bold'}}>Select your filled template:</p>
                      <input 
                        type="file" 
                        accept=".csv" 
                        onChange={handleImportCSV} 
                        className="custom-file-input"
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
