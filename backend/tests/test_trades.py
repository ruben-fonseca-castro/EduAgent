"""Tests for trade logic (unit-level, no DB dependency)."""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.lmsr import prices, quote, execute


class TestTradeQuoting:
    """Test trade quote generation."""

    def test_buy_quote_positive_cost(self):
        """Buying shares should have a positive cost."""
        q = [0.0, 0.0]
        b = 100.0
        cost_diff, _, _ = quote(q, b, 0, 10.0)
        assert cost_diff > 0

    def test_sell_quote_negative_cost(self):
        """Selling shares should have a negative cost (payout)."""
        q = [50.0, 0.0]  # Already have shares in the system
        b = 100.0
        cost_diff, _, _ = quote(q, b, 0, -10.0)
        assert cost_diff < 0

    def test_quote_preserves_price_sum(self):
        """New prices after a quote should sum to 1."""
        q = [0.0, 0.0]
        b = 100.0
        _, _, new_p = quote(q, b, 0, 25.0)
        assert abs(sum(new_p) - 1.0) < 1e-9

    def test_round_trip_trade(self):
        """Buy then sell same amount should approximately return to initial state."""
        q = [0.0, 0.0]
        b = 100.0

        # Buy
        buy_cost, q_after_buy, _ = quote(q, b, 0, 20.0)

        # Sell same amount
        sell_cost, q_after_sell, final_p = quote(q_after_buy, b, 0, -20.0)

        # q should return to original
        for i in range(len(q)):
            assert abs(q_after_sell[i] - q[i]) < 1e-9

        # Net cost should be close to 0 (but not exactly due to spread)
        # Actually with LMSR, round-trip cost should be exactly 0 since cost is path-independent
        assert abs(buy_cost + sell_cost) < 1e-9


class TestTradeExecution:
    """Test trade execution audit data."""

    def test_execute_produces_full_audit(self):
        """Execute should produce complete before/after data."""
        q = [0.0, 0.0]
        b = 100.0
        result = execute(q, b, 0, 10.0)

        assert len(result["before_q"]) == 2
        assert len(result["after_q"]) == 2
        assert len(result["before_prices"]) == 2
        assert len(result["after_prices"]) == 2
        assert result["cost"] > 0

    def test_execute_q_vector_updated(self):
        """After execution, only the traded outcome's q should change."""
        q = [0.0, 0.0, 0.0]
        b = 100.0
        result = execute(q, b, 1, 15.0)

        # Outcome 0 and 2 should stay at 0
        assert result["after_q"][0] == 0.0
        assert result["after_q"][2] == 0.0
        # Outcome 1 should increase by 15
        assert result["after_q"][1] == 15.0


class TestRiskCalculations:
    """Test risk and position limit calculations."""

    def test_max_loss_bounded(self):
        """Max loss should be bounded."""
        from app.lmsr import max_loss_for_position
        loss = max_loss_for_position(100.0, 2)
        assert loss == 100.0

    def test_fifty_percent_risk_cap_logic(self):
        """Test the 50% risk cap calculation."""
        total_coins = 1000.0
        max_risk_pct = 0.5

        max_investable = total_coins * max_risk_pct
        assert max_investable == 500.0

        # If already invested 400, can invest 100 more
        current_invested = 400.0
        remaining = max_investable - current_invested
        assert remaining == 100.0

        # If try to invest 150, should fail
        proposed = 150.0
        assert current_invested + proposed > max_investable


class TestPriceImpact:
    """Test price impact characteristics."""

    def test_small_trade_small_impact(self):
        """Small trades should have proportionally small price impact."""
        q = [0.0, 0.0]
        b = 100.0

        _, _, p_small = quote(q, b, 0, 1.0)
        _, _, p_large = quote(q, b, 0, 50.0)

        # Small trade: price change should be small
        assert abs(p_small[0] - 0.5) < 0.02
        # Large trade: price change should be significant
        assert abs(p_large[0] - 0.5) > 0.1

    def test_symmetric_trades(self):
        """Buying X shares of outcome A should have same cost as buying X of outcome B at initial state."""
        q = [0.0, 0.0]
        b = 100.0

        cost_a, _, _ = quote(q, b, 0, 20.0)
        cost_b, _, _ = quote(q, b, 1, 20.0)

        assert abs(cost_a - cost_b) < 1e-9
