import { useState, useEffect, useRef } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Terrain icons and colors
const TERRAIN_CONFIG = {
  start: { icon: "🏁", color: "bg-green-400", name: "Start" },
  normal: { icon: "🛣️", color: "bg-gray-200", name: "Normal" },
  mountain: { icon: "⛰️", color: "bg-amber-600", name: "Mountain" },
  downhill: { icon: "⬇️", color: "bg-blue-400", name: "Downhill" },
  cobblestone: { icon: "🪨", color: "bg-stone-500", name: "Cobblestone" },
  finish: { icon: "🏆", color: "bg-red-400", name: "Finish" }
};

// Rider colors
const RIDER_COLORS = {
  red: "bg-red-600",
  blue: "bg-blue-600", 
  green: "bg-green-600",
  yellow: "bg-yellow-600",
  purple: "bg-purple-600",
  orange: "bg-orange-600"
};

// Card Component with enhanced styling
const CardComponent = ({ card, onSelect, isSelected, disabled, isPlayed = false }) => {
  const getCardStyle = (type) => {
    switch (type) {
      case 'sprinteur': 
        return 'bg-gradient-to-br from-red-500 to-red-700 text-white border-red-600';
      case 'rouleur': 
        return 'bg-gradient-to-br from-blue-500 to-blue-700 text-white border-blue-600';
      case 'fatigue': 
        return 'bg-gradient-to-br from-gray-600 to-gray-800 text-white border-gray-700';
      default: 
        return 'bg-gradient-to-br from-gray-300 to-gray-400 border-gray-400';
    }
  };

  return (
    <div
      className={`
        ${getCardStyle(card.type)} 
        ${isSelected ? 'ring-4 ring-yellow-400 transform scale-105' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105 hover:shadow-lg'}
        ${isPlayed ? 'opacity-80 ring-2 ring-green-400' : ''}
        p-4 rounded-xl shadow-md transition-all duration-300 min-w-[90px] text-center border-2
        relative overflow-hidden
      `}
      onClick={!disabled ? () => onSelect && onSelect(card) : undefined}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
      <div className="relative z-10">
        <div className="font-bold text-2xl mb-1">{card.value}</div>
        <div className="text-xs font-semibold uppercase tracking-wide">{card.type}</div>
      </div>
    </div>
  );
};

// Enhanced Rider Token with animations
const RiderToken = ({ rider, isMoving = false, showName = false }) => {
  const riderColorClass = RIDER_COLORS[rider.color] || 'bg-gray-600';
  
  return (
    <div className="relative flex flex-col items-center">
      <div
        className={`
          ${riderColorClass} 
          text-white text-xs p-2 rounded-full w-10 h-10 flex items-center justify-center
          font-bold shadow-lg border-2 border-white relative z-20
          ${isMoving ? 'animate-bounce' : ''}
          ${rider.finished ? 'ring-4 ring-yellow-400' : ''}
          transition-all duration-300 hover:scale-110
        `}
        title={`${rider.name} - Position: ${rider.position.track_position}`}
      >
        {rider.name.charAt(0)}
        {rider.finished && (
          <div className="absolute -top-1 -right-1 text-yellow-400 text-lg">👑</div>
        )}
      </div>
      {showName && (
        <div className="text-xs font-semibold mt-1 text-center max-w-[60px] truncate">
          {rider.name.split(' ')[0]}
        </div>
      )}
    </div>
  );
};

// Enhanced Track Tile Component
const TrackTile = ({ tile, riders, index, totalTiles }) => {
  const terrain = TERRAIN_CONFIG[tile.terrain] || TERRAIN_CONFIG.normal;
  const ridersAtPosition = riders.filter(r => r.position.track_position === index);
  
  return (
    <div className="relative">
      <div
        className={`
          ${terrain.color}
          border-2 border-gray-400 min-w-[100px] h-24 relative flex flex-col items-center justify-center
          text-sm font-semibold transition-all duration-300 hover:shadow-lg
          ${index === 0 ? 'border-l-4 border-l-green-600' : ''}
          ${index === totalTiles - 1 ? 'border-r-4 border-r-red-600' : ''}
        `}
      >
        {/* Terrain info */}
        <div className="text-center z-10">
          <div className="text-2xl mb-1">{terrain.icon}</div>
          <div className="text-xs font-bold">{terrain.name}</div>
          <div className="text-xs text-gray-700">Pos {index}</div>
        </div>
        
        {/* Lane indicators */}
        <div className="absolute bottom-1 left-0 right-0 flex justify-center space-x-1">
          {Array.from({ length: tile.lanes }, (_, laneIndex) => (
            <div
              key={laneIndex}
              className="w-2 h-1 bg-gray-500 rounded"
            ></div>
          ))}
        </div>
        
        {/* Weather indicator */}
        {tile.weather && tile.weather !== 'none' && (
          <div className="absolute top-1 right-1 text-lg">
            {tile.weather === 'headwind' && '💨⬅️'}
            {tile.weather === 'tailwind' && '💨➡️'}
            {tile.weather === 'crosswind' && '💨↕️'}
          </div>
        )}
      </div>
      
      {/* Riders at this position */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex space-x-1">
          {ridersAtPosition.map((rider, riderIndex) => (
            <div
              key={rider.id}
              style={{ 
                transform: `translateY(${rider.position.lane * 15 - 7}px)`,
                zIndex: 30 + riderIndex
              }}
            >
              <RiderToken rider={rider} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Track Component with mini-map
const TrackComponent = ({ track, riders, highlightPositions = [] }) => {
  const trackRef = useRef(null);
  
  return (
    <div className="space-y-4">
      {/* Main Track */}
      <div className="track-container bg-gradient-to-b from-sky-200 to-green-200 p-4 rounded-xl shadow-lg">
        <div className="flex space-x-1 overflow-x-auto pb-4" ref={trackRef}>
          {track.tiles.map((tile, index) => (
            <TrackTile
              key={tile.id}
              tile={tile}
              riders={riders}
              index={index}
              totalTiles={track.tiles.length}
            />
          ))}
        </div>
      </div>
      
      {/* Mini-map */}
      <div className="bg-white p-3 rounded-lg shadow-md">
        <h3 className="text-sm font-bold mb-2 text-gray-700">Track Overview</h3>
        <div className="flex space-x-1 overflow-x-auto">
          {track.tiles.map((tile, index) => {
            const terrain = TERRAIN_CONFIG[tile.terrain] || TERRAIN_CONFIG.normal;
            const ridersHere = riders.filter(r => r.position.track_position === index);
            return (
              <div
                key={tile.id}
                className={`
                  ${terrain.color} w-6 h-4 rounded text-xs flex items-center justify-center
                  border border-gray-300 relative
                  ${highlightPositions.includes(index) ? 'ring-2 ring-yellow-400' : ''}
                `}
                title={`${terrain.name} - Position ${index}`}
              >
                <span className="text-xs">{terrain.icon}</span>
                {ridersHere.length > 0 && (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-3 h-3 flex items-center justify-center text-xs">
                    {ridersHere.length}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Phase Banner Component
const PhaseBanner = ({ phase, turn }) => {
  const phaseConfig = {
    card_selection: { 
      icon: "🎯", 
      name: "Card Selection", 
      color: "bg-blue-600",
      description: "Choose cards for your riders"
    },
    movement: { 
      icon: "🚴‍♂️", 
      name: "Movement", 
      color: "bg-green-600",
      description: "Riders move based on cards"
    },
    slipstream: { 
      icon: "💨", 
      name: "Slipstream", 
      color: "bg-cyan-600",
      description: "Drafting behind other riders"
    },
    fatigue: { 
      icon: "😓", 
      name: "Fatigue", 
      color: "bg-orange-600",
      description: "Exhaustion cards added"
    },
    game_over: { 
      icon: "🏆", 
      name: "Game Over", 
      color: "bg-purple-600",
      description: "Race finished!"
    }
  };
  
  const config = phaseConfig[phase] || phaseConfig.card_selection;
  
  return (
    <div className={`${config.color} text-white p-4 rounded-lg shadow-lg`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="text-2xl">{config.icon}</span>
          <div>
            <h2 className="text-xl font-bold">Turn {turn} - {config.name}</h2>
            <p className="text-sm opacity-90">{config.description}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">T{turn}</div>
          <div className="text-xs opacity-75">TOUR</div>
        </div>
      </div>
    </div>
  );
};

// Enhanced Player Hand Component
const PlayerHand = ({ rider, team, onCardSelect, selectedCard, canSelect, gamePhase }) => {
  return (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <RiderToken rider={rider} showName={true} />
          <div>
            <h3 className="text-lg font-bold text-gray-800">{rider.name}</h3>
            <p className="text-sm text-gray-600">
              Position: {rider.position.track_position} | Fatigue: {rider.fatigue_count}
            </p>
          </div>
        </div>
        {rider.finished && (
          <div className="flex items-center space-x-2 text-yellow-600">
            <span className="text-2xl">🏆</span>
            <span className="font-bold">FINISHED!</span>
          </div>
        )}
      </div>
      
      {/* Hand Cards */}
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Hand ({rider.hand.length} cards)</h4>
          <div className="flex flex-wrap gap-2">
            {rider.hand.map(card => (
              <CardComponent
                key={card.id}
                card={card}
                onSelect={onCardSelect}
                isSelected={selectedCard?.id === card.id}
                disabled={!canSelect || rider.finished}
              />
            ))}
          </div>
        </div>
        
        {/* Played Card */}
        {rider.played_card && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Played Card</h4>
            <CardComponent card={rider.played_card} isPlayed={true} disabled={true} />
          </div>
        )}
      </div>
      
      {/* Deck Status */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Sprinteur: {team.sprinteur_deck.length} cards</span>
          <span>Rouleur: {team.rouleur_deck.length} cards</span>
          <span>Fatigue: {team.fatigue_deck.length} cards</span>
        </div>
      </div>
    </div>
  );
};

// Game Stats Component
const GameStats = ({ gameState }) => {
  const allRiders = gameState.teams.flatMap(team => team.riders);
  const finishedRiders = allRiders.filter(r => r.finished);
  const activeRiders = allRiders.filter(r => !r.finished);
  
  return (
    <div className="bg-white p-4 rounded-lg shadow-md">
      <h3 className="text-lg font-bold mb-3 text-gray-800">🏁 Race Statistics</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div className="bg-green-100 p-3 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{finishedRiders.length}</div>
          <div className="text-xs text-green-700">Finished</div>
        </div>
        <div className="bg-blue-100 p-3 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{activeRiders.length}</div>
          <div className="text-xs text-blue-700">Racing</div>
        </div>
        <div className="bg-orange-100 p-3 rounded-lg">
          <div className="text-2xl font-bold text-orange-600">{gameState.current_turn}</div>
          <div className="text-xs text-orange-700">Turn</div>
        </div>
        <div className="bg-purple-100 p-3 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">{gameState.teams.length}</div>
          <div className="text-xs text-purple-700">Teams</div>
        </div>
      </div>
    </div>
  );
};

// Enhanced Game Log Component
const GameLog = ({ log, maxEntries = 8 }) => {
  const recentLog = log.slice(-maxEntries);
  
  return (
    <div className="bg-white p-4 rounded-lg shadow-md">
      <h3 className="text-lg font-bold mb-3 text-gray-800">📝 Game Log</h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {recentLog.length === 0 ? (
          <p className="text-gray-500 text-sm italic">No actions yet...</p>
        ) : (
          recentLog.map((entry, index) => (
            <div
              key={index}
              className="text-sm p-2 bg-gray-50 rounded border-l-4 border-blue-400 animate-fade-in"
            >
              {entry}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Main Game Component
const FlammeRougeGame = () => {
  const [gameState, setGameState] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [selectedCards, setSelectedCards] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [animations, setAnimations] = useState({});

  const createNewGame = async () => {
    setLoading(true);
    setError(null);
    setSelectedCards({});
    try {
      const response = await axios.post(`${API}/flamme-rouge/new-game`, [
        "Human Team", 
        "AI Team 1", 
        "AI Team 2"
      ]);
      
      if (response.data.status === 'success') {
        setGameId(response.data.game_id);
        setGameState(response.data.game_state);
      }
    } catch (err) {
      setError('Failed to create game: ' + err.message);
    }
    setLoading(false);
  };

  const selectCard = async (riderId, card) => {
    if (!gameId || gameState.current_phase !== 'card_selection') return;
    
    setLoading(true);
    try {
      const response = await axios.post(`${API}/flamme-rouge/game/${gameId}/select-card`, null, {
        params: {
          rider_id: riderId,
          card_id: card.id
        }
      });
      
      if (response.data.status === 'success') {
        setGameState(response.data.game_state);
        setSelectedCards(prev => ({ ...prev, [riderId]: card }));
      }
    } catch (err) {
      setError('Failed to select card: ' + err.message);
    }
    setLoading(false);
  };

  const processTurn = async () => {
    if (!gameId) return;
    
    setLoading(true);
    setAnimations({ moving: true });
    
    try {
      const response = await axios.post(`${API}/flamme-rouge/game/${gameId}/process-turn`);
      
      if (response.data.status === 'success') {
        setGameState(response.data.game_state);
        setSelectedCards({});
        
        // Animate movement
        setTimeout(() => {
          setAnimations({ moving: false });
        }, 2000);
      }
    } catch (err) {
      setError('Failed to process turn: ' + err.message);
    }
    setLoading(false);
  };

  const getHumanTeam = () => gameState?.teams[0];
  const getHumanRiders = () => getHumanTeam()?.riders || [];
  const getAllRiders = () => gameState?.teams.flatMap(team => team.riders) || [];

  const canSelectCard = (riderId) => {
    return gameState && 
           gameState.current_phase === 'card_selection' && 
           !getHumanRiders().find(r => r.id === riderId)?.played_card;
  };

  const canProcessTurn = () => {
    if (!gameState) return false;
    if (gameState.current_phase !== 'card_selection') return true;
    
    const humanRiders = getHumanRiders();
    return humanRiders.every(rider => rider.played_card !== null);
  };

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-2xl shadow-2xl text-center max-w-md">
          <div className="text-6xl mb-4">🚴‍♂️</div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">La Flamme Rouge</h1>
          <p className="text-gray-600 mb-6">
            Moteur de jeu de course cycliste avec toutes les mécaniques officielles
          </p>
          <button
            onClick={createNewGame}
            disabled={loading}
            className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 px-8 rounded-xl disabled:opacity-50 transition-all duration-300 transform hover:scale-105"
          >
            {loading ? 'Creating Race...' : '🏁 Start New Race'}
          </button>
          {error && (
            <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  const humanTeam = getHumanTeam();
  const humanRiders = getHumanRiders();
  const allRiders = getAllRiders();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50">
      <div className="container mx-auto p-4 space-y-6">
        {/* Header with Phase Banner */}
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-md">
            <div className="flex items-center space-x-3">
              <span className="text-3xl">🚴‍♂️</span>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">La Flamme Rouge</h1>
                <p className="text-gray-600">{gameState.track.name}</p>
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={processTurn}
                disabled={loading || !canProcessTurn()}
                className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50 transition-all duration-300"
              >
                {loading ? '⏳ Processing...' : '▶️ Process Turn'}
              </button>
              <button
                onClick={createNewGame}
                disabled={loading}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50 transition-all duration-300"
              >
                🔄 New Race
              </button>
            </div>
          </div>
          
          <PhaseBanner phase={gameState.current_phase} turn={gameState.current_turn} />
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg animate-fade-in">
            <div className="flex items-center space-x-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Track Display */}
        <TrackComponent 
          track={gameState.track} 
          riders={allRiders}
          highlightPositions={allRiders.map(r => r.position.track_position)}
        />

        {/* Game Stats */}
        <GameStats gameState={gameState} />

        {/* Player Hands */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-800">👤 Your Riders</h2>
          <div className="grid gap-4">
            {humanRiders.map(rider => (
              <PlayerHand
                key={rider.id}
                rider={rider}
                team={humanTeam}
                onCardSelect={(card) => selectCard(rider.id, card)}
                selectedCard={selectedCards[rider.id]}
                canSelect={canSelectCard(rider.id)}
                gamePhase={gameState.current_phase}
              />
            ))}
          </div>
        </div>

        {/* Team Status & Game Log */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Team Status */}
          <div className="bg-white p-4 rounded-lg shadow-md">
            <h3 className="text-lg font-bold mb-3 text-gray-800">🏁 Team Status</h3>
            <div className="space-y-3">
              {gameState.teams.map((team, index) => (
                <div key={team.id} className="border border-gray-200 p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-800">{team.name}</h4>
                    {index === 0 && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Human</span>}
                    {index > 0 && <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">AI</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {team.riders.map(rider => (
                      <div key={rider.id} className="flex items-center space-x-2 text-sm">
                        <RiderToken rider={rider} />
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium ${rider.finished ? 'line-through text-gray-500' : ''}`}>
                            {rider.name.split(' ')[0]}
                          </div>
                          <div className="text-xs text-gray-600">
                            Pos: {rider.position.track_position}
                            {rider.finished && <span className="text-green-600 font-bold ml-1">✓</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Game Log */}
          <GameLog log={gameState.game_log} />
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <FlammeRougeGame />
    </div>
  );
}

export default App;