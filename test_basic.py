#!/usr/bin/env python3
"""Simple test script to verify basic bot functionality."""

import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

def test_imports():
    """Test that all modules can be imported."""
    try:
        from src.models.message import Message
        from src.models.user import User
        from src.models.skill import Skill
        print("[PASS] All model imports successful")
        return True
    except ImportError as e:
        print(f"[FAIL] Import error: {e}")
        return False

def test_message_creation():
    """Test creating a message object."""
    try:
        from src.models.message import Message
        from datetime import datetime

        msg = Message(
            id="test123",
            content="Hello bot",
            timestamp=datetime.now(),
            user_id="U123",
            channel_id="C456"
        )
        print(f"[PASS] Message creation successful: {msg.content}")
        return True
    except Exception as e:
        print(f"[FAIL] Message creation failed: {e}")
        return False

def test_skill_loading():
    """Test skill loader functionality."""
    try:
        from src.services.skill_loader import SkillLoader

        loader = SkillLoader("./skills")
        skills = loader.load_skills()
        print(f"[PASS] Skill loading successful: {len(skills)} skills loaded")
        return True
    except Exception as e:
        print(f"[FAIL] Skill loading failed: {e}")
        return False

if __name__ == "__main__":
    print("Testing ironbot basic functionality...")
    print()

    results = []
    results.append(test_imports())
    results.append(test_message_creation())
    results.append(test_skill_loading())

    print()
    passed = sum(results)
    total = len(results)
    print(f"Tests passed: {passed}/{total}")

    if passed == total:
        print("SUCCESS: All basic tests passed!")
        sys.exit(0)
    else:
        print("FAILURE: Some tests failed")
        sys.exit(1)