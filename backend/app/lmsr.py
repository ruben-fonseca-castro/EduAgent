"""
Logarithmic Market Scoring Rule (LMSR) Engine.

Implements Hanson's LMSR market maker with numerically stable computation
using the log-sum-exp trick throughout.

Key formulas:
    Cost function:  C(q) = b * ln(sum_i exp(q_i / b))
    Price:          p_i  = exp(q_i / b) / sum_j exp(q_j / b)   (softmax)
    Trade cost:     payment = C(q_after) - C(q_before)

Where:
    q = vector of outstanding shares per outcome
    b = liquidity parameter (higher b = more liquidity, less price impact)
"""

import math
from typing import Tuple


def _logsumexp(values: list[float]) -> float:
    """Numerically stable log-sum-exp.

    Uses the identity: log(sum(exp(x_i))) = max(x) + log(sum(exp(x_i - max(x))))
    to prevent overflow/underflow.
    """
    if not values:
        raise ValueError("Cannot compute logsumexp of empty list")
    max_val = max(values)
    if math.isinf(max_val) and max_val < 0:
        return float("-inf")
    sum_exp = sum(math.exp(v - max_val) for v in values)
    return max_val + math.log(sum_exp)


def cost(q: list[float], b: float) -> float:
    """Compute the LMSR cost function C(q) = b * ln(sum_i exp(q_i / b)).

    Args:
        q: Vector of outstanding shares for each outcome.
        b: Liquidity parameter (must be > 0).

    Returns:
        The cost value.

    Raises:
        ValueError: If b <= 0 or q is empty.
    """
    if b <= 0:
        raise ValueError("Liquidity parameter b must be positive")
    if not q:
        raise ValueError("Outcome vector q must be non-empty")

    scaled = [qi / b for qi in q]
    return b * _logsumexp(scaled)


def prices(q: list[float], b: float) -> list[float]:
    """Compute current prices (probabilities) for all outcomes.

    Uses softmax: p_i = exp(q_i/b) / sum_j exp(q_j/b)

    Args:
        q: Vector of outstanding shares for each outcome.
        b: Liquidity parameter.

    Returns:
        List of prices that sum to 1.0.
    """
    if b <= 0:
        raise ValueError("Liquidity parameter b must be positive")
    if not q:
        raise ValueError("Outcome vector q must be non-empty")

    scaled = [qi / b for qi in q]
    log_denom = _logsumexp(scaled)
    result = [math.exp(s - log_denom) for s in scaled]

    # Normalize to handle floating-point drift
    total = sum(result)
    if total > 0:
        result = [r / total for r in result]
    return result


def price_for_outcome(q: list[float], b: float, outcome_idx: int) -> float:
    """Get the current price for a single outcome.

    Args:
        q: Vector of outstanding shares.
        b: Liquidity parameter.
        outcome_idx: Index of the outcome.

    Returns:
        Price (probability) for the specified outcome.
    """
    all_prices = prices(q, b)
    return all_prices[outcome_idx]


def quote(
    q: list[float], b: float, outcome_idx: int, shares: float
) -> Tuple[float, list[float], list[float]]:
    """Get a price quote for buying/selling shares of an outcome.

    Args:
        q: Current outstanding shares vector.
        b: Liquidity parameter.
        outcome_idx: Which outcome to trade.
        shares: Number of shares (positive = buy, negative = sell).

    Returns:
        Tuple of (cost_difference, new_q_vector, new_prices).
        cost_difference > 0 means payment required (buying),
        cost_difference < 0 means payout (selling).

    Raises:
        ValueError: If outcome_idx is out of range.
    """
    if outcome_idx < 0 or outcome_idx >= len(q):
        raise ValueError(f"outcome_idx {outcome_idx} out of range [0, {len(q)})")

    q_before = list(q)
    q_after = list(q)
    q_after[outcome_idx] += shares

    cost_before = cost(q_before, b)
    cost_after = cost(q_after, b)
    cost_diff = cost_after - cost_before

    new_prices = prices(q_after, b)
    return cost_diff, q_after, new_prices


def execute(
    q: list[float], b: float, outcome_idx: int, shares: float
) -> dict:
    """Execute a trade and return full audit data.

    Args:
        q: Current outstanding shares vector.
        b: Liquidity parameter.
        outcome_idx: Which outcome to trade.
        shares: Number of shares.

    Returns:
        Dict with before_q, after_q, before_prices, after_prices,
        cost (payment amount).
    """
    before_q = list(q)
    before_prices = prices(q, b)

    cost_diff, after_q, after_prices = quote(q, b, outcome_idx, shares)

    return {
        "before_q": before_q,
        "after_q": after_q,
        "before_prices": before_prices,
        "after_prices": after_prices,
        "cost": cost_diff,
    }


def validate_prices_sum_to_one(q: list[float], b: float, tolerance: float = 1e-9) -> bool:
    """Verify that prices sum to 1 within tolerance."""
    p = prices(q, b)
    return abs(sum(p) - 1.0) < tolerance


def max_loss_for_position(shares: float, num_outcomes: int) -> float:
    """Calculate maximum possible loss for a position.

    If the outcome you bought doesn't happen, you lose your entire investment.
    This is used for risk cap calculations.
    """
    # Max loss is the cost paid (shares are worth 0 if outcome doesn't resolve)
    # This is a simplification — actual max loss depends on entry cost
    return abs(shares)
