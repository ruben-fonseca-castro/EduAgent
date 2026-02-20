import React, { useState, useRef, useEffect } from 'react';

interface ChatMessage {
    role: 'user' | 'agent';
    content: string;
}

interface Props {
    onSendMessage: (message: string) => Promise<void>;
    onFileUpload: (file: File) => Promise<void>;
    messages: ChatMessage[];
    loading: boolean;
    mode?: 'edit' | 'analysis' | null;
}

/* ─── Simple Markdown Renderer ────────────────────────────── */
function renderMarkdown(text: string) {
    // Split into lines and process
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: string[] = [];

    const flushList = () => {
        if (listItems.length > 0) {
            elements.push(
                <ul key={`list-${elements.length}`} className="list-disc pl-5 my-1 space-y-0.5">
                    {listItems.map((item, i) => (
                        <li key={i}>{formatInline(item)}</li>
                    ))}
                </ul>
            );
            listItems = [];
        }
    };

    const formatInline = (line: string): React.ReactNode => {
        // Bold: **text**
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i}>{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const bulletMatch = line.match(/^[\s]*[-•*]\s+(.*)/);

        if (bulletMatch) {
            listItems.push(bulletMatch[1]);
        } else {
            flushList();
            if (line.trim() === '') {
                // Skip consecutive empty lines
                if (elements.length > 0) {
                    elements.push(<div key={`br-${i}`} className="h-1" />);
                }
            } else {
                elements.push(
                    <p key={`p-${i}`} className="mb-0.5">{formatInline(line)}</p>
                );
            }
        }
    }
    flushList();
    return elements;
}

export default function ChatPanel({ onSendMessage, onFileUpload, messages, loading, mode }: Props) {
    const [input, setInput] = useState('');
    const endOfMessagesRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || loading) return;
        const msg = input.trim();
        setInput('');
        await onSendMessage(msg);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await onFileUpload(file);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="flex flex-col h-full bg-white/60 backdrop-blur-xl border-r border-gray-200">
            <div className="p-6 border-b border-gray-100 flex-shrink-0">
                <h2 className="text-2xl font-semibold bg-gradient-to-r from-primary-600 to-indigo-600 bg-clip-text text-transparent mb-1">
                    AI Resume Builder
                </h2>
                <p className="text-sm text-gray-500">I can help you build, tailor, and review your resume.</p>
                {mode && (
                    <div className={`mt-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium space-x-1.5 ${mode === 'edit' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-green-100 text-green-800 border border-green-200'
                        }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${mode === 'edit' ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}></div>
                        <span>{mode === 'edit' ? 'Edit Mode' : 'Analysis Mode'}</span>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 font-sans text-sm custom-scrollbar">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${msg.role === 'user'
                                ? 'bg-primary-600 text-white rounded-br-none'
                                : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none shadow-md'
                                }`}
                        >
                            <div className="whitespace-pre-wrap leading-relaxed">
                                {msg.role === 'agent' ? renderMarkdown(msg.content) : msg.content}
                            </div>
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center space-x-1.5">
                            <div className="w-2 h-2 rounded-full bg-primary-400 animate-bounce"></div>
                            <div className="w-2 h-2 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                            <div className="w-2 h-2 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                        </div>
                    </div>
                )}
                <div ref={endOfMessagesRef} />
            </div>

            <div className="p-4 bg-white border-t border-gray-100 flex items-center space-x-2">
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors disabled:opacity-50"
                    title="Upload existing resume (.pdf, .txt)"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.536 4.536 0 01-6.416-6.416l10.82-10.82a2.809 2.809 0 013.974 3.974l-11.23 11.23a1.085 1.085 0 01-1.534-1.534l10.82-10.82" />
                    </svg>
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".pdf,.txt"
                    className="hidden"
                />

                <form onSubmit={handleSubmit} className="relative flex-1">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={loading}
                        placeholder="Type to build or tailor your resume..."
                        className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all text-sm disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={loading || !input.trim()}
                        className="absolute right-2 top-1.5 bottom-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-3 flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                            <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
                        </svg>
                    </button>
                </form>
            </div>
        </div>
    );
}
