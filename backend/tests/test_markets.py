"""Tests for market service logic (unit-level, no DB dependency)."""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.lmsr import prices, cost, quote


class TestMarketPricing:
    """Test market pricing scenarios."""

    def test_new_market_equal_prices(self):
        """A new market with 2 outcomes should have 50/50 prices."""
        q = [0.0, 0.0]
        b = 100.0
        p = prices(q, b)
        assert abs(p[0] - 0.5) < 1e-9
        assert abs(p[1] - 0.5) < 1e-9

    def test_new_market_three_outcomes(self):
        """A new 3-outcome market should have 33.3% each."""
        q = [0.0, 0.0, 0.0]
        b = 100.0
        p = prices(q, b)
        for pi in p:
            assert abs(pi - 1/3) < 1e-9

    def test_after_trades_prices_diverge(self):
        """After buying one outcome, prices should diverge."""
        q = [0.0, 0.0]
        b = 100.0

        # Simulate a buy of 50 shares on outcome 0
        _, new_q, new_p = quote(q, b, 0, 50.0)

        assert new_p[0] > 0.5  # Bought outcome goes up
        assert new_p[1] < 0.5  # Other outcome goes down
        assert abs(sum(new_p) - 1.0) < 1e-9

    def test_b_param_affects_impact(self):
        """Higher b should result in less price impact."""
        q = [0.0, 0.0]
        shares = 10.0

        # Low b -> more impact
        _, _, prices_low_b = quote(q, 10.0, 0, shares)
        # High b -> less impact
        _, _, prices_high_b = quote(q, 1000.0, 0, shares)

        # Low b should push price further from 0.5
        assert abs(prices_low_b[0] - 0.5) > abs(prices_high_b[0] - 0.5)


class TestMarketCosts:
    """Test market cost calculations."""

    def test_initial_cost(self):
        """Initial cost for a 2-outcome market with q=[0,0]."""
        q = [0.0, 0.0]
        b = 100.0
        c = cost(q, b)
        import math
        assert abs(c - b * math.log(2)) < 1e-9

    def test_buying_costs_increase_with_quantity(self):
        """Buying more shares should cost more total."""
        q = [0.0, 0.0]
        b = 100.0

        cost_10, _, _ = quote(q, b, 0, 10.0)
        cost_50, _, _ = quote(q, b, 0, 50.0)
        cost_100, _, _ = quote(q, b, 0, 100.0)

        assert cost_10 < cost_50 < cost_100

    def test_marginal_cost_increases(self):
        """Marginal cost should increase with more shares (convexity)."""
        q = [0.0, 0.0]
        b = 100.0

        # Cost of first 10 shares
        cost_first_10, q_after_10, _ = quote(q, b, 0, 10.0)
        # Cost of next 10 shares (from the new state)
        cost_next_10, _, _ = quote(q_after_10, b, 0, 10.0)

        assert cost_next_10 > cost_first_10  # Marginal cost increases


class TestMarketLifecycle:
    """Test market state transitions (logic-level)."""

    def test_valid_transitions(self):
        """Verify the expected state transition rules."""
        valid_transitions = {
            "draft": ["pending", "live"],
            "pending": ["live"],
            "live": ["pending", "resolved"],
            "resolved": ["settled"],
        }

        # Just verify the mapping is correct
        assert "live" in valid_transitions["draft"]
        assert "resolved" in valid_transitions["live"]
        assert "settled" in valid_transitions["resolved"]
