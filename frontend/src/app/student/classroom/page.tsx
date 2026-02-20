"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { courses as coursesApi, type CourseResponse } from "@/lib/api";

export default function ClassroomListPage() {
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [courseList, setCourseList] = useState<CourseResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!token || !user) { router.push("/login"); return; }
    loadCourses();
  }, [authLoading, token, user]);

  const loadCourses = async () => {
    if (!token) return;
    try {
      const data = await coursesApi.list(token);
      setCourseList(data.courses);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#FAFBFD] relative">

      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-[#00274C]/6">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/student" className="text-[#00274C]/40 hover:text-[#00274C]/70 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="w-px h-5 bg-[#00274C]/6" />
            <h1 className="text-base font-semibold text-[#00274C]">AI Classroom</h1>
          </div>
          <span className="text-xs text-[#00274C]/40">{user?.display_name}</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 relative z-10">
        <div className="mb-10">
          <h2 className="text-3xl font-bold text-[#00274C] mb-2">Your Courses</h2>
          <p className="text-[#00274C]/40 text-sm">Select a course to enter the immersive teaching classroom</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (<div key={i} className="bg-white/80 border border-[#00274C]/6 rounded-2xl h-48 animate-pulse" />))}
          </div>
        ) : courseList.length === 0 ? (
          <div className="bg-white/80 border border-[#00274C]/6 rounded-2xl p-16 text-center shadow-sm">
            <div className="text-5xl mb-4 opacity-30">📚</div>
            <p className="text-[#00274C]/50 mb-2 font-medium">No courses available yet</p>
            <p className="text-[#00274C]/25 text-sm max-w-md mx-auto">Your teacher needs to create a course with materials for you to start teaching.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {courseList.map((course) => (
              <Link key={course.id} href={`/student/classroom/${course.id}`}>
                <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 cursor-pointer group h-48 flex flex-col justify-between shadow-sm hover:shadow-md transition-all">
                  <div>
                    <h3 className="font-semibold text-base text-[#00274C] mb-2 group-hover:text-[#00274C]/80 transition-colors">
                      {course.title}
                    </h3>
                    {course.description && (
                      <p className="text-[#00274C]/40 text-sm line-clamp-2 leading-relaxed">{course.description}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-[#00274C]/6">
                    <span className="text-[10px] text-[#00274C]/25 uppercase tracking-wider font-semibold">
                      {course.materials_count} material{course.materials_count !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs text-[#00274C] group-hover:text-[#00274C]/80 transition-colors flex items-center gap-1.5">
                      Enter
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                      </svg>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
