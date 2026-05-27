import importlib
import logging
import os
import pkgutil
from typing import Dict, List, Optional

from app.core.base_module import BaseModule

logger = logging.getLogger(__name__)


class ModuleRegistry:
    def __init__(self):
        self._registry: Dict[str, BaseModule] = {}

    def discover(self) -> None:
        """Auto-discover and import all modules in app/modules/."""
        modules_dir = os.path.join(os.path.dirname(__file__), "..", "modules")
        modules_dir = os.path.abspath(modules_dir)

        for importer, module_name, is_pkg in pkgutil.iter_modules([modules_dir]):
            if module_name.startswith("_"):
                continue
            full_module_name = f"app.modules.{module_name}"
            try:
                mod = importlib.import_module(full_module_name)
                # Find all BaseModule subclasses defined in this file
                for attr_name in dir(mod):
                    attr = getattr(mod, attr_name)
                    if (
                        isinstance(attr, type)
                        and issubclass(attr, BaseModule)
                        and attr is not BaseModule
                        and hasattr(attr, "module_id")
                    ):
                        try:
                            instance = attr()
                            self._registry[instance.module_id] = instance
                            logger.info(f"Registered module: {instance.module_id}")
                        except Exception as e:
                            logger.error(f"Failed to instantiate module {attr_name}: {e}")
            except Exception as e:
                logger.error(f"Failed to import module {full_module_name}: {e}")

    def register(self, module: BaseModule) -> None:
        self._registry[module.module_id] = module

    def get_module(self, module_id: str) -> Optional[BaseModule]:
        return self._registry.get(module_id)

    def list_modules(self) -> List[BaseModule]:
        return list(self._registry.values())

    def __contains__(self, module_id: str) -> bool:
        return module_id in self._registry


module_registry = ModuleRegistry()
