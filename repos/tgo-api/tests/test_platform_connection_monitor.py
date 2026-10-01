from app.tasks.platform_connection_monitor import runtime_config_requires_activation


def test_matching_runtime_version_does_not_reactivate():
    assert runtime_config_requires_activation({"config_version": 7}, 7) is False


def test_real_runtime_version_mismatch_reactivates():
    assert runtime_config_requires_activation({"config_version": 6}, 7) is True


def test_fresh_gateway_reactivates_once_after_restart():
    assert runtime_config_requires_activation({"config_version": 0}, 7) is True
