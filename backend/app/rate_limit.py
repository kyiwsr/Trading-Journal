import math
import threading
import time
from collections import deque
from collections.abc import Callable

from app.config import settings


class SlidingWindowLimiter:
    """Counts failures per key inside a sliding window.

    State lives in this process, so it resets on restart and is not shared between instances.
    """

    def __init__(
        self,
        max_failures: int,
        window_seconds: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._clock = clock
        self._failures: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def retry_after(self, key: str) -> int | None:
        """Whole seconds until the key may try again, or None when it is not blocked."""
        with self._lock:
            now = self._clock()
            failures = self._live(key, now)
            if failures is None or len(failures) < self.max_failures:
                return None
            freeing = failures[len(failures) - self.max_failures]
            return math.ceil(freeing + self.window_seconds - now)

    def record_failure(self, key: str) -> None:
        with self._lock:
            now = self._clock()
            self._drop_expired(now)
            self._failures.setdefault(key, deque()).append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._failures.clear()

    def tracked_keys(self) -> int:
        with self._lock:
            return len(self._failures)

    def _live(self, key: str, now: float) -> deque[float] | None:
        failures = self._failures.get(key)
        if failures is None:
            return None
        self._trim(failures, now)
        if not failures:
            del self._failures[key]
            return None
        return failures

    def _trim(self, failures: deque[float], now: float) -> None:
        while failures and failures[0] <= now - self.window_seconds:
            failures.popleft()

    def _drop_expired(self, now: float) -> None:
        for key in list(self._failures):
            self._live(key, now)


def client_ip(forwarded_for: str | None, socket_host: str | None, hops: int) -> str:
    """The address the outermost trusted proxy saw.

    Entries are counted from the right because a client can put anything at the left of X-Forwarded-For;
    only what our own proxies appended can be trusted.
    """
    fallback = socket_host or "unknown"
    if hops <= 0 or not forwarded_for:
        return fallback
    chain = [entry.strip() for entry in forwarded_for.split(",")]
    if len(chain) < hops:
        return fallback
    return chain[-hops] or fallback


login_limiter = SlidingWindowLimiter(settings.login_max_failures, settings.login_window_seconds)
