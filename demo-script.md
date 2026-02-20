# Hackathon Demo Script (3 Minutes)

## Setup (before demo)
- Backend running: `cd backend && uvicorn app.main:app --reload`
- Frontend running: `cd frontend && npm run dev`
- Pre-register a teacher account and a student account
- Pre-create a class and enroll the student
- Pre-create a market: "Will >70% of students master Probability by the midterm?"

---

## Minute 0:00 - 0:30: The Problem + Teacher Creates Market

**Narration:** "Teachers can't see how confident students are about upcoming assessments until it's too late. Our platform fixes that with educational prediction markets."

1. Open Teacher Dashboard
2. Show the "Create Market" wizard
3. Pick the "Concept Mastery" template
4. Fill in: "Will >70% of students master Probability by the midterm?"
5. Set outcomes: "Yes (>70%)" and "No (<70%)"
6. Set b=100, max position=500
7. Click "Create Market"
8. Click "Approve & Go Live"

**Key point:** "Teachers set the questions aligned to learning objectives. They control every parameter."

---

## Minute 0:30 - 1:15: Student Trades + Odds Move

**Narration:** "Students trade using Blue Coins — a learning currency, not real money. They earn coins through skill games and learning."

1. Switch to Student Dashboard
2. Show portfolio: 1000 Blue Coins, 0 positions
3. Click on the live market
4. Show current odds: 50% / 50%
5. Click "Buy" on "Yes (>70%)" — enter 30 shares
6. Click "Get Quote" — show the cost (about 16.5 coins)
7. Show LMSR explanation: "The cost is determined by the LMSR formula. LMSR spread is the only fee — no hidden costs."
8. Click "Confirm Buy"
9. Watch the odds chart update: Yes goes from 50% to ~64%
10. Show the position in portfolio with P&L

**Key point:** "Prices move based on collective student beliefs. If many students buy 'Yes', the probability rises — giving the teacher a real-time signal."

---

## Minute 1:15 - 2:00: Voice Room + AI Agents

**Narration:** "But this isn't just about trading. The 'Teach to Learn' voice room helps students actually understand the material."

1. Click "Teach-to-Learn Voice Room" on the market
2. Press the microphone button (or type)
3. Say: "I think conditional probability is just multiplying two probabilities together"
4. Watch 2-3 AI agents respond:
   - **Socratic Examiner**: "What happens when events aren't independent? Can you think of a case where P(A and B) != P(A) * P(B)?"
   - **Friendly Tutor**: "Great starting point! That works for independent events. For dependent events, we use P(A|B) * P(B). Think of drawing cards from a deck..."
   - **Skeptic**: "Consider: what's the probability of drawing two aces without replacement?"
5. Show the study checklist that gets generated
6. Point out TTS button: "Students can listen to responses hands-free"

**Key point:** "Each agent has a different personality — questioning, explaining, challenging. This ensemble approach catches misconceptions."

---

## Minute 2:00 - 2:30: Teacher Analytics

**Narration:** "Back on the teacher side, the dashboard reveals powerful insights."

1. Switch to Teacher Dashboard
2. Open the market detail page
3. Show Sentiment Bar: "65% of students believe they'll master probability"
4. Show Price History chart: "We can see confidence changed after the review session"
5. Show Class Misconceptions (aggregated from voice sessions): "Multiple students confused conditional probability with joint probability"
6. Show Trading Flags: "No suspicious activity detected"

**Key point:** "Teachers see sentiment, misconceptions, and participation — all privacy-preserving and aggregated."

---

## Minute 2:30 - 3:00: Resolution + Big Picture

**Narration:** "After the midterm, the teacher resolves the market."

1. Click "Resolve Market" -> Select "Yes (>70%)"
2. Winners receive 1 coin per share. Losers already paid at trade time.
3. Show the audit log: every action tracked for transparency

**Closing:** "Campus Market turns passive studying into active forecasting. Students are incentivized to think critically about their own learning. Teachers get unprecedented real-time insight into class understanding. And the AI agents ensure every student has a personal study team available 24/7."

**Final slide points:**
- LMSR ensures fair, transparent pricing — no house edge
- Blue Coins keep it educational — no real money gambling
- 50% risk cap means students can't lose everything
- Teacher approval gate on every market
- Full audit trail for accountability
- Voice-controlled multi-agent tutoring builds deep understanding
