from abc import ABC, abstractmethod
from typing import List, Optional

from pydantic import BaseModel


class Signal(BaseModel):
    title: str
    body: str
    score: float  # 0.0 to 1.0
    source_url: Optional[str] = None
    metadata: dict = {}


class BaseModule(ABC):
    module_id: str
    display_name: str
    description: str
    cluster: str  # "b2b-intelligence" | "consumer-data" | "health" | "sports"
    config_schema: dict  # JSON Schema
    default_schedule: str
    required_plan: str  # "free" | "pro" | "team"

    @abstractmethod
    async def run(self, config: dict, db_session) -> List[Signal]:
        pass

    @abstractmethod
    def validate_config(self, config: dict) -> bool:
        pass

    def get_ui_component_hint(self) -> str:
        return "signal-feed"
