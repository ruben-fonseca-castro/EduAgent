/**
 * API client for the numénor.ai backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface FetchOptions extends RequestInit {
  token?: string;
}

async function fetchAPI<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { token, ...fetchOpts } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...fetchOpts,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }

  return res.json();
}

// Auth
export const auth = {
  register: (data: { email: string; password: string; role: string; display_name: string }) =>
    fetchAPI("/api/auth/register", { method: "POST", body: JSON.stringify(data) }),

  login: (data: { email: string; password: string }) =>
    fetchAPI<{ access_token: string; token_type: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  me: (token: string) =>
    fetchAPI<UserResponse>("/api/auth/me", { token }),
};

// Classes
export const classes = {
  create: (token: string, data: { name: string }) =>
    fetchAPI<ClassResponse>("/api/classes", { method: "POST", body: JSON.stringify(data), token }),

  list: (token: string) =>
    fetchAPI<ClassListResponse>("/api/classes", { token }),

  join: (token: string, data: { invite_code: string }) =>
    fetchAPI<ClassResponse>("/api/classes/join", { method: "POST", body: JSON.stringify(data), token }),
};

// Markets
export const markets = {
  list: (token: string, params?: { class_id?: string; status?: string; market_type?: string }) => {
    const query = new URLSearchParams();
    if (params?.class_id) query.set("class_id", params.class_id);
    if (params?.status) query.set("status", params.status);
    if (params?.market_type) query.set("market_type", params.market_type);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return fetchAPI<MarketListResponse>(`/api/markets${qs}`, { token });
  },

  get: (token: string, id: string) =>
    fetchAPI<MarketResponse>(`/api/markets/${id}`, { token }),

  create: (token: string, data: MarketCreateRequest) =>
    fetchAPI<MarketResponse>("/api/markets", { method: "POST", body: JSON.stringify(data), token }),

  approve: (token: string, id: string) =>
    fetchAPI<MarketResponse>(`/api/markets/${id}/approve`, { method: "PATCH", token }),

  pause: (token: string, id: string) =>
    fetchAPI<MarketResponse>(`/api/markets/${id}/pause`, { method: "PATCH", token }),

  resolve: (token: string, id: string, outcome_id: string) =>
    fetchAPI<MarketResponse>(`/api/markets/${id}/resolve`, {
      method: "PATCH",
      body: JSON.stringify({ outcome_id }),
      token,
    }),

  updateSettings: (token: string, id: string, data: { b_param?: number; max_position?: number; max_daily_spend?: number }) =>
    fetchAPI<MarketResponse>(`/api/markets/${id}/settings`, {
      method: "PATCH",
      body: JSON.stringify(data),
      token,
    }),

  sentiment: (token: string, id: string) =>
    fetchAPI<SentimentResponse>(`/api/markets/${id}/sentiment`, { token }),

  history: (token: string, id: string) =>
    fetchAPI<PriceHistoryResponse>(`/api/markets/${id}/history`, { token }),

  explain: (token: string, id: string) =>
    fetchAPI<ExplainResponse>(`/api/markets/${id}/explain`, { method: "POST", token }),
};

// Trades
export const trades = {
  quote: (token: string, data: { market_id: string; outcome_id: string; shares: number }) =>
    fetchAPI<TradeQuoteResponse>("/api/trades/quote", { method: "POST", body: JSON.stringify(data), token }),

  execute: (token: string, data: { market_id: string; outcome_id: string; shares: number }) =>
    fetchAPI<TradeResponse>("/api/trades/execute", { method: "POST", body: JSON.stringify(data), token }),

  my: (token: string) =>
    fetchAPI<TradeResponse[]>("/api/trades/my", { token }),

  positions: (token: string) =>
    fetchAPI<PositionResponse[]>("/api/positions/my", { token }),

  portfolio: (token: string) =>
    fetchAPI<PortfolioResponse>("/api/portfolio/my", { token }),
};

// Voice
export const voice = {
  createSession: (token: string, data: { market_id: string }) =>
    fetchAPI<VoiceSessionResponse>("/api/voice/sessions", { method: "POST", body: JSON.stringify(data), token }),

  sendMessage: (token: string, data: { session_id: string; text: string }) =>
    fetchAPI<VoiceMessageResponse>("/api/voice/message", { method: "POST", body: JSON.stringify(data), token }),

  getSession: (token: string, id: string) =>
    fetchAPI<VoiceSessionResponse>(`/api/voice/sessions/${id}`, { token }),

  summarize: (token: string, id: string) =>
    fetchAPI<VoiceSessionResponse>(`/api/voice/sessions/${id}/summarize`, { method: "POST", token }),

  insights: (token: string, market_id: string) =>
    fetchAPI<ClassInsightsResponse>(`/api/voice/insights/${market_id}`, { token }),
};

// Courses
export const courses = {
  create: (token: string, data: { class_id: string; title: string; description?: string }) =>
    fetchAPI<CourseResponse>("/api/courses", { method: "POST", body: JSON.stringify(data), token }),

  list: (token: string, params?: { class_id?: string }) => {
    const query = new URLSearchParams();
    if (params?.class_id) query.set("class_id", params.class_id);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return fetchAPI<CourseListResponse>(`/api/courses${qs}`, { token });
  },

  get: (token: string, id: string) =>
    fetchAPI<CourseResponse>(`/api/courses/${id}`, { token }),

  uploadMaterial: async (token: string, courseId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/courses/${courseId}/materials`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || `Upload error: ${res.status}`);
    }
    return res.json() as Promise<MaterialResponse>;
  },

  listMaterials: (token: string, courseId: string) =>
    fetchAPI<MaterialListResponse>(`/api/courses/${courseId}/materials`, { token }),

  deleteMaterial: (token: string, courseId: string, materialId: string) =>
    fetch(`${API_BASE}/api/courses/${courseId}/materials/${materialId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
};

// Classroom
export const classroom = {
  createSession: (token: string, data: { course_id: string; lesson_id?: string }) =>
    fetchAPI<ClassroomSessionResponse>("/api/classroom/sessions", { method: "POST", body: JSON.stringify(data), token }),

  sendMessage: (token: string, data: { session_id: string; text: string; personas?: string[] }) =>
    fetchAPI<ClassroomMessageResponse>("/api/classroom/message", { method: "POST", body: JSON.stringify(data), token }),

  getMaterialDownloadUrl: (courseId: string, materialId: string, token: string) =>
    `${API_BASE}/api/courses/${courseId}/materials/${materialId}/download?token=${token}`,

  getSession: (token: string, id: string) =>
    fetchAPI<ClassroomSessionResponse>(`/api/classroom/sessions/${id}`, { token }),

  evaluate: (token: string, sessionId: string) =>
    fetchAPI<TeachingEvaluation>(`/api/classroom/sessions/${sessionId}/evaluate`, { method: "POST", token }),

  analytics: (token: string, courseId: string) =>
    fetchAPI<ClassroomAnalyticsResponse>(`/api/classroom/analytics/${courseId}`, { token }),

  generateReport: (token: string, sessionId: string) =>
    fetchAPI<PerformanceReportResponse>(`/api/classroom/sessions/${sessionId}/report`, { method: "POST", token }),

  generateFollowup: (token: string, sessionId: string) =>
    fetchAPI<{ lesson_id: string; status: string; focus_topics: string[] }>(`/api/classroom/sessions/${sessionId}/generate-followup`, { method: "POST", token }),

  getOpeningQuestion: (token: string, sessionId: string) =>
    fetchAPI<{ question: string; topic: string; agent_name: string; persona: string }>(
      `/api/classroom/sessions/${sessionId}/opening-question`,
      { method: "POST", token }
    ),
};

// Student Profile
export const studentProfile = {
  getQuizQuestions: (token: string) =>
    fetchAPI<QuizQuestion[]>("/api/student-profile/quiz-questions", { token }),

  submitQuiz: (token: string, data: { answers: { question_id: number; answer: string }[]; additional_details: string; grade_level: string; subjects: string[] }) =>
    fetchAPI<StudentProfileResponse>("/api/student-profile/quiz", { method: "POST", body: JSON.stringify(data), token }),

  uploadResume: async (token: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/student-profile/resume`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || `Upload error: ${res.status}`);
    }
    return res.json() as Promise<StudentProfileResponse>;
  },

  getProfile: (token: string) =>
    fetchAPI<StudentProfileResponse>("/api/student-profile/me", { token }),

  checkQuiz: (token: string) =>
    fetchAPI<{ quiz_completed: boolean; profile_id: string | null }>("/api/student-profile/check", { token }),
};

// Resume Builder
export const resumeBuilder = {
  getResume: (token: string) =>
    fetchAPI<ResumeBuilderData>("/api/resume-builder/resume", { token }),

  getSuggestions: (token: string) =>
    fetchAPI<ResumeBuilderSuggestion[]>("/api/resume-builder/suggestions", { token }),

  getChatHistory: (token: string) =>
    fetchAPI<{ role: string; content: string }[]>("/api/resume-builder/chat-history", { token }),

  updateSection: (token: string, section: string, content: unknown) =>
    fetchAPI<{ success: boolean }>(`/api/resume-builder/resume/${section}`, {
      method: "PUT",
      body: JSON.stringify(content),
      token,
    }),

  chat: (token: string, message: string) =>
    fetchAPI<{ reply: string; mode: string | null }>("/api/resume-builder/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
      token,
    }),

  upload: async (token: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    // 2 min timeout — AI parsing large resumes can take a while on OCI
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const res = await fetch(`${API_BASE}/api/resume-builder/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        signal: controller.signal,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(error.detail || `Upload error: ${res.status}`);
      }
      return res.json() as Promise<{ reply: string; mode: string | null }>;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw new Error("Upload timed out — the AI is taking too long. Try again or use a smaller file.");
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  },

  approveSuggestion: (token: string, id: string) =>
    fetchAPI<{ success: boolean }>(`/api/resume-builder/suggestions/${id}/approve`, {
      method: "POST",
      token,
    }),

  rejectSuggestion: (token: string, id: string) =>
    fetchAPI<{ success: boolean }>(`/api/resume-builder/suggestions/${id}/reject`, {
      method: "POST",
      token,
    }),

  approveAll: (token: string) =>
    fetchAPI<{ success: boolean }>("/api/resume-builder/suggestions/approve-all", {
      method: "POST",
      token,
    }),

  rejectAll: (token: string) =>
    fetchAPI<{ success: boolean }>("/api/resume-builder/suggestions/reject-all", {
      method: "POST",
      token,
    }),

  seedFromUpload: (token: string) =>
    fetchAPI<{ status: string; reply: string }>("/api/resume-builder/seed-from-upload", {
      method: "POST",
      token,
    }),

  reset: (token: string) =>
    fetchAPI<{ success: boolean }>("/api/resume-builder/reset", {
      method: "POST",
      token,
    }),
};

// Lessons
export const lessons = {
  generate: (token: string, data: { course_id: string }) =>
    fetchAPI<{ lesson_id: string; status: string }>("/api/lessons/generate", { method: "POST", body: JSON.stringify(data), token }),

  get: (token: string, lessonId: string) =>
    fetchAPI<LessonMetaResponse>(`/api/lessons/${lessonId}`, { token }),

  getContent: (token: string, lessonId: string) =>
    fetchAPI<LessonContentResponse>(`/api/lessons/${lessonId}/content`, { token }),

  listForCourse: (token: string, courseId: string) =>
    fetchAPI<LessonMetaResponse[]>(`/api/lessons/course/${courseId}`, { token }),

  streamUrl: (lessonId: string) => `${API_BASE}/api/lessons/${lessonId}/stream`,
};

// Analytics
export const analytics = {
  flags: (token: string, class_id: string) =>
    fetchAPI<FlagsResponse>(`/api/analytics/flags?class_id=${class_id}`, { token }),

  participation: (token: string, class_id: string) =>
    fetchAPI<ParticipationStats>(`/api/analytics/participation?class_id=${class_id}`, { token }),
};

// Types
export interface UserResponse {
  id: string;
  email: string;
  role: string;
  display_name: string;
  blue_coins: number;
  created_at: string;
}

export interface OutcomeResponse {
  id: string;
  label: string;
  q_value: number;
  price: number;
  display_order: number;
}

export interface MarketResponse {
  id: string;
  class_id: string;
  creator_id: string;
  title: string;
  description: string | null;
  market_type: string;
  status: string;
  b_param: number;
  max_position: number;
  max_daily_spend: number;
  resolution_source: string;
  resolved_outcome_id: string | null;
  created_at: string;
  approved_at: string | null;
  live_at: string | null;
  resolved_at: string | null;
  outcomes: OutcomeResponse[];
}

export interface MarketListResponse {
  markets: MarketResponse[];
  total: number;
}

export interface MarketCreateRequest {
  class_id: string;
  title: string;
  description?: string;
  market_type: string;
  outcomes: { label: string; display_order: number }[];
  b_param?: number;
  max_position?: number;
  max_daily_spend?: number;
  resolution_source?: string;
}

export interface SentimentResponse {
  market_id: string;
  title: string;
  outcomes: { id: string; label: string; price: number; percentage: number }[];
}

export interface PriceHistoryResponse {
  market_id: string;
  history: { timestamp: string; prices: Record<string, number> }[];
}

export interface ExplainResponse {
  market_id: string;
  explanation: string;
  evidence_factors: string[];
}

export interface TradeQuoteResponse {
  market_id: string;
  outcome_id: string;
  shares: number;
  cost: number;
  new_prices: Record<string, number>;
  current_prices: Record<string, number>;
}

export interface TradeResponse {
  id: string;
  market_id: string;
  outcome_id: string;
  shares: number;
  cost: number;
  before_prices: Record<string, number>;
  after_prices: Record<string, number>;
  created_at: string;
}

export interface PositionResponse {
  id: string;
  market_id: string;
  market_title: string;
  market_status: string;
  outcome_id: string;
  outcome_label: string;
  shares: number;
  avg_cost_per_share: number;
  current_price: number;
  pnl: number;
  status: string;
}

export interface PortfolioResponse {
  blue_coins: number;
  total_invested: number;
  positions: PositionResponse[];
  recent_trades: TradeResponse[];
}

export interface VoiceSessionResponse {
  id: string;
  market_id: string;
  messages: Array<{
    role: string;
    content: string;
    agent_name?: string;
    persona?: string;
    timestamp?: string;
  }>;
  summary: string | null;
  checklist: string[] | null;
  created_at: string;
}

export interface VoiceMessageResponse {
  session_id: string;
  student_text: string;
  agent_responses: { agent_name: string; persona: string; message: string }[];
  checklist?: string[];
}

export interface ClassInsightsResponse {
  market_id: string;
  misconceptions: string[];
  participation_count: number;
}

export interface ClassResponse {
  id: string;
  name: string;
  teacher_id: string;
  invite_code: string;
  created_at: string;
}

export interface ClassListResponse {
  classes: ClassResponse[];
}

export interface FlagsResponse {
  flags: { user_id: string; display_name: string; flag_type: string; details: string; severity: string }[];
}

export interface ParticipationStats {
  class_id: string;
  total_students: number;
  active_traders: number;
  total_trades: number;
  markets_created: number;
  avg_trades_per_student: number;
}

// Course types
export interface CourseResponse {
  id: string;
  class_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  created_at: string;
  materials_count: number;
}

export interface CourseListResponse {
  courses: CourseResponse[];
  total: number;
}

export interface MaterialResponse {
  id: string;
  course_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  status: string;
  error_message: string | null;
  created_at: string;
}

export interface MaterialListResponse {
  materials: MaterialResponse[];
  total: number;
}

// Classroom types
export interface AvatarState {
  animation: string;
}

export interface ClassroomAgentResponse {
  agent_name: string;
  persona: string;
  message: string;
  avatar_state: AvatarState;
}

export interface ClassroomSessionResponse {
  id: string;
  course_id: string;
  messages: Array<{
    role: string;
    content: string;
    agent_name?: string;
    persona?: string;
    avatar_state?: AvatarState;
    timestamp?: string;
  }>;
  teaching_score: number;
  topics_covered: string[];
  style_profile: Record<string, number> | null;
  summary: string | null;
  created_at: string;
}

export interface ClassroomMessageResponse {
  session_id: string;
  student_text: string;
  agent_responses: ClassroomAgentResponse[];
  teaching_score: number;
  supervisor_feedback: string | null;
  topics_covered: string[];
  coins_earned: number;
}

export interface TeachingEvaluation {
  session_id: string;
  teaching_score: number;
  strengths: string[];
  areas_to_improve: string[];
  style_profile: Record<string, number>;
  summary: string;
}

export interface StyleProfile {
  uses_analogies: number;
  uses_examples: number;
  breaks_down_steps: number;
  checks_understanding: number;
  accuracy: number;
}

export interface PerformanceReportSummary {
  id: string;
  session_id: string;
  teaching_score: number;
  strengths: string[];
  weaknesses: string[];
  topics_strong: string[];
  topics_weak: string[];
  created_at: string;
}

export interface StudentReport {
  user_id: string;
  display_name: string;
  total_sessions: number;
  total_messages: number;
  avg_teaching_score: number;
  best_teaching_score: number;
  last_session_at: string | null;
  topics_covered: string[];
  style_profile: StyleProfile | null;
  session_scores: number[];
  session_dates: string[];
  strengths: string[];
  areas_to_improve: string[];
  engagement_level: string;
  // Student profile data
  quiz_completed: boolean;
  grade_level: string | null;
  learning_style_summary: string | null;
  subjects: string[];
  resume_uploaded: boolean;
  // Lesson & report data
  lessons_generated: number;
  performance_reports: PerformanceReportSummary[];
}

export interface ClassDemographics {
  total_students: number;
  quiz_completion_rate: number;
  grade_distribution: Record<string, number>;
  common_subjects: string[];
  avg_lessons_per_student: number;
  total_lessons_generated: number;
  total_performance_reports: number;
  avg_report_score: number;
}

export interface ClassroomAnalyticsResponse {
  course_id: string;
  total_sessions: number;
  avg_teaching_score: number;
  active_students: number;
  common_topics: string[];
  score_distribution: Record<string, number>;
  avg_messages_per_session: number;
  total_messages: number;
  high_engagement_count: number;
  medium_engagement_count: number;
  low_engagement_count: number;
  class_style_profile: StyleProfile | null;
  student_reports: StudentReport[];
  class_demographics: ClassDemographics | null;
}

// Student Profile types
export interface QuizQuestion {
  id: number;
  question: string;
  options: Record<string, string>;
}

export interface StudentProfileResponse {
  id: string;
  user_id: string;
  quiz_completed: boolean;
  learning_style_summary: string | null;
  grade_level: string;
  subjects: string[];
  additional_details: string | null;
  resume_uploaded: boolean;
  created_at: string;
}

// Lesson types
export interface LessonMetaResponse {
  id: string;
  course_id: string;
  user_id: string;
  topic: string;
  status: string;
  duration_minutes: number | null;
  error_message: string | null;
  created_at: string;
}

export interface LessonContentResponse {
  lesson_id: string;
  html: string | null;
  sections?: Array<{
    title: string;
    content_type: string;
    generated_content: string;
    figure_ids: string[];
  }>;
  figures?: Array<{
    figure_id: string;
    figure_type: string;
    title: string;
    data: string;
    section_index: number;
  }>;
  status: string;
}

// Resume Builder types
export interface ResumeBuilderData {
  basics: { name: string; email: string; phone: string; linkedin: string; github: string };
  education: Array<{ degree: string; institution: string; date: string; gpa: string }>;
  experience: Array<{ title: string; company: string; location: string; date: string; bullets: string[] }>;
  projects: Array<{ name: string; techStack: string; bullets: string[] }>;
  skills: { languages: string[]; frameworks: string[]; tools: string[]; softSkills: string[] };
  _has_uploaded_text?: boolean;
}

export interface ResumeBuilderSuggestion {
  id: string;
  originalText: string;
  proposedText: string;
  explanation?: string;
  status: "pending";
}

// Performance Report types
export interface PerformanceReportResponse {
  id: string;
  session_id: string;
  user_id: string;
  course_id: string;
  lesson_id: string | null;
  teaching_score: number;
  strengths: string[];
  weaknesses: string[];
  topics_strong: string[];
  topics_weak: string[];
  full_report_text: string;
  created_at: string;
}
