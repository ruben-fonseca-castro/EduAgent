"use client";

import { useState, useRef, useEffect } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResumeState {
  basics: {
    name: string;
    email: string;
    phone: string;
    linkedin: string;
    github: string;
  };
  education: Array<{
    degree: string;
    institution: string;
    date: string;
    gpa: string;
  }>;
  experience: Array<{
    title: string;
    company: string;
    location: string;
    date: string;
    bullets: string[];
  }>;
  projects: Array<{
    name: string;
    techStack: string;
    bullets: string[];
  }>;
  skills: {
    languages: string[];
    frameworks: string[];
    tools: string[];
    softSkills: string[];
  };
  _has_uploaded_text?: boolean;
}

export interface Suggestion {
  id: string;
  originalText: string;
  proposedText: string;
  explanation?: string;
  status: "pending";
}

interface Props {
  data: ResumeState | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdate?: (section: keyof ResumeState, newContent: any) => void;
  suggestions?: Suggestion[];
  onApprove?: (id: string) => Promise<void>;
  onFileUpload?: (file: File) => Promise<void>;
  onReject?: (id: string) => Promise<void>;
  onOverflowChange?: (isOverflowing: boolean) => void;
}

// Hidden file input ref for the empty state upload button
let _fileInputRef: HTMLInputElement | null = null;

// ── Suggestion Overlay ───────────────────────────────────────────────────────

function SuggestionOverlay({
  originalText,
  suggestions,
  activeSuggestionId,
  setActiveSuggestionId,
  onApprove,
  onReject,
  children,
}: {
  originalText: string;
  suggestions?: Suggestion[];
  activeSuggestionId: string | null;
  setActiveSuggestionId: (id: string | null) => void;
  onApprove?: (id: string) => Promise<void>;
  onReject?: (id: string) => Promise<void>;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  if (!suggestions || !onApprove || !onReject) return <>{children}</>;

  const suggestion = suggestions.find(
    (s) => s.originalText?.trim() === originalText?.trim()
  );
  if (!suggestion) return <>{children}</>;

  const isActive = activeSuggestionId === suggestion.id;

  return (
    <span
      className="relative inline-block w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        className={`relative block transition-all duration-300 ${
          isActive ? "bg-blue-50/30 rounded-md -mx-1.5 px-1.5" : ""
        }`}
      >
        {children}
      </span>

      {/* Indicator dot → expands to pill on hover */}
      {!isActive && (
        <button
          onClick={() => setActiveSuggestionId(suggestion.id)}
          className={`absolute right-0 top-0 z-10 flex items-center gap-1 transition-all duration-300 ease-out ${
            hovered
              ? "bg-blue-600 text-white px-2.5 py-1 rounded-full shadow-lg -translate-y-1"
              : "bg-blue-500 w-2 h-2 rounded-full translate-x-3"
          }`}
          title="View AI Suggestion"
        >
          {hovered && (
            <span className="text-[11px] font-medium whitespace-nowrap">
              View edit
            </span>
          )}
        </button>
      )}

      {/* Popover card */}
      {isActive && (
        <div className="absolute left-0 top-full mt-3 z-50 w-[380px] bg-white rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] border border-gray-200/80 overflow-hidden flex flex-col ring-1 ring-black/[0.03]">
          <div className="px-4 py-3 bg-gradient-to-r from-[#00274C] to-[#1B365D] text-white flex justify-between items-center">
            <span className="text-sm font-semibold flex items-center gap-2">
              AI Suggestion
            </span>
            <button
              onClick={() => setActiveSuggestionId(null)}
              className="text-white/70 hover:text-white transition-colors p-0.5"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="p-4 space-y-3">
            {suggestion.explanation && (
              <p className="text-xs text-indigo-700 bg-indigo-50 px-3 py-2 rounded-lg border border-indigo-100/60 leading-relaxed">
                {suggestion.explanation}
              </p>
            )}
            <div className="space-y-2">
              <div className="text-sm text-gray-500 line-through decoration-red-400/70 decoration-2 bg-red-50/40 px-3 py-2 rounded-lg leading-relaxed">
                {originalText}
              </div>
              <div className="text-sm text-gray-900 font-medium bg-green-50/50 px-3 py-2 rounded-lg border border-green-200/60 leading-relaxed">
                {suggestion.proposedText}
              </div>
            </div>
          </div>
          <div className="flex gap-2 px-4 py-3 bg-gray-50/80 border-t border-gray-100">
            <button
              onClick={() => {
                onApprove(suggestion.id);
                setActiveSuggestionId(null);
              }}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 rounded-xl text-sm shadow-sm transition-all flex items-center justify-center gap-1.5"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
              Accept
            </button>
            <button
              onClick={() => {
                onReject(suggestion.id);
                setActiveSuggestionId(null);
              }}
              className="px-5 bg-white hover:bg-gray-100 text-gray-600 font-medium py-2 rounded-xl border border-gray-200 text-sm shadow-sm transition-all"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

// ── Editable Text ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EditableText = ({
  value,
  onSave,
  className = "",
  isEditable,
  Tag = "span",
  placeholder = "Click to type...",
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  isEditable: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Tag?: any;
  placeholder?: string;
}) => {
  const elRef = useRef<HTMLElement>(null);

  // Sync DOM text with value prop when it changes externally (e.g. AI updates)
  useEffect(() => {
    if (elRef.current && document.activeElement !== elRef.current) {
      if (elRef.current.innerText !== value) {
        elRef.current.innerText = value;
      }
    }
  }, [value]);

  return (
    <Tag
      ref={elRef}
      className={`${className} ${
        isEditable
          ? "outline-none cursor-text hover:bg-blue-50/60 focus:bg-blue-50 focus:ring-1 focus:ring-blue-300/50 rounded px-0.5 -mx-0.5 transition-all"
          : ""
      }`}
      contentEditable={isEditable}
      suppressContentEditableWarning={true}
      data-placeholder={isEditable ? placeholder : undefined}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        if (isEditable && e.currentTarget.innerText !== value) {
          onSave(e.currentTarget.innerText);
        }
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        // Enter on single-line fields saves and blurs
        if (e.key === "Enter" && Tag !== "div") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    >
      {value || (isEditable ? "" : "")}
    </Tag>
  );
};

// ── Resume Viewer ────────────────────────────────────────────────────────────

export default function ResumeViewer({
  data,
  onUpdate,
  suggestions,
  onApprove,
  onReject,
  onOverflowChange,
  onFileUpload,
}: Props) {
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(
    null
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside to dismiss suggestion popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setActiveSuggestionId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Overflow detection
  useEffect(() => {
    if (!containerRef.current || !onOverflowChange) return;

    const checkOverflow = () => {
      const el = containerRef.current;
      if (!el) return;
      const pageHeightPx = el.clientWidth * (297 / 210);
      const contentHeight = el.scrollHeight;
      onOverflowChange(contentHeight > pageHeightPx + 4);
    };

    checkOverflow();
    const observer = new MutationObserver(checkOverflow);
    observer.observe(containerRef.current, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const resizeObs = new ResizeObserver(checkOverflow);
    resizeObs.observe(containerRef.current);

    return () => {
      observer.disconnect();
      resizeObs.disconnect();
    };
  }, [data, onOverflowChange]);

  if (!data)
    return (
      <div className="text-[#00274C]/30 flex items-center justify-center h-full text-sm">
        Loading Resume...
      </div>
    );

  const isEditable = !!onUpdate;

  const updateBasics = (key: keyof ResumeState["basics"], val: string) => {
    onUpdate?.("basics", { ...data.basics, [key]: val });
  };

  const updateArrayItem = <
    T extends "education" | "experience" | "projects"
  >(
    section: T,
    idx: number,
    key: keyof ResumeState[T][0],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    val: any
  ) => {
    const newArray = [...data[section]];
    newArray[idx] = { ...newArray[idx], [key]: val };
    onUpdate?.(section, newArray);
  };

  const updateArrayBullet = <T extends "experience" | "projects">(
    section: T,
    idx: number,
    bIdx: number,
    val: string
  ) => {
    const newArray = [...data[section]];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newBullets = [...(newArray[idx] as any).bullets];
    newBullets[bIdx] = val;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (newArray[idx] as any).bullets = newBullets;
    onUpdate?.(section, newArray);
  };

  const wrapSuggestion = (text: string, children: React.ReactNode) => (
    <SuggestionOverlay
      originalText={text}
      suggestions={suggestions}
      activeSuggestionId={activeSuggestionId}
      setActiveSuggestionId={setActiveSuggestionId}
      onApprove={onApprove}
      onReject={onReject}
    >
      {children}
    </SuggestionOverlay>
  );

  const isEmpty = !data.basics.name && data.education.length === 0 && data.experience.length === 0;

  if (isEmpty) {
    return (
      <div
        ref={containerRef}
        className="bg-white rounded-2xl border border-[#00274C]/6 p-12 text-center min-h-[600px] flex flex-col items-center justify-center"
      >
        <input
          type="file"
          ref={(el) => { _fileInputRef = el; }}
          className="hidden"
          accept=".pdf,.docx,.doc,.txt"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && onFileUpload) onFileUpload(file);
            if (_fileInputRef) _fileInputRef.value = "";
          }}
        />
        <div className="w-16 h-16 rounded-2xl bg-[#00274C]/5 flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#00274C]/30">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-[#00274C] mb-2">No Resume Yet</h3>
        <p className="text-sm text-[#00274C]/50 max-w-sm mb-6">
          Upload your existing resume to get started, or ask the AI in the chat to build one from scratch.
        </p>
        <button
          onClick={() => _fileInputRef?.click()}
          className="btn-primary px-6 py-3 text-sm flex items-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload Resume (PDF, DOCX, TXT)
        </button>
      </div>
    );
  }

  // ── Add / remove helpers ────────────────────────────────────────────────
  const addEducation = () => {
    onUpdate?.("education", [...data.education, { degree: "Degree", institution: "University", date: "20XX – 20XX", gpa: "" }]);
  };
  const removeEducation = (idx: number) => {
    onUpdate?.("education", data.education.filter((_, i) => i !== idx));
  };
  const addExperience = () => {
    onUpdate?.("experience", [...data.experience, { title: "Job Title", company: "Company", location: "", date: "20XX – 20XX", bullets: ["Describe what you did"] }]);
  };
  const removeExperience = (idx: number) => {
    onUpdate?.("experience", data.experience.filter((_, i) => i !== idx));
  };
  const addExperienceBullet = (idx: number) => {
    const newArr = [...data.experience];
    newArr[idx] = { ...newArr[idx], bullets: [...newArr[idx].bullets, "New bullet point"] };
    onUpdate?.("experience", newArr);
  };
  const removeExperienceBullet = (idx: number, bIdx: number) => {
    const newArr = [...data.experience];
    newArr[idx] = { ...newArr[idx], bullets: newArr[idx].bullets.filter((_, i) => i !== bIdx) };
    onUpdate?.("experience", newArr);
  };
  const addProject = () => {
    onUpdate?.("projects", [...data.projects, { name: "Project Name", techStack: "Tech Stack", bullets: ["Describe what you built"] }]);
  };
  const removeProject = (idx: number) => {
    onUpdate?.("projects", data.projects.filter((_, i) => i !== idx));
  };
  const addProjectBullet = (idx: number) => {
    const newArr = [...data.projects];
    newArr[idx] = { ...newArr[idx], bullets: [...newArr[idx].bullets, "New bullet point"] };
    onUpdate?.("projects", newArr);
  };
  const removeProjectBullet = (idx: number, bIdx: number) => {
    const newArr = [...data.projects];
    newArr[idx] = { ...newArr[idx], bullets: newArr[idx].bullets.filter((_, i) => i !== bIdx) };
    onUpdate?.("projects", newArr);
  };

  // Small + / x button for add/remove actions (only visible on hover, no-print)
  const AddBtn = ({ onClick, label }: { onClick: () => void; label: string }) => (
    <button
      onClick={onClick}
      className="no-print opacity-0 group-hover/section:opacity-100 transition-opacity inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-1.5 py-0.5 mt-1"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      {label}
    </button>
  );
  const RemoveBtn = ({ onClick }: { onClick: () => void }) => (
    <button
      onClick={onClick}
      className="no-print opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 hover:bg-red-50 rounded p-0.5 ml-1"
      title="Remove"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  );

  return (
    <div
      ref={containerRef}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-sm leading-snug relative"
      style={{ width: "210mm", minHeight: "297mm" }}
    >
      {/* Header */}
      <div className="text-center mb-6">
        <EditableText
          Tag="h1"
          className="text-3xl font-bold tracking-tight text-gray-900 mb-1 uppercase block"
          value={data.basics.name}
          isEditable={isEditable}
          onSave={(v: string) => updateBasics("name", v)}
          placeholder="Your Name"
        />
        <div className="flex justify-center items-center gap-2 text-gray-600 font-medium flex-wrap">
          <EditableText
            value={data.basics.phone}
            isEditable={isEditable}
            onSave={(v: string) => updateBasics("phone", v)}
            placeholder="Phone"
          />
          <span className="text-gray-300">|</span>
          <EditableText
            value={data.basics.email}
            isEditable={isEditable}
            onSave={(v: string) => updateBasics("email", v)}
            placeholder="Email"
          />
          <span className="text-gray-300">|</span>
          <EditableText
            value={data.basics.linkedin}
            isEditable={isEditable}
            onSave={(v: string) => updateBasics("linkedin", v)}
            placeholder="LinkedIn"
          />
          <span className="text-gray-300">|</span>
          <EditableText
            value={data.basics.github}
            isEditable={isEditable}
            onSave={(v: string) => updateBasics("github", v)}
            placeholder="GitHub"
          />
        </div>
      </div>

      {/* Education */}
      <div className="mb-4 group/section">
        <h2 className="text-md font-bold text-gray-900 border-b border-gray-300 mb-2 uppercase pb-1 tracking-wide">
          Education
        </h2>
        {data.education.map((edu, idx) => (
          <div key={idx} className="flex justify-between items-start mb-2 group">
            <div>
              <div className="font-semibold text-gray-800">
                <EditableText
                  value={edu.degree}
                  isEditable={isEditable}
                  onSave={(v: string) =>
                    updateArrayItem("education", idx, "degree", v)
                  }
                  placeholder="Degree"
                />
                {" "}&mdash;{" "}
                <span className="font-medium text-gray-700">
                  <EditableText
                    value={edu.institution}
                    isEditable={isEditable}
                    onSave={(v: string) =>
                      updateArrayItem("education", idx, "institution", v)
                    }
                    placeholder="Institution"
                  />
                </span>
                {isEditable && <RemoveBtn onClick={() => removeEducation(idx)} />}
              </div>
            </div>
            <div className="text-right text-gray-600 font-medium whitespace-nowrap text-xs">
              <div>
                <EditableText
                  value={edu.date}
                  isEditable={isEditable}
                  onSave={(v: string) =>
                    updateArrayItem("education", idx, "date", v)
                  }
                  placeholder="Date"
                />
              </div>
              <div>
                GPA:{" "}
                <EditableText
                  value={edu.gpa}
                  isEditable={isEditable}
                  onSave={(v: string) =>
                    updateArrayItem("education", idx, "gpa", v)
                  }
                  placeholder="N/A"
                />
              </div>
            </div>
          </div>
        ))}
        {isEditable && <AddBtn onClick={addEducation} label="Add Education" />}
      </div>

      {/* Experience */}
      <div className="mb-4 group/section">
        <h2 className="text-md font-bold text-gray-900 border-b border-gray-300 mb-2 uppercase pb-1 tracking-wide">
          Experience
        </h2>
        {data.experience.map((exp, idx) => (
          <div key={idx} className="mb-3 group">
            <div className="flex justify-between items-start mb-1">
              <div>
                <div className="font-bold text-gray-800">
                  <EditableText
                    value={exp.title}
                    isEditable={isEditable}
                    onSave={(v: string) =>
                      updateArrayItem("experience", idx, "title", v)
                    }
                    placeholder="Job Title"
                  />
                  {" "}
                  <span className="font-normal text-gray-500">
                    &mdash;{" "}
                    <EditableText
                      value={exp.company}
                      isEditable={isEditable}
                      onSave={(v: string) =>
                        updateArrayItem("experience", idx, "company", v)
                      }
                      placeholder="Company"
                    />
                  </span>
                  {isEditable && <RemoveBtn onClick={() => removeExperience(idx)} />}
                </div>
              </div>
              <div className="text-right text-gray-600 font-medium whitespace-nowrap text-xs">
                <div>
                  <EditableText
                    value={exp.date}
                    isEditable={isEditable}
                    onSave={(v: string) =>
                      updateArrayItem("experience", idx, "date", v)
                    }
                    placeholder="Date"
                  />
                </div>
                <div>
                  <EditableText
                    value={exp.location || ""}
                    isEditable={isEditable}
                    onSave={(v: string) =>
                      updateArrayItem("experience", idx, "location", v)
                    }
                    placeholder="Location"
                  />
                </div>
              </div>
            </div>
            <ul className="list-disc pl-5 mt-1 text-gray-700 space-y-1.5">
              {exp.bullets?.map((b, bIdx) => (
                <li key={bIdx} className="leading-relaxed group/bullet flex items-start gap-0.5">
                  <span className="flex-1">
                    {wrapSuggestion(
                      b,
                      <EditableText
                        className="block"
                        value={b}
                        isEditable={isEditable}
                        onSave={(v: string) =>
                          updateArrayBullet("experience", idx, bIdx, v)
                        }
                        placeholder="Bullet point"
                      />
                    )}
                  </span>
                  {isEditable && (
                    <button
                      onClick={() => removeExperienceBullet(idx, bIdx)}
                      className="no-print opacity-0 group-hover/bullet:opacity-100 text-red-400 hover:text-red-600 p-0.5 flex-shrink-0 mt-0.5"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {isEditable && (
              <button
                onClick={() => addExperienceBullet(idx)}
                className="no-print opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-1.5 py-0.5 ml-5 mt-0.5"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                bullet
              </button>
            )}
          </div>
        ))}
        {isEditable && <AddBtn onClick={addExperience} label="Add Experience" />}
      </div>

      {/* Projects */}
      <div className="mb-4 group/section">
        <h2 className="text-md font-bold text-gray-900 border-b border-gray-300 mb-2 uppercase pb-1 tracking-wide">
          Projects
        </h2>
        {data.projects.map((proj, idx) => (
          <div key={idx} className="mb-2 group">
            <div className="font-bold text-gray-800 mb-1">
              <EditableText
                value={proj.name}
                isEditable={isEditable}
                onSave={(v: string) =>
                  updateArrayItem("projects", idx, "name", v)
                }
                placeholder="Project Name"
              />
              {" "}
              <span className="font-normal text-gray-500">
                |{" "}
                <EditableText
                  value={proj.techStack}
                  isEditable={isEditable}
                  onSave={(v: string) =>
                    updateArrayItem("projects", idx, "techStack", v)
                  }
                  placeholder="Tech Stack"
                />
              </span>
              {isEditable && <RemoveBtn onClick={() => removeProject(idx)} />}
            </div>
            <ul className="list-disc pl-5 mt-1 text-gray-700 space-y-1.5">
              {proj.bullets?.map((b, bIdx) => (
                <li key={bIdx} className="leading-relaxed group/bullet flex items-start gap-0.5">
                  <span className="flex-1">
                    {wrapSuggestion(
                      b,
                      <EditableText
                        className="block"
                        value={b}
                        isEditable={isEditable}
                        onSave={(v: string) =>
                          updateArrayBullet("projects", idx, bIdx, v)
                        }
                        placeholder="Bullet point"
                      />
                    )}
                  </span>
                  {isEditable && (
                    <button
                      onClick={() => removeProjectBullet(idx, bIdx)}
                      className="no-print opacity-0 group-hover/bullet:opacity-100 text-red-400 hover:text-red-600 p-0.5 flex-shrink-0 mt-0.5"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {isEditable && (
              <button
                onClick={() => addProjectBullet(idx)}
                className="no-print opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-1.5 py-0.5 ml-5 mt-0.5"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                bullet
              </button>
            )}
          </div>
        ))}
        {isEditable && <AddBtn onClick={addProject} label="Add Project" />}
      </div>

      {/* Skills */}
      <div className="mb-4">
        <h2 className="text-md font-bold text-gray-900 border-b border-gray-300 mb-2 uppercase pb-1 tracking-wide">
          Skills
        </h2>
        <div className="grid grid-cols-1 gap-1 text-gray-800">
          <div className="flex">
            <span className="font-semibold w-24 flex-shrink-0">
              Languages:
            </span>
            <EditableText
              value={(data.skills.languages || []).join(", ")}
              isEditable={isEditable}
              onSave={(v: string) =>
                onUpdate?.("skills", {
                  ...data.skills,
                  languages: v.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="Python, JavaScript, ..."
            />
          </div>
          <div className="flex">
            <span className="font-semibold w-24 flex-shrink-0">
              Frameworks:
            </span>
            <EditableText
              value={(data.skills.frameworks || []).join(", ")}
              isEditable={isEditable}
              onSave={(v: string) =>
                onUpdate?.("skills", {
                  ...data.skills,
                  frameworks: v.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="React, FastAPI, ..."
            />
          </div>
          <div className="flex">
            <span className="font-semibold w-24 flex-shrink-0">
              Tools:
            </span>
            <EditableText
              value={(data.skills.tools || []).join(", ")}
              isEditable={isEditable}
              onSave={(v: string) =>
                onUpdate?.("skills", {
                  ...data.skills,
                  tools: v.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="Git, Docker, ..."
            />
          </div>
          <div className="flex">
            <span className="font-semibold w-24 flex-shrink-0">
              Soft Skills:
            </span>
            <EditableText
              value={(data.skills.softSkills || []).join(", ")}
              isEditable={isEditable}
              onSave={(v: string) =>
                onUpdate?.("skills", {
                  ...data.skills,
                  softSkills: v.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="Leadership, Communication, ..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
