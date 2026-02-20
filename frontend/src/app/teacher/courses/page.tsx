"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  courses as coursesApi,
  classes as classesApi,
  type CourseResponse,
  type ClassResponse,
} from "@/lib/api";

export default function TeacherCoursesPage() {
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [courseList, setCourseList] = useState<CourseResponse[]>([]);
  const [classList, setClassList] = useState<ClassResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!token || !user) { router.push("/login"); return; }
    if (user.role !== "teacher") { router.push("/student"); return; }
    loadData();
  }, [authLoading, token, user]);

  const loadData = async () => {
    if (!token) return;
    try {
      const [courseData, classData] = await Promise.all([coursesApi.list(token), classesApi.list(token)]);
      setCourseList(courseData.courses);
      setClassList(classData.classes);
      if (classData.classes.length > 0 && !selectedClassId) setSelectedClassId(classData.classes[0].id);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!token || !title.trim() || !selectedClassId) return;
    setCreating(true);
    try {
      await coursesApi.create(token, { class_id: selectedClassId, title: title.trim(), description: description.trim() || undefined });
      setTitle(""); setDescription(""); setShowCreate(false);
      loadData();
    } catch (e: any) { console.error(e); }
    finally { setCreating(false); }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#FAFBFD] relative">

      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-[#00274C]/6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/teacher" className="text-[#00274C]/40 hover:text-[#00274C]/70 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="w-px h-5 bg-[#00274C]/6" />
            <h1 className="text-base font-semibold text-[#00274C]">Courses</h1>
            <span className="tag tag-amber">Teacher</span>
          </div>
          <button onClick={() => setShowCreate(!showCreate)} className={showCreate ? "btn-ghost text-xs" : "btn-primary text-xs"}>
            {showCreate ? "Cancel" : "+ New Course"}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 relative z-10">
        {showCreate && (
          <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 space-y-4 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#00274C]/5 to-transparent rounded-bl-full" />
            <h2 className="text-lg font-bold text-[#00274C]">Create New Course</h2>
            <div>
              <label className="text-xs font-semibold text-[#00274C]/50 uppercase tracking-wider mb-2 block">Class</label>
              <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}
                className="input-dark w-full">
                {classList.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#00274C]/50 uppercase tracking-wider mb-2 block">Course Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Introduction to Physics" className="input-dark w-full" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#00274C]/50 uppercase tracking-wider mb-2 block">Description (optional)</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" className="input-dark w-full" />
            </div>
            <button onClick={handleCreate} disabled={creating || !title.trim() || !selectedClassId} className="btn-primary disabled:opacity-30">
              {creating ? "Creating..." : "Create Course"}
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (<div key={i} className="bg-white/80 border border-[#00274C]/6 rounded-2xl animate-pulse h-44" />))}
          </div>
        ) : courseList.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4 opacity-30">📚</div>
            <p className="text-[#00274C]/40">No courses yet. Create one to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courseList.map((course) => (
              <Link key={course.id} href={`/teacher/courses/${course.id}`}>
                <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 cursor-pointer group h-48 flex flex-col justify-between shadow-sm hover:shadow-md transition-all">
                  <div>
                    <h3 className="font-semibold text-base text-[#00274C] mb-2 group-hover:text-[#00274C]/80 transition-colors">{course.title}</h3>
                    {course.description && (<p className="text-[#00274C]/40 text-sm line-clamp-2">{course.description}</p>)}
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-[#00274C]/6">
                    <span className="text-[10px] text-[#00274C]/25 uppercase tracking-wider font-semibold">
                      {course.materials_count} material{course.materials_count !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs text-[#00274C]/25">{new Date(course.created_at).toLocaleDateString()}</span>
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
