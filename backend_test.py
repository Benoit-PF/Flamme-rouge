#!/usr/bin/env python3
"""
Comprehensive Backend API Test for Flamme Rouge Game Engine
Tests all API endpoints and game mechanics
"""

import requests
import sys
import json
from datetime import datetime

class FlammeRougeAPITester:
    def __init__(self, base_url="https://cd741780-b1a4-426c-9dc6-8dca753a2444.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.game_id = None
        self.game_state = None

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED: {details}")
        
        if details:
            print(f"   Details: {details}")

    def test_api_endpoint(self, method, endpoint, expected_status, data=None, params=None):
        """Generic API test method"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, params=params, timeout=10)
            
            success = response.status_code == expected_status
            response_data = {}
            
            try:
                response_data = response.json()
            except:
                response_data = {"raw_response": response.text}
            
            return success, response.status_code, response_data
            
        except requests.exceptions.RequestException as e:
            return False, 0, {"error": str(e)}

    def test_create_new_game(self):
        """Test POST /api/flamme-rouge/new-game"""
        print("\n🔍 Testing Game Creation...")
        
        team_names = ["Human Team", "AI Team 1", "AI Team 2"]
        success, status_code, response_data = self.test_api_endpoint(
            'POST', 'flamme-rouge/new-game', 200, data=team_names
        )
        
        if success and response_data.get('status') == 'success':
            self.game_id = response_data.get('game_id')
            self.game_state = response_data.get('game_state')
            
            # Validate game structure
            if self.game_state:
                teams_valid = len(self.game_state.get('teams', [])) == 3
                track_valid = 'track' in self.game_state and 'tiles' in self.game_state['track']
                phase_valid = self.game_state.get('current_phase') == 'card_selection'
                
                if teams_valid and track_valid and phase_valid:
                    self.log_test("Create New Game", True, f"Game ID: {self.game_id}")
                    return True
                else:
                    self.log_test("Create New Game", False, "Invalid game state structure")
                    return False
            else:
                self.log_test("Create New Game", False, "No game state returned")
                return False
        else:
            self.log_test("Create New Game", False, f"Status: {status_code}, Response: {response_data}")
            return False

    def test_get_game_state(self):
        """Test GET /api/flamme-rouge/game/{game_id}"""
        print("\n🔍 Testing Get Game State...")
        
        if not self.game_id:
            self.log_test("Get Game State", False, "No game ID available")
            return False
        
        success, status_code, response_data = self.test_api_endpoint(
            'GET', f'flamme-rouge/game/{self.game_id}', 200
        )
        
        if success and response_data.get('status') == 'success':
            game_state = response_data.get('game_state')
            if game_state and game_state.get('id') == self.game_id:
                self.log_test("Get Game State", True, "Game state retrieved successfully")
                return True
            else:
                self.log_test("Get Game State", False, "Invalid game state returned")
                return False
        else:
            self.log_test("Get Game State", False, f"Status: {status_code}, Response: {response_data}")
            return False

    def test_select_card(self):
        """Test POST /api/flamme-rouge/game/{game_id}/select-card"""
        print("\n🔍 Testing Card Selection...")
        
        if not self.game_id or not self.game_state:
            self.log_test("Select Card", False, "No game available")
            return False
        
        # Find human rider (first team, first rider)
        try:
            human_team = self.game_state['teams'][0]
            human_rider = human_team['riders'][0]
            rider_id = human_rider['id']
            
            # Get first card from hand
            if human_rider['hand']:
                card_id = human_rider['hand'][0]['id']
                
                success, status_code, response_data = self.test_api_endpoint(
                    'POST', f'flamme-rouge/game/{self.game_id}/select-card', 200,
                    params={'rider_id': rider_id, 'card_id': card_id}
                )
                
                if success and response_data.get('status') == 'success':
                    # Update game state
                    self.game_state = response_data.get('game_state')
                    self.log_test("Select Card", True, f"Card selected for {human_rider['name']}")
                    return True
                else:
                    self.log_test("Select Card", False, f"Status: {status_code}, Response: {response_data}")
                    return False
            else:
                self.log_test("Select Card", False, "No cards in human rider's hand")
                return False
                
        except (KeyError, IndexError) as e:
            self.log_test("Select Card", False, f"Game state structure error: {e}")
            return False

    def test_process_turn(self):
        """Test POST /api/flamme-rouge/game/{game_id}/process-turn"""
        print("\n🔍 Testing Process Turn...")
        
        if not self.game_id:
            self.log_test("Process Turn", False, "No game ID available")
            return False
        
        success, status_code, response_data = self.test_api_endpoint(
            'POST', f'flamme-rouge/game/{self.game_id}/process-turn', 200
        )
        
        if success and response_data.get('status') == 'success':
            new_game_state = response_data.get('game_state')
            if new_game_state:
                # Check if turn progressed
                old_turn = self.game_state.get('current_turn', 1) if self.game_state else 1
                new_turn = new_game_state.get('current_turn', 1)
                
                self.game_state = new_game_state
                self.log_test("Process Turn", True, f"Turn processed. Turn: {old_turn} -> {new_turn}")
                return True
            else:
                self.log_test("Process Turn", False, "No game state returned")
                return False
        else:
            self.log_test("Process Turn", False, f"Status: {status_code}, Response: {response_data}")
            return False

    def test_game_mechanics(self):
        """Test game mechanics and data integrity"""
        print("\n🔍 Testing Game Mechanics...")
        
        if not self.game_state:
            self.log_test("Game Mechanics", False, "No game state available")
            return False
        
        try:
            # Test team structure
            teams = self.game_state.get('teams', [])
            if len(teams) != 3:
                self.log_test("Team Count", False, f"Expected 3 teams, got {len(teams)}")
                return False
            
            self.log_test("Team Count", True, "3 teams created")
            
            # Test riders per team
            for i, team in enumerate(teams):
                riders = team.get('riders', [])
                if len(riders) != 2:
                    self.log_test("Riders per Team", False, f"Team {i} has {len(riders)} riders, expected 2")
                    return False
                
                # Check rider types
                if i == 0:  # Human team
                    if riders[0].get('rider_type') != 'human':
                        self.log_test("Human Rider Type", False, "First team should have human riders")
                        return False
                else:  # AI teams
                    for rider in riders:
                        if rider.get('rider_type') != 'ai_bot':
                            self.log_test("AI Rider Type", False, f"AI team has non-AI rider: {rider.get('rider_type')}")
                            return False
            
            self.log_test("Rider Configuration", True, "All teams have correct rider setup")
            
            # Test track structure
            track = self.game_state.get('track', {})
            tiles = track.get('tiles', [])
            if len(tiles) < 20:  # Should have a reasonable track length
                self.log_test("Track Length", False, f"Track too short: {len(tiles)} tiles")
                return False
            
            self.log_test("Track Structure", True, f"Track has {len(tiles)} tiles")
            
            # Test card decks
            for team in teams:
                sprinteur_deck = team.get('sprinteur_deck', [])
                rouleur_deck = team.get('rouleur_deck', [])
                
                if len(sprinteur_deck) < 5:  # Should have cards remaining
                    self.log_test("Sprinteur Deck", False, f"Sprinteur deck too small: {len(sprinteur_deck)}")
                    return False
                
                if len(rouleur_deck) < 5:
                    self.log_test("Rouleur Deck", False, f"Rouleur deck too small: {len(rouleur_deck)}")
                    return False
            
            self.log_test("Card Decks", True, "All teams have proper card decks")
            
            return True
            
        except Exception as e:
            self.log_test("Game Mechanics", False, f"Exception: {e}")
            return False

    def test_error_handling(self):
        """Test API error handling"""
        print("\n🔍 Testing Error Handling...")
        
        # Test invalid game ID
        success, status_code, response_data = self.test_api_endpoint(
            'GET', 'flamme-rouge/game/invalid-id', 404
        )
        
        if status_code == 404:
            self.log_test("Invalid Game ID", True, "Correctly returns 404")
        else:
            self.log_test("Invalid Game ID", False, f"Expected 404, got {status_code}")
        
        # Test invalid card selection
        if self.game_id:
            success, status_code, response_data = self.test_api_endpoint(
                'POST', f'flamme-rouge/game/{self.game_id}/select-card', 404,
                params={'rider_id': 'invalid-rider', 'card_id': 'invalid-card'}
            )
            
            if status_code in [404, 400]:
                self.log_test("Invalid Card Selection", True, f"Correctly returns {status_code}")
            else:
                self.log_test("Invalid Card Selection", False, f"Expected 404/400, got {status_code}")

    def run_full_test_suite(self):
        """Run complete test suite"""
        print("🚴‍♂️ FLAMME ROUGE API TEST SUITE")
        print("=" * 50)
        
        # Test sequence
        if self.test_create_new_game():
            self.test_get_game_state()
            self.test_game_mechanics()
            self.test_select_card()
            self.test_process_turn()
        
        self.test_error_handling()
        
        # Print summary
        print("\n" + "=" * 50)
        print(f"📊 TEST SUMMARY")
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        if self.game_id:
            print(f"\n🎮 Game Created: {self.game_id}")
            if self.game_state:
                print(f"Current Phase: {self.game_state.get('current_phase')}")
                print(f"Current Turn: {self.game_state.get('current_turn')}")
        
        return self.tests_passed == self.tests_run

def main():
    """Main test execution"""
    tester = FlammeRougeAPITester()
    
    try:
        success = tester.run_full_test_suite()
        return 0 if success else 1
    except Exception as e:
        print(f"❌ Test suite failed with exception: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())