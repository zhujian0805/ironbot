import pytest
import os
import tempfile
from src.services.skill_loader import SkillLoader

def test_skill_loading():
    """Test that skills can be loaded from directory."""
    # Create temporary directory with mock skill
    with tempfile.TemporaryDirectory() as temp_dir:
        skill_file = os.path.join(temp_dir, "test_skill.py")
        with open(skill_file, "w") as f:
            f.write("""
def execute_skill(query: str) -> str:
    return f"Processed: {query}"
""")

        loader = SkillLoader(temp_dir)
        skills = loader.load_skills()

        assert len(skills) == 1
        assert "test_skill" in skills
        assert callable(skills["test_skill"])