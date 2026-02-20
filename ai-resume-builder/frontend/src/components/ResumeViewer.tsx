import { useState, useRef, useEffect } from 'react';

// Using a simple type for the resume state
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
}

export interface Suggestion {
    id: string;
    originalText: string;
    proposedText: string;
    explanation?: string;
    status: 'pending';
}

interface Props {
    data: ResumeState | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onUpdate?: (section: keyof ResumeState, newContent: any) => void;
    suggestions?: Suggestion[];
    onApprove?: (id: string) => Promise<void>;
    onReject?: (id: string) => Promise<void>;
    onOverflowChange?: (isOverflowing: boolean) => void;
}

/* ─── Suggestion Overlay ──────────────────────────────────── */
function SuggestionOverlay({
    originalText,
    suggestions,
    activeSuggestionId,
    setActiveSuggestionId,
    onApprove,
    onReject,
    children
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

    const suggestion = suggestions.find(s => s.originalText?.trim() === originalText?.trim());
    if (!suggestion) return <>{children}</>;

    const isActive = activeSuggestionId === suggestion.id;

    return (
        <span
            className="relative inline-block w-full group/suggestion"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* The text itself — completely clean, no visible decoration */}
            <span className={`relative block transition-all duration-300 ${isActive ? 'bg-blue-50/30 rounded-md -mx-1.5 px-1.5' : ''
                }`}>
                {children}
            </span>

            {/* Indicator dot → expands to pill on hover */}
            {!isActive && (
                <button
                    onClick={() => setActiveSuggestionId(suggestion.id)}
                    className={`absolute right-0 top-0 z-10 flex items-center gap-1 transition-all duration-300 ease-out no-print ${hovered
                        ? 'bg-blue-600 text-white px-2.5 py-1 rounded-full shadow-lg -translate-y-1'
                        : 'bg-blue-500 w-2 h-2 rounded-full translate-x-3'
                        }`}
                    title="View AI Suggestion"
                >
                    {hovered && <span className="text-[11px] font-medium whitespace-nowrap">✨ View edit</span>}
                </button>
            )}

            {/* Popover card */}
            {isActive && (
                <div className="absolute left-0 top-full mt-3 z-50 w-[380px] bg-white rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] border border-gray-200/80 overflow-hidden flex flex-col no-print ring-1 ring-black/[0.03]">
                    <div className="px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex justify-between items-center">
                        <span className="text-sm font-semibold flex items-center gap-2">✨ AI Suggestion</span>
                        <button onClick={() => setActiveSuggestionId(null)} className="text-white/70 hover:text-white transition-colors p-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div className="p-4 space-y-3">
                        {suggestion.explanation && (
                            <p className="text-xs text-indigo-700 bg-indigo-50 px-3 py-2 rounded-lg border border-indigo-100/60 leading-relaxed">
                                💡 {suggestion.explanation}
                            </p>
                        )}
                        <div className="space-y-2">
                            <div className="text-sm text-gray-500 line-through decoration-red-400/70 decoration-2 bg-red-50/40 px-3 py-2 rounded-lg leading-relaxed">{originalText}</div>
                            <div className="text-sm text-gray-900 font-medium bg-green-50/50 px-3 py-2 rounded-lg border border-green-200/60 leading-relaxed">{suggestion.proposedText}</div>
                        </div>
                    </div>
                    <div className="flex gap-2 px-4 py-3 bg-gray-50/80 border-t border-gray-100">
                        <button
                            onClick={() => { onApprove(suggestion.id); setActiveSuggestionId(null); }}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-xl text-sm shadow-sm transition-all flex items-center justify-center gap-1.5"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                            Accept
                        </button>
                        <button
                            onClick={() => { onReject(suggestion.id); setActiveSuggestionId(null); }}
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

/* ─── Invisible Editable Text ─────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EditableText = ({ value, onSave, className = "", isEditable, Tag = "span" }: { value: string, onSave: (v: string) => void, className?: string, isEditable: boolean, Tag?: any }) => (
    <Tag
        className={`${className} ${isEditable ? 'outline-none cursor-text editable-field' : ''}`}
        contentEditable={isEditable}
        suppressContentEditableWarning={true}
        onBlur={(e: React.FocusEvent<HTMLElement>) => {
            if (isEditable && e.currentTarget.innerText !== value) {
                onSave(e.currentTarget.innerText);
            }
        }}
    >
        {value}
    </Tag>
);

/* ─── Page Break Indicator ────────────────────────────────── */
function PageBreakLine() {
    return <div className="page-break-indicator no-print" />;
}

/* ─── Resume Viewer ───────────────────────────────────────── */
export default function ResumeViewer({ data, onUpdate, suggestions, onApprove, onReject, onOverflowChange }: Props) {
    const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Click-outside to dismiss suggestion popover
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setActiveSuggestionId(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Overflow detection — check if content exceeds one A4 page (297mm ≈ 1122px at 96dpi)
    useEffect(() => {
        if (!containerRef.current || !onOverflowChange) return;

        const checkOverflow = () => {
            const el = containerRef.current;
            if (!el) return;
            // A4 page = 297mm. Convert to px using the element's actual rendered width ratio.
            // 210mm CSS width maps to el.clientWidth, so 297mm = el.clientWidth * (297/210)
            const pageHeightPx = el.clientWidth * (297 / 210);
            const contentHeight = el.scrollHeight;
            const isOverflowing = contentHeight > pageHeightPx + 4; // small tolerance
            onOverflowChange(isOverflowing);
        };

        checkOverflow();

        const observer = new MutationObserver(checkOverflow);
        observer.observe(containerRef.current, { childList: true, subtree: true, characterData: true });
        const resizeObs = new ResizeObserver(checkOverflow);
        resizeObs.observe(containerRef.current);

        return () => {
            observer.disconnect();
            resizeObs.disconnect();
        };
    }, [data, onOverflowChange]);

    // Calculate page break positions
    const [pageBreaks, setPageBreaks] = useState<number[]>([]);
    useEffect(() => {
        if (!containerRef.current) return;

        const calculateBreaks = () => {
            const el = containerRef.current;
            if (!el) return;
            // A4 = 297mm, padding = 20mm top + 20mm bottom, so content area per page = 257mm
            // Convert to px: 257mm * (96/25.4) ≈ 971px
            // Full page including padding: 297mm * (96/25.4) ≈ 1122px
            const pageHeightPx = 297 * (96 / 25.4); // ~1122px
            const totalHeight = el.scrollHeight;
            const breaks: number[] = [];

            let pos = pageHeightPx;
            while (pos < totalHeight) {
                breaks.push(pos);
                pos += pageHeightPx;
            }
            setPageBreaks(breaks);
        };

        calculateBreaks();
        const observer = new MutationObserver(calculateBreaks);
        observer.observe(containerRef.current, { childList: true, subtree: true, characterData: true });
        const resizeObs = new ResizeObserver(calculateBreaks);
        resizeObs.observe(containerRef.current);

        return () => {
            observer.disconnect();
            resizeObs.disconnect();
        };
    }, [data]);

    if (!data) return <div className="text-gray-400 flex items-center justify-center h-full text-sm">Loading Resume...</div>;

    const isEditable = !!onUpdate;

    const updateBasics = (key: keyof ResumeState['basics'], val: string) => {
        onUpdate?.('basics', { ...data.basics, [key]: val });
    };

    const updateArrayItem = <T extends 'education' | 'experience' | 'projects'>(
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

    const updateArrayBullet = <T extends 'experience' | 'projects'>(
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

    return (
        <div
            ref={containerRef}
            className="resume-page text-sm leading-snug relative"
        >
            {/* Page break indicators */}
            {pageBreaks.map((pos, idx) => (
                <div key={idx} style={{ position: 'absolute', top: `${pos}px`, left: 0, right: 0 }}>
                    <PageBreakLine />
                </div>
            ))}

            {/* Header */}
            <div className="text-center mb-6">
                <EditableText
                    Tag="h1"
                    className="text-3xl font-bold tracking-tight text-gray-900 mb-1 uppercase block"
                    value={data.basics.name}
                    isEditable={isEditable}
                    onSave={(v) => updateBasics('name', v)}
                />
                <div className="flex justify-center items-center gap-2 text-gray-600 font-medium flex-wrap">
                    <EditableText value={data.basics.phone} isEditable={isEditable} onSave={(v) => updateBasics('phone', v)} />
                    <span className="text-gray-300">|</span>
                    <EditableText value={data.basics.email} isEditable={isEditable} onSave={(v) => updateBasics('email', v)} />
                    <span className="text-gray-300">|</span>
                    <EditableText value={data.basics.linkedin} isEditable={isEditable} onSave={(v) => updateBasics('linkedin', v)} />
                    <span className="text-gray-300">|</span>
                    <EditableText value={data.basics.github} isEditable={isEditable} onSave={(v) => updateBasics('github', v)} />
                </div>
            </div>

            {/* Education */}
            {data.education && data.education.length > 0 && (
                <div className="mb-4">
                    <h2 className="text-md font-bold text-gray-900 border-b border-gray-300 mb-2 uppercase pb-1 tracking-wide">
                        Education
                    </h2>
                    {data.education.map((edu, idx) => (
                        <div key={idx} className="flex justify-between items-start mb-2">
                            <div>
                                <div className="font-semibold text-gray-800">
                                    <EditableText value={edu.degree} isEditable={isEditable} onSave={(v) => updateArrayItem('education', idx, 'degree', v)} />
                                    {' '}—{' '}
                                    <span className="font-medium text-gray-700">
                                        <EditableText value={edu.institution} isEditable={isEditable} onSave={(v) => updateArrayItem('education', idx, 'institution', v)} />
                                    </span>
                                </div>
                            </div>
                            <div className="text-right text-gray-600 font-medium whitespace-nowrap text-xs">
                                <div><EditableText value={edu.date} isEditable={isEditable} onSave={(v) => updateArrayItem('education', idx, 'date', v)} /></div>
                                {edu.gpa && <div>GPA: <EditableText value={edu.gpa} isEditable={isEditable} onSave={(v) => updateArrayItem('education', idx, 'gpa', v)} /></div>}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Experience */}
            {data.experience && data.experience.length > 0 && (
                <div className="mb-4">
                    <h2 className="text-md font-bold text-gray-900 border-b border-gray-300 mb-2 uppercase pb-1 tracking-wide">
                        Experience
                    </h2>
                    {data.experience.map((exp, idx) => (
                        <div key={idx} className="mb-3">
                            <div className="flex justify-between items-start mb-1">
                                <div>
                                    <div className="font-bold text-gray-800">
                                        <EditableText value={exp.title} isEditable={isEditable} onSave={(v) => updateArrayItem('experience', idx, 'title', v)} />
                                        {' '}<span className="font-normal text-gray-500">— <EditableText value={exp.company} isEditable={isEditable} onSave={(v) => updateArrayItem('experience', idx, 'company', v)} /></span>
                                    </div>
                                </div>
                                <div className="text-right text-gray-600 font-medium whitespace-nowrap text-xs">
                                    <div><EditableText value={exp.date} isEditable={isEditable} onSave={(v) => updateArrayItem('experience', idx, 'date', v)} /></div>
                                    <div><EditableText value={exp.location} isEditable={isEditable} onSave={(v) => updateArrayItem('experience', idx, 'location', v)} /></div>
                                </div>
                            </div>
                            <ul className="list-disc pl-5 mt-1 text-gray-700 space-y-1.5">
                                {exp.bullets?.map((b, bIdx) => (
                                    <li key={bIdx} className="leading-relaxed">
                                        {wrapSuggestion(b,
                                            <EditableText
                                                className="block"
                                                value={b}
                                                isEditable={isEditable}
                                                onSave={(v) => updateArrayBullet('experience', idx, bIdx, v)}
                                            />
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}

            {/* Projects */}
            {data.projects && data.projects.length > 0 && (
                <div className="mb-4">
                    <h2 className="text-md font-bold text-gray-900 border-b border-gray-300 mb-2 uppercase pb-1 tracking-wide">
                        Projects
                    </h2>
                    {data.projects.map((proj, idx) => (
                        <div key={idx} className="mb-2">
                            <div className="font-bold text-gray-800 mb-1">
                                <EditableText value={proj.name} isEditable={isEditable} onSave={(v) => updateArrayItem('projects', idx, 'name', v)} />
                                {' '}<span className="font-normal text-gray-500">| <EditableText value={proj.techStack} isEditable={isEditable} onSave={(v) => updateArrayItem('projects', idx, 'techStack', v)} /></span>
                            </div>
                            <ul className="list-disc pl-5 mt-1 text-gray-700 space-y-1.5">
                                {proj.bullets?.map((b, bIdx) => (
                                    <li key={bIdx} className="leading-relaxed">
                                        {wrapSuggestion(b,
                                            <EditableText
                                                className="block"
                                                value={b}
                                                isEditable={isEditable}
                                                onSave={(v) => updateArrayBullet('projects', idx, bIdx, v)}
                                            />
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}

            {/* Skills */}
            {data.skills && (
                <div className="mb-4">
                    <h2 className="text-md font-bold text-gray-900 border-b border-gray-300 mb-2 uppercase pb-1 tracking-wide">
                        Skills
                    </h2>
                    <div className="grid grid-cols-1 gap-1 text-gray-800">
                        {data.skills.languages && data.skills.languages.length > 0 && (
                            <div className="flex"><span className="font-semibold w-24 flex-shrink-0">Languages:</span>
                                <EditableText value={data.skills.languages.join(", ")} isEditable={isEditable} onSave={(v) => onUpdate?.('skills', { ...data.skills, languages: v.split(',').map(s => s.trim()) })} />
                            </div>
                        )}
                        {data.skills.frameworks && data.skills.frameworks.length > 0 && (
                            <div className="flex"><span className="font-semibold w-24 flex-shrink-0">Frameworks:</span>
                                <EditableText value={data.skills.frameworks.join(", ")} isEditable={isEditable} onSave={(v) => onUpdate?.('skills', { ...data.skills, frameworks: v.split(',').map(s => s.trim()) })} />
                            </div>
                        )}
                        {data.skills.tools && data.skills.tools.length > 0 && (
                            <div className="flex"><span className="font-semibold w-24 flex-shrink-0">Tools:</span>
                                <EditableText value={data.skills.tools.join(", ")} isEditable={isEditable} onSave={(v) => onUpdate?.('skills', { ...data.skills, tools: v.split(',').map(s => s.trim()) })} />
                            </div>
                        )}
                        {data.skills.softSkills && data.skills.softSkills.length > 0 && (
                            <div className="flex"><span className="font-semibold w-24 flex-shrink-0">Soft Skills:</span>
                                <EditableText value={data.skills.softSkills.join(", ")} isEditable={isEditable} onSave={(v) => onUpdate?.('skills', { ...data.skills, softSkills: v.split(',').map(s => s.trim()) })} />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
