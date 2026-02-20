"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trades as tradesApi, type OutcomeResponse, type TradeQuoteResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface TradePanelProps {
  marketId: string;
  outcomes: OutcomeResponse[];
  onTradeComplete: () => void;
}

export function TradePanel({ marketId, outcomes, onTradeComplete }: TradePanelProps) {
  const { token } = useAuth();
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [shares, setShares] = useState<string>("10");
  const [quoteData, setQuoteData] = useState<TradeQuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");

  const handleQuote = async () => {
    if (!token || !selectedOutcome) return;
    setLoading(true);
    setError(null);
    try {
      const shareCount = tradeMode === "buy" ? parseFloat(shares) : -parseFloat(shares);
      const result = await tradesApi.quote(token, {
        market_id: marketId,
        outcome_id: selectedOutcome,
        shares: shareCount,
      });
      setQuoteData(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!token || !selectedOutcome) return;
    setLoading(true);
    setError(null);
    try {
      const shareCount = tradeMode === "buy" ? parseFloat(shares) : -parseFloat(shares);
      await tradesApi.execute(token, {
        market_id: marketId,
        outcome_id: selectedOutcome,
        shares: shareCount,
      });
      setQuoteData(null);
      setShares("10");
      onTradeComplete();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Trade</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Buy/Sell toggle */}
        <div className="flex gap-2">
          <Button
            variant={tradeMode === "buy" ? "default" : "outline"}
            size="sm"
            onClick={() => { setTradeMode("buy"); setQuoteData(null); }}
            className={tradeMode === "buy" ? "bg-green-600 hover:bg-green-700" : ""}
          >
            Buy
          </Button>
          <Button
            variant={tradeMode === "sell" ? "destructive" : "outline"}
            size="sm"
            onClick={() => { setTradeMode("sell"); setQuoteData(null); }}
          >
            Sell
          </Button>
        </div>

        {/* Outcome selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Select outcome:</label>
          <div className="space-y-1">
            {outcomes.map((o) => (
              <button
                key={o.id}
                onClick={() => { setSelectedOutcome(o.id); setQuoteData(null); }}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedOutcome === o.id
                    ? "bg-blue-50 border-blue-300 border-2"
                    : "bg-gray-50 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                <span className="font-medium">{o.label}</span>
                <span className="float-right text-gray-500">{(o.price * 100).toFixed(1)}%</span>
              </button>
            ))}
          </div>
        </div>

        {/* Shares input */}
        <div>
          <label className="text-sm font-medium text-gray-700">Shares:</label>
          <Input
            type="number"
            min="1"
            step="1"
            value={shares}
            onChange={(e) => { setShares(e.target.value); setQuoteData(null); }}
            className="mt-1"
          />
        </div>

        {/* Get Quote / Execute */}
        {!quoteData ? (
          <Button
            onClick={handleQuote}
            disabled={!selectedOutcome || loading || !shares}
            className="w-full"
          >
            {loading ? "Getting quote..." : "Get Quote"}
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="bg-blue-50 rounded-md p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">Cost:</span>
                <span className="font-semibold">
                  {quoteData.cost > 0 ? `${quoteData.cost.toFixed(2)} coins` : `+${Math.abs(quoteData.cost).toFixed(2)} coins`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Shares:</span>
                <span>{Math.abs(parseFloat(shares))}</span>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                LMSR spread is the only fee — no hidden costs.
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleExecute} disabled={loading} className="flex-1" variant={tradeMode === "buy" ? "success" : "destructive"}>
                {loading ? "Executing..." : `Confirm ${tradeMode === "buy" ? "Buy" : "Sell"}`}
              </Button>
              <Button onClick={() => setQuoteData(null)} variant="outline" className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-md p-3">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
