from unittest.mock import Mock

import pytest
from sqlalchemy.pool import QueuePool

from backend.app.services.dashboard_postgres import DashboardPostgres


def database(driver):
    value = DashboardPostgres()
    value._pool = QueuePool(lambda: driver, pool_size=1, max_overflow=0)
    return value


def test_real_pool_proxy_sets_driver_autocommit_and_restores_after_commit():
    driver = Mock(autocommit=True)
    db = database(driver)
    with db.transaction() as connection:
        assert connection.driver_connection is driver
        assert driver.autocommit is False
    driver.commit.assert_called_once()
    assert driver.autocommit is True
    with db.connection() as connection:
        assert connection.driver_connection is driver
        assert driver.autocommit is True


def test_domain_exception_rolls_back_and_reuses_healthy_connection():
    driver = Mock(autocommit=True)
    db = database(driver)
    with pytest.raises(ValueError, match="reject"):
        with db.transaction():
            raise ValueError("reject")
    assert driver.rollback.called
    driver.commit.assert_not_called()
    driver.close.assert_not_called()
    assert driver.autocommit is True
    with db.connection() as connection:
        assert connection.driver_connection is driver


@pytest.mark.parametrize("failure", ["commit", "rollback"])
def test_driver_failure_invalidates_checkout(failure):
    driver = Mock(autocommit=True)
    getattr(driver, failure).side_effect = RuntimeError("driver failure")
    db = database(driver)
    with pytest.raises((RuntimeError, ValueError)):
        with db.transaction():
            if failure == "rollback":
                raise ValueError("domain failure")
    driver.close.assert_called_once()
    assert db._pool.checkedout() == 0


def test_autocommit_reset_failure_invalidates():
    class Driver:
        def __init__(self):
            self.value, self.closed = True, False

        @property
        def autocommit(self):
            return self.value

        @autocommit.setter
        def autocommit(self, value):
            if value:
                raise RuntimeError("reset failed")
            self.value = value

        def commit(self):
            pass

        def rollback(self):
            pass

        def close(self):
            self.closed = True

    driver = Driver()
    db = database(driver)
    with pytest.raises(RuntimeError, match="reset failed"):
        with db.transaction():
            pass
    assert driver.closed
    assert db._pool.checkedout() == 0
