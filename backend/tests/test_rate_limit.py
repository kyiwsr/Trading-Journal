import pytest

from app.rate_limit import SlidingWindowLimiter, client_ip


class FakeClock:
    def __init__(self, now: float = 1000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def limiter(clock: FakeClock) -> SlidingWindowLimiter:
    return SlidingWindowLimiter(max_failures=3, window_seconds=60, clock=clock)


def test_allows_until_the_limit_is_reached(limiter):
    for _ in range(2):
        limiter.record_failure("a")
    assert limiter.retry_after("a") is None

    limiter.record_failure("a")
    assert limiter.retry_after("a") is not None


def test_retry_after_counts_down_to_the_oldest_failure_leaving_the_window(limiter, clock):
    limiter.record_failure("a")
    clock.now += 10
    limiter.record_failure("a")
    limiter.record_failure("a")

    assert limiter.retry_after("a") == 50
    clock.now += 20
    assert limiter.retry_after("a") == 30


def test_retry_after_rounds_up_to_whole_seconds(limiter, clock):
    for _ in range(3):
        limiter.record_failure("a")
    clock.now += 0.4
    assert limiter.retry_after("a") == 60


def test_failures_expire_after_the_window(limiter, clock):
    for _ in range(3):
        limiter.record_failure("a")
    clock.now += 60
    assert limiter.retry_after("a") is None


def test_window_slides_instead_of_resetting_all_at_once(limiter, clock):
    limiter.record_failure("a")
    clock.now += 40
    limiter.record_failure("a")
    limiter.record_failure("a")
    assert limiter.retry_after("a") is not None

    clock.now += 21
    assert limiter.retry_after("a") is None
    limiter.record_failure("a")
    assert limiter.retry_after("a") is not None


def test_reset_clears_only_that_key(limiter):
    for _ in range(3):
        limiter.record_failure("a")
        limiter.record_failure("b")
    limiter.reset("a")
    assert limiter.retry_after("a") is None
    assert limiter.retry_after("b") is not None


def test_keys_are_independent(limiter):
    for _ in range(3):
        limiter.record_failure("a")
    assert limiter.retry_after("b") is None


def test_unknown_keys_are_not_created_by_lookups(limiter):
    limiter.retry_after("never-seen")
    limiter.reset("never-seen")
    assert limiter.tracked_keys() == 0


def test_expired_keys_are_dropped_so_memory_stays_bounded(limiter, clock):
    for i in range(50):
        limiter.record_failure(f"key-{i}")
    clock.now += 61
    limiter.record_failure("fresh")
    assert limiter.tracked_keys() == 1


def test_clear_forgets_everything(limiter):
    for _ in range(3):
        limiter.record_failure("a")
    limiter.clear()
    assert limiter.retry_after("a") is None
    assert limiter.tracked_keys() == 0


def test_client_ip_ignores_forwarded_for_when_no_proxy_is_trusted():
    assert client_ip("203.0.113.9", "10.0.0.1", hops=0) == "10.0.0.1"


def test_client_ip_takes_the_entry_the_outermost_trusted_proxy_appended():
    header = "6.6.6.6, 203.0.113.9"
    assert client_ip(header, "10.0.0.1", hops=1) == "203.0.113.9"


def test_client_ip_counts_hops_from_the_right():
    header = "6.6.6.6, 203.0.113.9, 76.76.21.21"
    assert client_ip(header, "10.0.0.1", hops=2) == "203.0.113.9"


def test_client_ip_falls_back_to_the_socket_when_the_chain_is_shorter_than_the_hops():
    assert client_ip("203.0.113.9", "10.0.0.1", hops=2) == "10.0.0.1"


def test_client_ip_falls_back_to_the_socket_without_the_header():
    assert client_ip(None, "10.0.0.1", hops=1) == "10.0.0.1"
    assert client_ip("", "10.0.0.1", hops=1) == "10.0.0.1"


def test_client_ip_trims_entries_and_distrusts_a_blank_one():
    assert client_ip(" 6.6.6.6 ,  203.0.113.9 ", "10.0.0.1", hops=1) == "203.0.113.9"
    assert client_ip("6.6.6.6,,", "10.0.0.1", hops=1) == "10.0.0.1"


def test_client_ip_without_a_socket_address_is_unknown():
    assert client_ip(None, None, hops=0) == "unknown"
