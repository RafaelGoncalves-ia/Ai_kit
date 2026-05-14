try:
    from .nodes import NODE_CLASS_MAPPINGS
except ImportError:
    NODE_CLASS_MAPPINGS = {}

NODE_DISPLAY_NAME_MAPPINGS = {
    key: getattr(value, "TITLE", key)
    for key, value in NODE_CLASS_MAPPINGS.items()
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
