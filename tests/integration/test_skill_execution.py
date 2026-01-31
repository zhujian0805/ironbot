import pytest
import os
import tempfile
from src.services.skill_loader import SkillLoader

def test_skill_execution():
    """Test that loaded skills can be executed."""
    with tempfile.TemporaryDirectory() as temp_dir:
        skill_file = os.path.join(temp_dir, "echo_skill.py")
        with open(skill_file, "w") as f:
            f.write("""
def execute_skill(query: str) -> str:
    return f"Echo: {query}"
""")

        loader = SkillLoader(temp_dir)
        skills = loader.load_skills()

        result = skills["echo_skill"]("hello")
        assert result == "Echo: hello"