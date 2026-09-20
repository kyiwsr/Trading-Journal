from typing import Protocol


class Storage(Protocol):
    def signed_read_url(self, path: str) -> str | None: ...


class NullStorage:
    """Stand-in until Supabase Storage is configured: screenshots simply have no readable URL."""

    def signed_read_url(self, path: str) -> str | None:
        return None


def get_storage() -> Storage:
    return NullStorage()
