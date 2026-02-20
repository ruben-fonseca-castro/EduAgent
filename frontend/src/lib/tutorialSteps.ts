import type { TutorialStep } from "@/components/TutorialOverlay";

// ── Teacher Tutorial ────────────────────────────────────────────────────────
// Flow: Create a class → share invite code → go to Courses → upload materials → create a forecast

export const teacherTutorialSteps: TutorialStep[] = [
  {
    target: "teacher-welcome",
    title: "Welcome to numénor.ai!",
    body: "This is your Teacher Dashboard. Let's walk through how to set up your class and get students learning.",
    placement: "bottom",
  },
  {
    target: "teacher-create-class",
    title: "Create a Class",
    body: "Start by typing your class name here (e.g., \"CS 101 - Spring 2026\") and clicking Create. Students will use an invite code to join.",
    placement: "bottom",
  },
  {
    target: "teacher-invite-code",
    title: "Share the Invite Code",
    body: "Once your class is created, you'll see an invite code here. Share it with students so they can join your class. Click Copy to grab it.",
    placement: "left",
  },
  {
    target: "teacher-courses-link",
    title: "Manage Courses",
    body: "Click Courses to create a course and upload your lecture notes, slides, or any materials. The AI uses these to generate personalized lessons.",
    placement: "bottom",
  },
  {
    target: "teacher-create-market",
    title: "Create Prediction Forecasts",
    body: "Create prediction forecasts for your class! Students trade on concepts like \"Will 80% master recursion?\" — it reveals what they actually understand.",
    placement: "bottom",
  },
  {
    target: "teacher-stats",
    title: "Track Everything",
    body: "Monitor your forecasts, see live stats, and check trading alerts. You have full visibility into how students are engaging with the material.",
    placement: "top",
  },
];

// ── Student Tutorial ────────────────────────────────────────────────────────
// Flow: Join class → check portfolio → go to Classroom → find lessons → resume builder

export const studentTutorialSteps: TutorialStep[] = [
  {
    target: "student-welcome",
    title: "Welcome to numénor.ai!",
    body: "This is your Student Dashboard. Let's show you around so you can start learning and trading.",
    placement: "bottom",
  },
  {
    target: "student-join-class",
    title: "Join a Class",
    body: "Enter the invite code from your teacher to join a class. Once you're in, you'll see prediction forecasts and can access the AI classroom.",
    placement: "bottom",
  },
  {
    target: "student-classroom-link",
    title: "Enter the AI Classroom",
    body: "This is where the magic happens! Click Classroom to enter AI-powered learning sessions. You'll teach AI students and learn by explaining concepts.",
    placement: "bottom",
  },
  {
    target: "student-resume-link",
    title: "AI Resume Builder",
    body: "Build and polish your resume with AI assistance. Upload an existing resume or create one from scratch — the AI helps you tailor it for any job.",
    placement: "bottom",
  },
  {
    target: "student-portfolio",
    title: "Your Portfolio",
    body: "Track your Blue Coins, investments, and performance. You earn coins by teaching well in the classroom — spend them trading on prediction forecasts.",
    placement: "top",
  },
  {
    target: "student-markets",
    title: "Prediction Forecasts",
    body: "Trade on class-related predictions! Your trades reflect what you actually understand. Buy shares in outcomes you believe in.",
    placement: "top",
  },
];
