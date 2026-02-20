"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { studentProfile, type QuizQuestion } from "@/lib/api";

const GRADE_LEVELS = [
  { value: "middle_school", label: "Middle School" },
  { value: "high_school", label: "High School" },
  { value: "undergraduate", label: "Undergraduate" },
  { value: "graduate", label: "Graduate" },
  { value: "professional", label: "Professional" },
];

const SUBJECTS = [
  "Computer Science", "Mathematics", "Physics", "Chemistry", "Biology",
  "Engineering", "Economics", "Business", "Psychology", "History",
  "Literature", "Data Science", "Statistics", "Philosophy", "Other",
];

export default function OnboardingPage() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [step, setStep] = useState(0); // 0-9 = quiz, 10 = details, 11 = resume, 12 = done
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [additionalDetails, setAdditionalDetails] = useState("");
  const [gradeLevel, setGradeLevel] = useState("undergraduate");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch quiz questions
  useEffect(() => {
    if (token) {
      studentProfile.getQuizQuestions(token).then(setQuestions).catch(() => {});
    }
  }, [token]);

  // Auth guard
  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
    if (!isLoading && user && user.role !== "student") {
      router.push("/teacher");
    }
  }, [isLoading, user, router]);

  // Check if already completed
  useEffect(() => {
    if (token) {
      studentProfile.checkQuiz(token).then((res) => {
        if (res.quiz_completed) {
          router.push("/student");
        }
      }).catch(() => {});
    }
  }, [token, router]);

  const handleAnswer = useCallback((questionId: number, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
    // Auto-advance after short delay
    setTimeout(() => {
      setStep(prev => Math.min(prev + 1, questions.length + 2));
    }, 300);
  }, [questions.length]);

  const handleSubmit = async () => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      // Submit quiz
      const quizAnswers = Object.entries(answers).map(([qId, answer]) => ({
        question_id: parseInt(qId),
        answer,
      }));

      await studentProfile.submitQuiz(token, {
        answers: quizAnswers,
        additional_details: additionalDetails,
        grade_level: gradeLevel,
        subjects: selectedSubjects,
      });

      // Upload resume if provided
      if (resumeFile) {
        try {
          await studentProfile.uploadResume(token, resumeFile);
        } catch {
          // Resume upload is optional — don't block
        }
      }

      setStep(questions.length + 2); // done step
      setTimeout(() => router.push("/student"), 2000);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSubject = (subject: string) => {
    setSelectedSubjects(prev =>
      prev.includes(subject) ? prev.filter(s => s !== subject) : [...prev, subject]
    );
  };

  if (isLoading || !user || questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFBFD]">
        <div className="w-8 h-8 border-2 border-[#00274C] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalSteps = questions.length + 2; // 10 questions + details + resume
  const progress = Math.min((step / totalSteps) * 100, 100);
  const isQuizStep = step < questions.length;
  const isDetailsStep = step === questions.length;
  const isResumeStep = step === questions.length + 1;
  const isDone = step === questions.length + 2;

  return (
    <div className="min-h-screen bg-[#FAFBFD] relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#00274C]/[0.02] via-transparent to-[#FFCB05]/[0.04]" />

      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-[#00274C]/5 z-50">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%`, background: "linear-gradient(90deg, #FFCB05, #D50032)" }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-4 flex items-center justify-between max-w-4xl mx-auto">
        <Link href="/student" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center overflow-hidden">
            <img src="/logo.svg" alt="numénor.ai" width="28" height="28" style={{objectFit:"contain"}} />
          </div>
          <span className="text-lg font-bold text-[#00274C]">numénor.ai</span>
        </Link>
        <span className="text-xs text-[#00274C]/30 font-medium">
          {isDone ? "All done!" : `Step ${step + 1} of ${totalSteps}`}
        </span>
      </header>

      {/* Content */}
      <div className="relative z-10 max-w-2xl mx-auto px-6 pt-8 pb-24">

        {/* ── Done state ────────────────────────────── */}
        {isDone && (
          <div className="text-center animate-fade-in-up">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#FFCB05] to-[#D50032] flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-[#00274C] mb-3">You're all set!</h1>
            <p className="text-[#00274C]/50 mb-2">Your learning profile has been created.</p>
            <p className="text-sm text-[#00274C]/30">Redirecting to your dashboard...</p>
          </div>
        )}

        {/* ── Quiz questions ────────────────────────── */}
        {isQuizStep && (
          <div className="animate-fade-in-up" key={`q-${step}`}>
            <div className="mb-8">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[#FFCB05]/15 text-[#00274C] mb-4">
                Question {step + 1} of {questions.length}
              </span>
              <h1 className="text-2xl font-bold text-[#00274C] leading-snug">
                {questions[step].question}
              </h1>
            </div>

            <div className="space-y-3">
              {Object.entries(questions[step].options).map(([letter, text]) => {
                const isSelected = answers[questions[step].id] === letter;
                return (
                  <button
                    key={letter}
                    onClick={() => handleAnswer(questions[step].id, letter)}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 group ${
                      isSelected
                        ? "bg-[#00274C] border-[#00274C] text-white shadow-lg shadow-[#00274C]/20"
                        : "bg-white border-[#00274C]/8 text-[#00274C] hover:border-[#00274C]/20 hover:shadow-md"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                        isSelected ? "bg-white/20 text-white" : "bg-[#00274C]/5 text-[#00274C]/50 group-hover:bg-[#00274C]/10"
                      }`}>
                        {letter}
                      </span>
                      <span className="text-sm font-medium">{text}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {step > 0 && (
              <button
                onClick={() => setStep(prev => prev - 1)}
                className="mt-6 text-sm text-[#00274C]/30 hover:text-[#00274C]/60 transition-colors"
              >
                &larr; Previous question
              </button>
            )}
          </div>
        )}

        {/* ── Details step ────────────────────────── */}
        {isDetailsStep && (
          <div className="animate-fade-in-up" key="details">
            <div className="mb-8">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[#FFCB05]/15 text-[#00274C] mb-4">
                Almost there
              </span>
              <h1 className="text-2xl font-bold text-[#00274C] mb-2">Tell us more about you</h1>
              <p className="text-sm text-[#00274C]/50">Help us personalize your learning experience.</p>
            </div>

            <div className="space-y-6">
              {/* Grade Level */}
              <div>
                <label className="text-xs font-semibold text-[#00274C]/50 uppercase tracking-wider mb-3 block">Grade Level</label>
                <div className="flex flex-wrap gap-2">
                  {GRADE_LEVELS.map(gl => (
                    <button
                      key={gl.value}
                      onClick={() => setGradeLevel(gl.value)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        gradeLevel === gl.value
                          ? "bg-[#00274C] text-white"
                          : "bg-white border border-[#00274C]/8 text-[#00274C]/60 hover:border-[#00274C]/20"
                      }`}
                    >
                      {gl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subjects */}
              <div>
                <label className="text-xs font-semibold text-[#00274C]/50 uppercase tracking-wider mb-3 block">
                  Subjects of Interest <span className="text-[#00274C]/20">(select all that apply)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {SUBJECTS.map(subject => (
                    <button
                      key={subject}
                      onClick={() => toggleSubject(subject)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedSubjects.includes(subject)
                          ? "bg-[#FFCB05]/20 border border-[#FFCB05]/40 text-[#00274C]"
                          : "bg-white border border-[#00274C]/8 text-[#00274C]/50 hover:border-[#00274C]/15"
                      }`}
                    >
                      {subject}
                    </button>
                  ))}
                </div>
              </div>

              {/* Additional Details */}
              <div>
                <label className="text-xs font-semibold text-[#00274C]/50 uppercase tracking-wider mb-3 block">
                  Anything else? <span className="text-[#00274C]/20">(optional)</span>
                </label>
                <textarea
                  value={additionalDetails}
                  onChange={e => setAdditionalDetails(e.target.value)}
                  placeholder="e.g., &quot;I learn best with real-world examples&quot;, &quot;I'm a visual learner&quot;, &quot;Please teach me with humor&quot;..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-[#00274C]/8 text-sm text-[#00274C] placeholder:text-[#00274C]/25 focus:outline-none focus:border-[#00274C]/20 focus:ring-2 focus:ring-[#00274C]/5 resize-none bg-white"
                />
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <button
                onClick={() => setStep(prev => prev - 1)}
                className="text-sm text-[#00274C]/30 hover:text-[#00274C]/60 transition-colors"
              >
                &larr; Back
              </button>
              <button
                onClick={() => setStep(prev => prev + 1)}
                className="btn-primary px-6 py-2.5"
              >
                Continue &rarr;
              </button>
            </div>
          </div>
        )}

        {/* ── Resume step ────────────────────────── */}
        {isResumeStep && (
          <div className="animate-fade-in-up" key="resume">
            <div className="mb-8">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[#FFCB05]/15 text-[#00274C] mb-4">
                Optional
              </span>
              <h1 className="text-2xl font-bold text-[#00274C] mb-2">Upload your resume</h1>
              <p className="text-sm text-[#00274C]/50">
                This helps numénor.ai understand your background and tailor lessons to your experience. Totally optional.
              </p>
            </div>

            <div
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                resumeFile
                  ? "border-[#FFCB05]/40 bg-[#FFCB05]/5"
                  : "border-[#00274C]/10 bg-white hover:border-[#00274C]/20"
              }`}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files[0];
                if (file) setResumeFile(file);
              }}
            >
              {resumeFile ? (
                <div>
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#FFCB05]/20 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00274C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-[#00274C]">{resumeFile.name}</p>
                  <p className="text-xs text-[#00274C]/30 mt-1">{(resumeFile.size / 1024).toFixed(0)} KB</p>
                  <button
                    onClick={() => setResumeFile(null)}
                    className="mt-3 text-xs text-[#D50032] hover:text-[#D50032]/70 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#00274C]/5 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00274C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <p className="text-sm text-[#00274C]/40 mb-2">Drop your resume here, or</p>
                  <label className="inline-block cursor-pointer">
                    <span className="text-sm font-semibold text-[#00274C] underline underline-offset-2 hover:text-[#00274C]/70 transition-colors">
                      browse files
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.txt"
                      onChange={e => { if (e.target.files?.[0]) setResumeFile(e.target.files[0]); }}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-[#00274C]/20 mt-2">PDF, DOCX, or TXT</p>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-[#D50032]/10 border border-[#D50032]/20">
                <span className="text-sm text-[#D50032]">{error}</span>
              </div>
            )}

            <div className="mt-8 flex items-center justify-between">
              <button
                onClick={() => setStep(prev => prev - 1)}
                className="text-sm text-[#00274C]/30 hover:text-[#00274C]/60 transition-colors"
              >
                &larr; Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="btn-primary px-8 py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating your profile...
                  </span>
                ) : (
                  "Complete Setup"
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Step dots */}
      {!isDone && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === step ? "w-6 h-2 bg-[#00274C]" : i < step ? "w-2 h-2 bg-[#FFCB05]" : "w-2 h-2 bg-[#00274C]/10"
              }`}
            />
          ))}
        </div>
      )}

      <style jsx>{`
        .animate-fade-in-up {
          animation: fadeInUp 0.4s ease-out;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
