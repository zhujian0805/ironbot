import os
import importlib.util
from typing import Dict, Callable
from ..models.skill import Skill
from ..utils.logging import logger
from .permission_manager import get_permission_manager


class SkillLoader:
    """Loads and manages Claude Skills from a directory."""

    def __init__(self, skills_dir: str):
        self.skills_dir = skills_dir
        self.skills: Dict[str, Callable] = {}

    def load_skills(self) -> Dict[str, Callable]:
        """Load all valid skills from the skills directory."""
        logger.debug(f"Loading skills from directory: {self.skills_dir}")

        if not os.path.exists(self.skills_dir):
            logger.warning(f"Skills directory {self.skills_dir} does not exist")
            return {}

        logger.debug(f"Scanning directory for Python files")
        skill_files = [f for f in os.listdir(self.skills_dir)
                      if f.endswith('.py') and not f.startswith('_')]
        logger.debug(f"Found {len(skill_files)} potential skill files: {skill_files}")

        for filename in skill_files:
            skill_name = filename[:-3]  # Remove .py
            skill_path = os.path.join(self.skills_dir, filename)

            logger.debug(f"Attempting to load skill: {skill_name} from {skill_path}")

            try:
                # Load the module
                logger.debug(f"Creating module spec for {skill_name}")
                spec = importlib.util.spec_from_file_location(skill_name, skill_path)

                if spec and spec.loader:
                    logger.debug(f"Executing module {skill_name}")
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)

                    # Check for execute_skill function
                    logger.debug(f"Checking for execute_skill function in {skill_name}")
                    if hasattr(module, 'execute_skill'):
                        if callable(getattr(module, 'execute_skill')):
                            # Check if skill is allowed by permission manager
                            permission_manager = get_permission_manager()
                            if permission_manager and not permission_manager.is_skill_allowed(skill_name):
                                logger.info(f"Skill {skill_name} blocked by permission config")
                                continue

                            self.skills[skill_name] = module.execute_skill
                            logger.info(f"Loaded skill: {skill_name}")
                            logger.debug(f"Skill {skill_name} validation successful")
                        else:
                            logger.warning(f"Skill {skill_name} execute_skill is not callable")
                    else:
                        logger.warning(f"Skill {skill_name} missing execute_skill function")
                        logger.debug(f"Available attributes in {skill_name}: {dir(module)}")

                else:
                    logger.warning(f"Could not create spec for skill {skill_name}")

            except Exception as e:
                logger.error(f"Error loading skill {skill_name}: {e}")
                logger.debug(f"Skill loading failed for {skill_path}", exc_info=True)

        logger.debug(f"Skill loading complete. Loaded {len(self.skills)} skills: {list(self.skills.keys())}")
        return self.skills