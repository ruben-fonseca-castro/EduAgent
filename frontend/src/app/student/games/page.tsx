"use client";

import Link from "next/link";

const GAMES = [
  {
    name: "Flash Battle",
    description: "Quick-fire topic quizzes to earn Blue Coins. Answer correctly under time pressure!",
    coins: "5-20 coins per round",
    status: "Coming Soon",
  },
  {
    name: "Scenario Sim",
    description: "Apply concepts to realistic scenarios. Higher difficulty = more coins.",
    coins: "10-50 coins per scenario",
    status: "Coming Soon",
  },
  {
    name: "Concept Map Race",
    description: "Build concept maps faster than your classmates. Top 3 earn bonus coins.",
    coins: "25-100 coins for winners",
    status: "Coming Soon",
  },
  {
    name: "AI Feedback Bounty",
    description: "Flag incorrect AI explanations or submit better reasoning. Earn coins for verified contributions.",
    coins: "15-30 coins per accepted feedback",
    status: "Coming Soon",
  },
];

export default function GamesPage() {
  return (
    <div className="min-h-screen bg-[#FAFBFD] relative">

      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-[#00274C]/6">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/student" className="text-[#00274C]/40 hover:text-[#00274C]/70 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="w-px h-5 bg-[#00274C]/6" />
          <h1 className="text-lg font-semibold text-[#00274C]">Mini Games</h1>
          <span className="tag tag-amber">Beta</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 relative">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-[#00274C]">Earn Blue Coins Through Learning</h2>
          <p className="text-[#00274C]/50 mt-2">
            Complete skill-based mini games to earn coins for trading on prediction forecasts.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {GAMES.map((game, i) => (
            <div key={i} className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-5 opacity-75 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold text-[#00274C]">{game.name}</h3>
                <span className="tag tag-white">{game.status}</span>
              </div>
              <p className="text-sm text-[#00274C]/50">{game.description}</p>
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-[#00274C] font-medium">{game.coins}</span>
                <button disabled className="btn-ghost text-sm opacity-50 cursor-not-allowed">
                  Play
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
