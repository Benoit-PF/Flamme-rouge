import { useState, useEffect } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Card component
const CardComponent = ({ card, onSelect, isSelected, disabled }) => {
  const getCardColor = (type) => {
    switch (type) {
      case 'sprinteur': return 'bg-red-500 text-white';
      case 'rouleur': return 'bg-blue-500 text-white';
      case 'fatigue': return 'bg-gray-600 text-white';
      default: return 'bg-gray-300';
    }
  };

  return (
    <div
      className={`
        ${getCardColor(card.type)} 
        ${isSelected ? 'ring-4 ring-yellow-400' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}
        p-3 rounded-lg shadow-md transition-all duration-200 min-w-[80px] text-center
      `}
      onClick={!disabled ? () => onSelect(card) : undefined}
    >
      <div className="font-bold text-lg">{card.value}</div>
      <div className="text-xs capitalize">{card.type}</div>
    </div>
  );
};

// Rider component
const RiderComponent = ({ rider, position }) => {
  const getRiderColor = (color) => {
    const colorMap = {
      red: 'bg-red-600',
      blue: 'bg-blue-600', 
      green: 'bg-green-600',
      yellow: 'bg-yellow-600',
      purple: 'bg-purple-600',
      orange: 'bg-orange-600'
    };
    return colorMap[color] || 'bg-gray-600';
  };

  return (
    <div
      className={`
        ${getRiderColor(rider.color)} 
        text-white text-xs p-2 rounded-full w-8 h-8 flex items-center justify-center
        font-bold shadow-md
      `}
      title={rider.name}
      style={{ 
        position: 'absolute',
        left: `${position.lane * 40}px`,
        zIndex: 10
      }}
    >
      {rider.name.charAt(0)}
    </div>
  );
};

// Track component
const TrackComponent = ({ track, riders }) => {
  const getTerrainColor = (terrain) => {
    switch (terrain) {
      case 'start': return 'bg-green-300';
      case 'normal': return 'bg-gray-200';
      case 'mountain': return 'bg-amber-600';
      case 'downhill': return 'bg-blue-300';
      case 'cobblestone': return 'bg-stone-400';
      case 'finish': return 'bg-red-300';
      default: return 'bg-gray-200';
    }
  };

  const getTerrainIcon = (terrain) => {
    switch (terrain) {
      case 'start': return '🏁';
      case 'mountain': return '⛰️';
      case 'downhill': return '⬇️';
      case 'cobblestone': return '🪨';
      case 'finish': return '🏆';
      default: return '';
    }
  };

  return (
    <div className="track-container overflow-x-auto p-4">
      <div className="flex space-x-1 min-w-max">
        {track.tiles.map((tile, index) => {
          const ridersAtPosition = riders.filter(r => r.position.track_position === index);
          
          return (
            <div
              key={tile.id}
              className={`
                ${getTerrainColor(tile.terrain)}
                border border-gray-400 min-w-[80px] h-20 relative flex flex-col items-center justify-center
                text-xs font-semibold
              `}
            >
              <div className="text-center">
                <div>{getTerrainIcon(tile.terrain)}</div>
                <div className="capitalize text-[10px]">{tile.terrain}</div>
                <div className="text-[10px] text-gray-600">Pos {index}</div>
              </div>
              
              {/* Render riders at this position */}
              {ridersAtPosition.map((rider, riderIndex) => (
                <RiderComponent 
                  key={rider.id} 
                  rider={rider} 
                  position={{ lane: rider.position.lane }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Main game component
const FlammeRougeGame = () => {
  const [gameState, setGameState] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createNewGame = async () => {
    setLoading(true);
    setError(null);
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

  const selectCard = async (card) => {
    if (!gameId || gameState.current_phase !== 'card_selection') return;
    
    // Find human rider (first team, first rider for simplicity)
    const humanTeam = gameState.teams[0];
    const humanRider = humanTeam.riders[0];
    
    setLoading(true);
    try {
      const response = await axios.post(`${API}/flamme-rouge/game/${gameId}/select-card`, null, {
        params: {
          rider_id: humanRider.id,
          card_id: card.id
        }
      });
      
      if (response.data.status === 'success') {
        setGameState(response.data.game_state);
        setSelectedCard(null);
      }
    } catch (err) {
      setError('Failed to select card: ' + err.message);
    }
    setLoading(false);
  };

  const processTurn = async () => {
    if (!gameId) return;
    
    setLoading(true);
    try {
      const response = await axios.post(`${API}/flamme-rouge/game/${gameId}/process-turn`);
      
      if (response.data.status === 'success') {
        setGameState(response.data.game_state);
      }
    } catch (err) {
      setError('Failed to process turn: ' + err.message);
    }
    setLoading(false);
  };

  const getHumanRider = () => {
    if (!gameState) return null;
    return gameState.teams[0]?.riders[0]; // First rider of first team
  };

  const getAllRiders = () => {
    if (!gameState) return [];
    return gameState.teams.flatMap(team => team.riders);
  };

  const canSelectCard = () => {
    return gameState && 
           gameState.current_phase === 'card_selection' && 
           !getHumanRider()?.played_card;
  };

  const canProcessTurn = () => {
    if (!gameState) return false;
    
    // Can process if not in card selection phase
    if (gameState.current_phase !== 'card_selection') return true;
    
    // In card selection phase, check if human rider has selected a card
    const humanRider = getHumanRider();
    return humanRider && humanRider.played_card !== null;
  };

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">🚴‍♂️ La Flamme Rouge</h1>
          <p className="text-gray-600 mb-6">
            Moteur de jeu de course cycliste avec toutes les mécaniques officielles
          </p>
          <button
            onClick={createNewGame}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Nouvelle Course'}
          </button>
          {error && (
            <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  const humanRider = getHumanRider();
  const allRiders = getAllRiders();

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto p-4">
        {/* Header */}
        <div className="bg-white p-4 rounded-lg shadow-md mb-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">🚴‍♂️ La Flamme Rouge</h1>
              <p className="text-gray-600">
                Tour {gameState.current_turn} - Phase: {gameState.current_phase}
              </p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={processTurn}
                disabled={loading || !canProcessTurn()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                Process Turn
              </button>
              <button
                onClick={createNewGame}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                New Game
              </button>
            </div>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Track */}
        <div className="bg-white p-4 rounded-lg shadow-md mb-4">
          <h2 className="text-xl font-bold mb-2">🏁 {gameState.track.name}</h2>
          <TrackComponent track={gameState.track} riders={allRiders} />
        </div>

        {/* Human player hand */}
        {humanRider && (
          <div className="bg-white p-4 rounded-lg shadow-md mb-4">
            <h2 className="text-xl font-bold mb-2">🎯 Your Hand - {humanRider.name}</h2>
            <div className="flex space-x-2 mb-4">
              {humanRider.hand.map(card => (
                <CardComponent
                  key={card.id}
                  card={card}
                  onSelect={selectCard}
                  isSelected={selectedCard?.id === card.id}
                  disabled={!canSelectCard() || loading}
                />
              ))}
            </div>
            
            {humanRider.played_card && (
              <div className="mt-4">
                <h3 className="font-semibold mb-2">Played Card:</h3>
                <CardComponent card={humanRider.played_card} disabled={true} />
              </div>
            )}
            
            <div className="mt-4 text-sm text-gray-600">
              <p>Position: {humanRider.position.track_position} (Lane {humanRider.position.lane})</p>
              <p>Fatigue Cards: {humanRider.fatigue_count}</p>
            </div>
          </div>
        )}

        {/* Game Status */}
        <div className="bg-white p-4 rounded-lg shadow-md">
          <h2 className="text-xl font-bold mb-2">📊 Game Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gameState.teams.map(team => (
              <div key={team.id} className="border border-gray-200 p-3 rounded">
                <h3 className="font-semibold text-lg">{team.name}</h3>
                {team.riders.map(rider => (
                  <div key={rider.id} className="mt-2 text-sm">
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full bg-${rider.color}-600`}></div>
                      <span className={rider.finished ? 'line-through' : ''}>{rider.name}</span>
                    </div>
                    <div className="text-xs text-gray-600 ml-5">
                      Pos: {rider.position.track_position}, Lane: {rider.position.lane}
                      {rider.finished && <span className="text-green-600 font-bold"> - FINISHED!</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Game Log */}
        {gameState.game_log.length > 0 && (
          <div className="bg-white p-4 rounded-lg shadow-md mt-4">
            <h2 className="text-xl font-bold mb-2">📝 Game Log</h2>
            <div className="max-h-40 overflow-y-auto">
              {gameState.game_log.slice(-10).map((entry, index) => (
                <div key={index} className="text-sm text-gray-700 py-1">
                  {entry}
                </div>
              ))}
            </div>
          </div>
        )}
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