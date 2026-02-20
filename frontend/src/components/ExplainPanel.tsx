"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markets as marketsApi, type ExplainResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface ExplainPanelProps {
  marketId: string;
}

export function ExplainPanel({ marketId }: ExplainPanelProps) {
  const { token } = useAuth();
  const [explanation, setExplanation] = useState<ExplainResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const handleExplain = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await marketsApi.explain(token, marketId);
      setExplanation(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (!explanation) {
    return (
      <Button variant="outline" onClick={handleExplain} disabled={loading} className="w-full">
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Analyzing...
          </span>
        ) : (
          "Explain This Forecast"
        )}
      </Button>
    );
  }

  return (
    <Card className="bg-blue-50 border-blue-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-blue-800">Forecast Explanation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-blue-900">{explanation.explanation}</p>

        <div>
          <h4 className="text-xs font-semibold text-blue-700 uppercase mb-1">
            What could change the probability?
          </h4>
          <ul className="list-disc list-inside space-y-1">
            {explanation.evidence_factors.map((factor, i) => (
              <li key={i} className="text-sm text-blue-800">{factor}</li>
            ))}
          </ul>
        </div>

        <Button variant="ghost" size="sm" onClick={() => setExplanation(null)} className="text-blue-600">
          Close
        </Button>
      </CardContent>
    </Card>
  );
}
