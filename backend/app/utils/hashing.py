import hashlib


def hash_content(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()


def is_duplicate_signal(title: str, body: str, module_id: str) -> str:
    """Returns a dedup hash for the signal. Check this against existing signals."""
    return hash_content(f"{module_id}:{title}:{body[:200]}")
