from app.core.rate_limit import SlidingWindowLimiter


def test_sliding_window_limiter_rejects_only_after_limit_and_recovers():
    limiter = SlidingWindowLimiter()

    assert limiter.allow("login:ip", limit=2, window_seconds=60, now=100) is True
    assert limiter.allow("login:ip", limit=2, window_seconds=60, now=101) is True
    assert limiter.allow("login:ip", limit=2, window_seconds=60, now=102) is False
    assert limiter.allow("login:ip", limit=2, window_seconds=60, now=161) is True


def test_rate_limit_keys_are_isolated():
    limiter = SlidingWindowLimiter()

    assert limiter.allow("login:one", limit=1, window_seconds=60, now=100) is True
    assert limiter.allow("login:one", limit=1, window_seconds=60, now=101) is False
    assert limiter.allow("login:two", limit=1, window_seconds=60, now=101) is True
