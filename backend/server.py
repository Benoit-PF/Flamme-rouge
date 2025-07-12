from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Tuple, Literal
import uuid
from datetime import datetime
import random
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Game Models
class CardType(str, Enum):
    SPRINTEUR = "sprinteur"
    ROULEUR = "rouleur"
    FATIGUE = "fatigue"

class TerrainType(str, Enum):
    NORMAL = "normal"
    COBBLESTONE = "cobblestone"
    MOUNTAIN = "mountain"
    DOWNHILL = "downhill"
    FINISH = "finish"
    START = "start"

class WeatherType(str, Enum):
    NONE = "none"
    HEADWIND = "headwind"
    TAILWIND = "tailwind"
    CROSSWIND = "crosswind"

class RiderType(str, Enum):
    HUMAN = "human"
    AI_BOT = "ai_bot"

class GamePhase(str, Enum):
    CARD_SELECTION = "card_selection"
    MOVEMENT = "movement"
    SLIPSTREAM = "slipstream"
    FATIGUE = "fatigue"
    GAME_OVER = "game_over"

class Card(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: CardType
    value: int
    description: Optional[str] = None

class TrackTile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    position: int  # Track position (0-based)
    terrain: TerrainType = TerrainType.NORMAL
    lanes: int = 2  # Usually 2, can be 1 for narrow sections
    weather: WeatherType = WeatherType.NONE
    
class Position(BaseModel):
    track_position: int
    lane: int  # 0 or 1 for left/right lane
    
class Rider(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: str
    team_id: str
    rider_type: RiderType
    position: Position
    hand: List[Card] = []
    played_card: Optional[Card] = None
    fatigue_count: int = 0
    finished: bool = False
    finish_position: Optional[int] = None

class Team(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    riders: List[Rider] = []
    sprinteur_deck: List[Card] = []
    rouleur_deck: List[Card] = []
    fatigue_deck: List[Card] = []
    sprinteur_discard: List[Card] = []
    rouleur_discard: List[Card] = []

class Track(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    tiles: List[TrackTile] = []
    length: int

class GameState(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    teams: List[Team] = []
    track: Track
    current_turn: int = 1
    current_phase: GamePhase = GamePhase.CARD_SELECTION
    active_team_index: int = 0
    weather: WeatherType = WeatherType.NONE
    finished_riders: List[str] = []  # Rider IDs in order of finish
    game_log: List[str] = []

# Game Logic Class
class FlammeRougeEngine:
    def __init__(self):
        pass
    
    @staticmethod
    def create_default_sprinteur_deck() -> List[Card]:
        """Create standard Sprinteur deck: 2,2,2,3,3,3,4,4,5,9"""
        deck = []
        values = [2,2,2,3,3,3,4,4,5,9]
        for value in values:
            deck.append(Card(type=CardType.SPRINTEUR, value=value, description=f"Sprinteur {value}"))
        return deck
    
    @staticmethod
    def create_default_rouleur_deck() -> List[Card]:
        """Create standard Rouleur deck: 3,3,3,4,4,4,5,5,6,7"""
        deck = []
        values = [3,3,3,4,4,4,5,5,6,7]
        for value in values:
            deck.append(Card(type=CardType.ROULEUR, value=value, description=f"Rouleur {value}"))
        return deck
    
    @staticmethod
    def create_fatigue_deck() -> List[Card]:
        """Create fatigue deck: multiple 2-value fatigue cards"""
        deck = []
        for i in range(20):  # Plenty of fatigue cards
            deck.append(Card(type=CardType.FATIGUE, value=2, description="Fatigue"))
        return deck
    
    @staticmethod
    def create_sample_track() -> Track:
        """Create 'The Peaks' inspired track"""
        tiles = []
        # Start area (positions 0-2)
        for i in range(3):
            tiles.append(TrackTile(position=i, terrain=TerrainType.START, lanes=2))
        
        # Flat section (positions 3-8)
        for i in range(3, 9):
            tiles.append(TrackTile(position=i, terrain=TerrainType.NORMAL, lanes=2))
        
        # Mountain climb (positions 9-15)
        for i in range(9, 16):
            tiles.append(TrackTile(position=i, terrain=TerrainType.MOUNTAIN, lanes=2))
        
        # Downhill (positions 16-20)
        for i in range(16, 21):
            tiles.append(TrackTile(position=i, terrain=TerrainType.DOWNHILL, lanes=2))
        
        # Final sprint with cobblestones (positions 21-25)
        for i in range(21, 26):
            terrain = TerrainType.COBBLESTONE if i in [23, 24] else TerrainType.NORMAL
            tiles.append(TrackTile(position=i, terrain=terrain, lanes=2))
        
        # Finish line (position 26)
        tiles.append(TrackTile(position=26, terrain=TerrainType.FINISH, lanes=2))
        
        return Track(name="The Peaks", tiles=tiles, length=27)
    
    @staticmethod
    def shuffle_deck(deck: List[Card]) -> List[Card]:
        """Shuffle a deck of cards"""
        shuffled = deck.copy()
        random.shuffle(shuffled)
        return shuffled
    
    @staticmethod
    def draw_cards(team: Team, rider: Rider, count: int = 4):
        """Draw cards for a rider (2 sprinteur + 2 rouleur by default)"""
        rider.hand = []
        
        # Draw 2 sprinteur cards
        for _ in range(2):
            if team.sprinteur_deck:
                card = team.sprinteur_deck.pop()
                rider.hand.append(card)
            elif team.sprinteur_discard:
                # Reshuffle discard if deck empty
                team.sprinteur_deck = FlammeRougeEngine.shuffle_deck(team.sprinteur_discard)
                team.sprinteur_discard = []
                if team.sprinteur_deck:
                    card = team.sprinteur_deck.pop()
                    rider.hand.append(card)
        
        # Draw 2 rouleur cards  
        for _ in range(2):
            if team.rouleur_deck:
                card = team.rouleur_deck.pop()
                rider.hand.append(card)
            elif team.rouleur_discard:
                # Reshuffle discard if deck empty
                team.rouleur_deck = FlammeRougeEngine.shuffle_deck(team.rouleur_discard)
                team.rouleur_discard = []
                if team.rouleur_deck:
                    card = team.rouleur_deck.pop()
                    rider.hand.append(card)
    
    @staticmethod
    def calculate_movement(card: Card, track_tile: TrackTile, weather: WeatherType) -> int:
        """Calculate actual movement considering terrain and weather"""
        base_movement = card.value
        
        # Terrain effects
        if track_tile.terrain == TerrainType.MOUNTAIN:
            # Mountains: reduce movement for high values
            if base_movement >= 5:
                base_movement = max(base_movement - 2, 1)
        elif track_tile.terrain == TerrainType.DOWNHILL:
            # Downhills: bonus movement
            base_movement += 1
        elif track_tile.terrain == TerrainType.COBBLESTONE:
            # Cobblestones: slightly reduce movement
            base_movement = max(base_movement - 1, 1)
        
        # Weather effects
        if weather == WeatherType.HEADWIND:
            base_movement = max(base_movement - 1, 1)
        elif weather == WeatherType.TAILWIND:
            base_movement += 1
        elif weather == WeatherType.CROSSWIND:
            # Crosswind: randomize lanes more
            pass
        
        return base_movement
    
    @staticmethod
    def get_riders_at_position(track_position: int, all_riders: List[Rider]) -> List[Rider]:
        """Get all riders at a specific track position"""
        return [r for r in all_riders if r.position.track_position == track_position and not r.finished]
    
    @staticmethod
    def check_slipstream(rider: Rider, all_riders: List[Rider]) -> bool:
        """Check if rider is in slipstream (directly behind another rider)"""
        # Check if there's a rider directly in front
        riders_in_front = [r for r in all_riders 
                          if r.position.track_position == rider.position.track_position + 1 
                          and not r.finished]
        return len(riders_in_front) > 0
    
    @staticmethod
    def move_rider(rider: Rider, movement: int, track: Track, all_riders: List[Rider]) -> List[str]:
        """Move a rider and handle collisions/blocking"""
        log = []
        current_pos = rider.position.track_position
        target_pos = min(current_pos + movement, track.length - 1)
        
        # Check for available lanes at target position
        for pos in range(current_pos + 1, target_pos + 1):
            riders_at_pos = FlammeRougeEngine.get_riders_at_position(pos, all_riders)
            
            if len(riders_at_pos) >= track.tiles[pos].lanes:
                # Position blocked, stop here
                target_pos = pos - 1
                log.append(f"{rider.name} blocked at position {pos}")
                break
        
        # Find available lane at target position
        riders_at_target = FlammeRougeEngine.get_riders_at_position(target_pos, all_riders)
        available_lanes = []
        for lane in range(track.tiles[target_pos].lanes):
            if not any(r.position.lane == lane for r in riders_at_target):
                available_lanes.append(lane)
        
        if available_lanes:
            rider.position.track_position = target_pos
            rider.position.lane = random.choice(available_lanes)
            log.append(f"{rider.name} moves to position {target_pos}, lane {rider.position.lane}")
        else:
            log.append(f"{rider.name} cannot move, no available lanes")
        
        # Check if finished
        if rider.position.track_position >= track.length - 1:
            rider.finished = True
            log.append(f"{rider.name} finished the race!")
        
        return log
    
    @staticmethod
    def ai_select_card(rider: Rider, track: Track, all_riders: List[Rider]) -> Card:
        """Simple AI card selection logic"""
        if not rider.hand:
            return None
        
        current_pos = rider.position.track_position
        distance_to_finish = track.length - current_pos
        
        # Simple strategy: 
        # - Use high cards when far from finish
        # - Use medium cards in mountains  
        # - Use low cards when close to finish
        
        if distance_to_finish > 15:
            # Far from finish: prefer higher cards
            best_card = max(rider.hand, key=lambda c: c.value)
        elif current_pos < track.length and track.tiles[current_pos].terrain == TerrainType.MOUNTAIN:
            # In mountains: prefer medium cards
            medium_cards = [c for c in rider.hand if 3 <= c.value <= 5]
            best_card = medium_cards[0] if medium_cards else min(rider.hand, key=lambda c: c.value)
        else:
            # Default: pick middle value card
            sorted_hand = sorted(rider.hand, key=lambda c: c.value)
            best_card = sorted_hand[len(sorted_hand) // 2]
        
        return best_card

# Game Management Functions
def create_new_game(team_names: List[str], track_name: str = "The Peaks") -> GameState:
    """Create a new game with specified teams"""
    engine = FlammeRougeEngine()
    
    # Create track
    track = engine.create_sample_track()
    
    # Create teams
    teams = []
    colors = ["red", "blue", "green", "yellow", "purple", "orange"]
    
    for i, team_name in enumerate(team_names):
        team = Team(name=team_name)
        
        # Create riders for team (2 riders per team)
        rider_names = [f"{team_name} Sprinteur", f"{team_name} Rouleur"] 
        for j, rider_name in enumerate(rider_names):
            rider = Rider(
                name=rider_name,
                color=colors[i % len(colors)],
                team_id=team.id,
                rider_type=RiderType.HUMAN if i == 0 else RiderType.AI_BOT,  # First team human, others AI
                position=Position(track_position=0, lane=j % 2)  # Start in different lanes
            )
            team.riders.append(rider)
        
        # Create decks
        team.sprinteur_deck = engine.shuffle_deck(engine.create_default_sprinteur_deck())
        team.rouleur_deck = engine.shuffle_deck(engine.create_default_rouleur_deck())
        team.fatigue_deck = engine.create_fatigue_deck()
        
        # Draw initial hands
        for rider in team.riders:
            engine.draw_cards(team, rider)
        
        teams.append(team)
    
    game_state = GameState(
        teams=teams,
        track=track,
        current_turn=1,
        current_phase=GamePhase.CARD_SELECTION
    )
    
    return game_state

# API Endpoints
@api_router.post("/flamme-rouge/new-game")
async def create_game(team_names: List[str] = ["Human Team", "AI Team 1", "AI Team 2"]):
    """Create a new Flamme Rouge game"""
    try:
        game_state = create_new_game(team_names)
        
        # Save to database
        await db.flamme_rouge_games.insert_one(game_state.dict())
        
        return {
            "status": "success",
            "game_id": game_state.id,
            "game_state": game_state
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/flamme-rouge/game/{game_id}")
async def get_game(game_id: str):
    """Get current game state"""
    try:
        game_doc = await db.flamme_rouge_games.find_one({"id": game_id})
        if not game_doc:
            raise HTTPException(status_code=404, detail="Game not found")
        
        # Remove MongoDB ObjectId for JSON serialization
        if "_id" in game_doc:
            del game_doc["_id"]
        
        return {"status": "success", "game_state": game_doc}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/flamme-rouge/game/{game_id}/select-card")
async def select_card(game_id: str, rider_id: str, card_id: str):
    """Select a card for a rider"""
    try:
        game_doc = await db.flamme_rouge_games.find_one({"id": game_id})
        if not game_doc:
            raise HTTPException(status_code=404, detail="Game not found")
        
        game_state = GameState(**game_doc)
        
        if game_state.current_phase != GamePhase.CARD_SELECTION:
            raise HTTPException(status_code=400, detail="Not in card selection phase")
        
        # Find rider and card
        rider = None
        team = None
        for t in game_state.teams:
            for r in t.riders:
                if r.id == rider_id:
                    rider = r
                    team = t
                    break
        
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        
        # Find and play card
        card = None
        for c in rider.hand:
            if c.id == card_id:
                card = c
                break
        
        if not card:
            raise HTTPException(status_code=404, detail="Card not found in hand")
        
        # Remove card from hand and set as played
        rider.hand.remove(card)
        rider.played_card = card
        
        # Add to appropriate discard pile
        if card.type == CardType.SPRINTEUR:
            team.sprinteur_discard.append(card)
        elif card.type == CardType.ROULEUR:
            team.rouleur_discard.append(card)
        
        game_state.game_log.append(f"{rider.name} played {card.type} {card.value}")
        
        # Check if all riders have selected cards
        all_selected = all(r.played_card is not None for team in game_state.teams for r in team.riders if not r.finished)
        
        if all_selected:
            game_state.current_phase = GamePhase.MOVEMENT
        
        # Update database
        await db.flamme_rouge_games.update_one(
            {"id": game_id},
            {"$set": game_state.dict()}
        )
        
        return {"status": "success", "game_state": game_state}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/flamme-rouge/game/{game_id}/process-turn")
async def process_turn(game_id: str):
    """Process movement, slipstream, and fatigue phases"""
    try:
        game_doc = await db.flamme_rouge_games.find_one({"id": game_id})
        if not game_doc:
            raise HTTPException(status_code=404, detail="Game not found")
        
        game_state = GameState(**game_doc)
        engine = FlammeRougeEngine()
        
        # Auto-select cards for AI riders
        for team in game_state.teams:
            for rider in team.riders:
                if rider.rider_type == RiderType.AI_BOT and not rider.played_card and not rider.finished:
                    card = engine.ai_select_card(rider, game_state.track, 
                                               [r for t in game_state.teams for r in t.riders])
                    if card:
                        rider.hand.remove(card)
                        rider.played_card = card
                        if card.type == CardType.SPRINTEUR:
                            team.sprinteur_discard.append(card)
                        elif card.type == CardType.ROULEUR:
                            team.rouleur_discard.append(card)
                        game_state.game_log.append(f"{rider.name} (AI) played {card.type} {card.value}")
        
        # Movement phase
        if game_state.current_phase == GamePhase.MOVEMENT:
            all_riders = [r for team in game_state.teams for r in team.riders if not r.finished]
            
            # Sort by initiative (card value descending, then random)
            def get_initiative(rider):
                return (rider.played_card.value if rider.played_card else 0, random.random())
            
            all_riders.sort(key=get_initiative, reverse=True)
            
            for rider in all_riders:
                if rider.played_card:
                    current_tile = game_state.track.tiles[rider.position.track_position]
                    movement = engine.calculate_movement(rider.played_card, current_tile, game_state.weather)
                    log = engine.move_rider(rider, movement, game_state.track, all_riders)
                    game_state.game_log.extend(log)
            
            game_state.current_phase = GamePhase.SLIPSTREAM
        
        # Slipstream phase
        if game_state.current_phase == GamePhase.SLIPSTREAM:
            all_riders = [r for team in game_state.teams for r in team.riders if not r.finished]
            
            for rider in all_riders:
                # Check slipstream and move forward if applicable
                riders_in_front = [r for r in all_riders 
                                 if r.position.track_position == rider.position.track_position + 1]
                
                if riders_in_front:
                    # Move to slipstream position
                    target_pos = rider.position.track_position + 1
                    riders_at_target = engine.get_riders_at_position(target_pos, all_riders)
                    
                    if len(riders_at_target) < game_state.track.tiles[target_pos].lanes:
                        available_lanes = []
                        for lane in range(game_state.track.tiles[target_pos].lanes):
                            if not any(r.position.lane == lane for r in riders_at_target):
                                available_lanes.append(lane)
                        
                        if available_lanes:
                            rider.position.track_position = target_pos
                            rider.position.lane = random.choice(available_lanes)
                            game_state.game_log.append(f"{rider.name} slipstreams forward")
            
            game_state.current_phase = GamePhase.FATIGUE
        
        # Fatigue phase
        if game_state.current_phase == GamePhase.FATIGUE:
            all_riders = [r for team in game_state.teams for r in team.riders if not r.finished]
            
            for team in game_state.teams:
                for rider in team.riders:
                    if not rider.finished:
                        # Check if rider gets fatigue (not in slipstream)
                        in_slipstream = engine.check_slipstream(rider, all_riders)
                        
                        if not in_slipstream and team.fatigue_deck:
                            fatigue_card = team.fatigue_deck.pop()
                            rider.hand.append(fatigue_card)
                            rider.fatigue_count += 1
                            game_state.game_log.append(f"{rider.name} receives fatigue card")
                        
                        # Clear played card
                        rider.played_card = None
                        
                        # Draw new cards
                        engine.draw_cards(team, rider)
            
            # Check win condition
            finished_riders = [r for team in game_state.teams for r in team.riders if r.finished]
            if finished_riders:
                game_state.current_phase = GamePhase.GAME_OVER
                for i, rider in enumerate(finished_riders):
                    if rider.finish_position is None:
                        rider.finish_position = i + 1
                        game_state.finished_riders.append(rider.id)
            else:
                game_state.current_phase = GamePhase.CARD_SELECTION
                game_state.current_turn += 1
        
        # Update database
        await db.flamme_rouge_games.update_one(
            {"id": game_id},
            {"$set": game_state.dict()}
        )
        
        return {"status": "success", "game_state": game_state}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()