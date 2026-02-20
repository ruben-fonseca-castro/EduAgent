"""Deterministic tests for the LMSR engine.

Verifies:
1. Prices sum to 1
2. Monotonicity — buying increases price of that outcome
3. Cost difference equals payment
4. Numeric stability with extreme values
5. Edge cases (single outcome, large b, small b)
"""

import math
import pytest
import sys
import os

# Add parent dir to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.lmsr import cost, prices, quote, execute, validate_prices_sum_to_one, _logsumexp


class TestLogsumexp:
    """Test the internal logsumexp implementation."""

    def test_basic(self):
        result = _logsumexp([1.0, 2.0, 3.0])
        # log(e^1 + e^2 + e^3) ≈ 3.4076
        assert abs(result - 3.4076059644443806) < 1e-9

    def test_single_value(self):
        result = _logsumexp([5.0])
        assert abs(result - 5.0) < 1e-9

    def test_identical_values(self):
        result = _logsumexp([2.0, 2.0])
        # log(2 * e^2) = 2 + log(2)
        expected = 2.0 + math.log(2.0)
        assert abs(result - expected) < 1e-9

    def test_large_values(self):
        """Verify numeric stability with large values."""
        result = _logsumexp([1000.0, 1001.0, 999.0])
        # Should not overflow
        assert math.isfinite(result)
        # max + log(e^0 + e^1 + e^{-2})
        expected = 1001.0 + math.log(math.exp(-1) + 1 + math.exp(-2))
        assert abs(result - expected) < 1e-6

    def test_negative_values(self):
        result = _logsumexp([-100.0, -101.0, -102.0])
        assert math.isfinite(result)

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            _logsumexp([])


class TestCost:
    """Test the LMSR cost function."""

    def test_uniform_q(self):
        """When all q values are 0, cost should be b * ln(n)."""
        q = [0.0, 0.0]
        b = 100.0
        expected = b * math.log(2)
        assert abs(cost(q, b) - expected) < 1e-9

    def test_three_outcomes(self):
        q = [0.0, 0.0, 0.0]
        b = 100.0
        expected = b * math.log(3)
        assert abs(cost(q, b) - expected) < 1e-9

    def test_nonzero_q(self):
        q = [10.0, 20.0]
        b = 100.0
        result = cost(q, b)
        assert math.isfinite(result)
        assert result > 0

    def test_invalid_b(self):
        with pytest.raises(ValueError):
            cost([0.0, 0.0], 0.0)
        with pytest.raises(ValueError):
            cost([0.0, 0.0], -1.0)

    def test_empty_q(self):
        with pytest.raises(ValueError):
            cost([], 100.0)


class TestPrices:
    """Test the LMSR price computation (softmax)."""

    def test_prices_sum_to_one_uniform(self):
        """Prices should sum to 1 for uniform q."""
        q = [0.0, 0.0]
        b = 100.0
        p = prices(q, b)
        assert abs(sum(p) - 1.0) < 1e-9
        assert abs(p[0] - 0.5) < 1e-9
        assert abs(p[1] - 0.5) < 1e-9

    def test_prices_sum_to_one_three_outcomes(self):
        q = [0.0, 0.0, 0.0]
        b = 100.0
        p = prices(q, b)
        assert abs(sum(p) - 1.0) < 1e-9
        assert all(abs(pi - 1/3) < 1e-9 for pi in p)

    def test_prices_sum_to_one_nonuniform(self):
        q = [50.0, 30.0, 20.0]
        b = 100.0
        p = prices(q, b)
        assert abs(sum(p) - 1.0) < 1e-9

    def test_prices_sum_to_one_various_b(self):
        """Prices should sum to 1 for various b values."""
        q = [10.0, 20.0, 30.0]
        for b in [1.0, 10.0, 100.0, 1000.0]:
            p = prices(q, b)
            assert abs(sum(p) - 1.0) < 1e-6, f"Failed for b={b}: sum={sum(p)}"

    def test_higher_q_means_higher_price(self):
        """Outcome with higher q should have higher price."""
        q = [10.0, 20.0, 5.0]
        b = 100.0
        p = prices(q, b)
        assert p[1] > p[0] > p[2]

    def test_extreme_q_values(self):
        """Numeric stability with extreme q values."""
        q = [1000.0, 0.0]
        b = 100.0
        p = prices(q, b)
        assert abs(sum(p) - 1.0) < 1e-6
        assert p[0] > 0.99  # Should be very close to 1

    def test_negative_q_values(self):
        q = [-50.0, -100.0]
        b = 100.0
        p = prices(q, b)
        assert abs(sum(p) - 1.0) < 1e-9
        assert p[0] > p[1]  # Higher (less negative) q means higher price

    def test_validate_helper(self):
        assert validate_prices_sum_to_one([0.0, 0.0], 100.0)
        assert validate_prices_sum_to_one([50.0, 30.0], 10.0)
        assert validate_prices_sum_to_one([100.0, 200.0, 300.0], 50.0)


class TestQuote:
    """Test the LMSR quote function."""

    def test_buy_increases_price(self):
        """Buying shares of an outcome should increase its price (monotonicity)."""
        q = [0.0, 0.0]
        b = 100.0

        before_prices = prices(q, b)
        cost_diff, new_q, new_prices = quote(q, b, 0, 10.0)

        # Price of outcome 0 should increase
        assert new_prices[0] > before_prices[0]
        # Price of outcome 1 should decrease
        assert new_prices[1] < before_prices[1]
        # Prices still sum to 1
        assert abs(sum(new_prices) - 1.0) < 1e-9

    def test_sell_decreases_price(self):
        """Selling shares should decrease the price of that outcome."""
        q = [50.0, 0.0]
        b = 100.0

        before_prices = prices(q, b)
        cost_diff, new_q, new_prices = quote(q, b, 0, -10.0)

        assert new_prices[0] < before_prices[0]

    def test_cost_difference_equals_payment(self):
        """The cost difference should exactly equal the payment."""
        q = [0.0, 0.0]
        b = 100.0

        cost_before = cost(q, b)
        cost_diff, new_q, new_prices = quote(q, b, 0, 10.0)
        cost_after = cost(new_q, b)

        assert abs(cost_diff - (cost_after - cost_before)) < 1e-9

    def test_cost_positive_for_buy(self):
        """Buying should always cost positive coins."""
        q = [0.0, 0.0]
        b = 100.0
        cost_diff, _, _ = quote(q, b, 0, 10.0)
        assert cost_diff > 0

    def test_cost_negative_for_sell(self):
        """Selling should return coins (negative cost) when you have shares."""
        q = [50.0, 0.0]
        b = 100.0
        cost_diff, _, _ = quote(q, b, 0, -10.0)
        assert cost_diff < 0

    def test_sequential_trades_consistent(self):
        """Multiple sequential trades should produce consistent pricing."""
        q = [0.0, 0.0]
        b = 100.0
        total_cost = 0.0

        # Buy 10 shares in 10 separate 1-share trades
        for _ in range(10):
            cost_diff, q, new_prices = quote(q, b, 0, 1.0)
            total_cost += cost_diff

        # Buy 10 shares at once from initial state
        single_cost, _, _ = quote([0.0, 0.0], b, 0, 10.0)

        # Should be equal (path-independent for same total quantity)
        assert abs(total_cost - single_cost) < 1e-6

    def test_out_of_range_outcome(self):
        with pytest.raises(ValueError):
            quote([0.0, 0.0], 100.0, 5, 10.0)
        with pytest.raises(ValueError):
            quote([0.0, 0.0], 100.0, -1, 10.0)

    def test_zero_shares(self):
        """Buying 0 shares should cost nothing."""
        q = [10.0, 20.0]
        b = 100.0
        cost_diff, new_q, new_prices = quote(q, b, 0, 0.0)
        assert abs(cost_diff) < 1e-9
        assert new_q == q

    def test_three_outcome_monotonicity(self):
        """Monotonicity should hold for 3-outcome markets too."""
        q = [0.0, 0.0, 0.0]
        b = 100.0

        before_prices = prices(q, b)
        _, _, new_prices = quote(q, b, 1, 20.0)

        assert new_prices[1] > before_prices[1]  # Bought outcome increased
        assert new_prices[0] < before_prices[0]  # Others decreased
        assert new_prices[2] < before_prices[2]


class TestExecute:
    """Test the LMSR execute function."""

    def test_execute_returns_audit_data(self):
        q = [0.0, 0.0]
        b = 100.0
        result = execute(q, b, 0, 10.0)

        assert "before_q" in result
        assert "after_q" in result
        assert "before_prices" in result
        assert "after_prices" in result
        assert "cost" in result

        assert result["before_q"] == [0.0, 0.0]
        assert result["after_q"] == [10.0, 0.0]
        assert result["cost"] > 0

    def test_execute_before_prices_sum_to_one(self):
        result = execute([0.0, 0.0], 100.0, 0, 10.0)
        assert abs(sum(result["before_prices"]) - 1.0) < 1e-9

    def test_execute_after_prices_sum_to_one(self):
        result = execute([0.0, 0.0], 100.0, 0, 10.0)
        assert abs(sum(result["after_prices"]) - 1.0) < 1e-9

    def test_execute_cost_matches_quote(self):
        q = [5.0, 10.0]
        b = 100.0
        quote_cost, _, _ = quote(q, b, 0, 15.0)
        exec_result = execute(q, b, 0, 15.0)
        assert abs(quote_cost - exec_result["cost"]) < 1e-9


class TestNumericStability:
    """Edge cases for numeric stability."""

    def test_very_large_b(self):
        q = [0.0, 0.0]
        b = 1e6
        p = prices(q, b)
        assert abs(sum(p) - 1.0) < 1e-6
        assert all(math.isfinite(pi) for pi in p)

    def test_very_small_b(self):
        q = [10.0, 0.0]
        b = 0.001
        p = prices(q, b)
        assert abs(sum(p) - 1.0) < 1e-6
        assert p[0] > 0.99  # With tiny b, higher q dominates

    def test_large_q_difference(self):
        q = [500.0, 0.0]
        b = 10.0
        p = prices(q, b)
        assert abs(sum(p) - 1.0) < 1e-6
        assert math.isfinite(p[0])
        assert math.isfinite(p[1])

    def test_many_outcomes(self):
        """Test with many outcomes."""
        q = [0.0] * 20
        b = 100.0
        p = prices(q, b)
        assert abs(sum(p) - 1.0) < 1e-6
        assert all(abs(pi - 1/20) < 1e-6 for pi in p)

    def test_mixed_large_values(self):
        q = [1000.0, -1000.0, 500.0]
        b = 100.0
        p = prices(q, b)
        assert abs(sum(p) - 1.0) < 1e-6
        assert all(math.isfinite(pi) for pi in p)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
