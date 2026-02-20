import { useState, useEffect, useRef } from 'react';
import ChatPanel from './components/ChatPanel';
import ResumeViewer, { type ResumeState, type Suggestion } from './components/ResumeViewer';

interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'agent', content: "Hello! I'm your AI Resume Builder. I can help build, format, and tailor your resume. How can I assist you today?" }
  ]);
  const [resumeData, setResumeData] = useState<ResumeState | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastMode, setLastMode] = useState<'edit' | 'analysis' | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [exporting, setExporting] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const resumeRef = useRef<HTMLDivElement>(null);

  const fetchResume = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/resume');
      const data = await res.json();
      setResumeData(data);
    } catch (e) {
      console.error('Failed to fetch resume:', e);
    }
  };

  const fetchSuggestions = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/suggestions');
      const data = await res.json();
      // Only keep suggestions with the new text-replacement format
      setSuggestions(data.filter((s: Suggestion) => s.originalText && s.proposedText));
    } catch (e) {
      console.error('Failed to fetch suggestions:', e);
    }
  };

  useEffect(() => {
    fetchResume();
    fetchSuggestions();
  }, []);

  const handleSendMessage = async (message: string) => {
    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setLoading(true);

    try {
      const chatRes = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: messages.map(m => ({ role: m.role, content: m.content })) })
      });
      const chatData = await chatRes.json();

      setMessages(prev => [...prev, { role: 'agent', content: chatData.reply }]);
      if (chatData.mode) {
        setLastMode(chatData.mode);
      }

      await fetchResume();
      await fetchSuggestions();
    } catch (e) {
      console.error('Chat error:', e);
      setMessages(prev => [...prev, { role: 'agent', content: "Sorry, I encountered an error communicating with the server." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setMessages(prev => [...prev, { role: 'user', content: `[Uploaded File: ${file.name}]` }]);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('resume', file);

      const res = await fetch('http://localhost:3001/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      setMessages(prev => [...prev, { role: 'agent', content: data.reply }]);
      if (data.mode) {
        setLastMode(data.mode);
      }
      await fetchResume();
      await fetchSuggestions();
    } catch (e) {
      console.error('Upload error:', e);
      setMessages(prev => [...prev, { role: 'agent', content: "Sorry, I encountered an error uploading the file." }]);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleUpdateSection = async (section: keyof ResumeState, newContent: any) => {
    setResumeData(prev => prev ? { ...prev, [section]: newContent } : null);
    try {
      await fetch(`http://localhost:3001/api/resume/${section}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newContent)
      });
    } catch (e) {
      console.error(`Failed to update ${section}:`, e);
      await fetchResume();
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await fetch(`http://localhost:3001/api/suggestions/${id}/approve`, { method: 'POST' });
      await fetchSuggestions();
      await fetchResume();
    } catch (e) { console.error(e); }
  };

  const handleReject = async (id: string) => {
    try {
      await fetch(`http://localhost:3001/api/suggestions/${id}/reject`, { method: 'POST' });
      await fetchSuggestions();
    } catch (e) { console.error(e); }
  };

  const handleApproveAll = async () => {
    try {
      await fetch(`http://localhost:3001/api/suggestions/approve-all`, { method: 'POST' });
      await fetchSuggestions();
      await fetchResume();
    } catch (e) { console.error(e); }
  };

  const handleRejectAll = async () => {
    try {
      await fetch('http://localhost:3001/api/suggestions/reject-all', { method: 'POST' });
      await fetchSuggestions();
    } catch (e) { console.error(e); }
  };

  const handleExportPdf = async () => {
    if (!resumeRef.current || exporting) return;
    setExporting(true);
    try {
      const source = resumeRef.current;

      // Build a standalone HTML document with fully inlined styles
      const deepCloneInlined = (node: Node): Node => {
        if (node instanceof HTMLElement) {
          if (node.classList.contains('no-print')) {
            return document.createDocumentFragment();
          }
          const clone = node.cloneNode(false) as HTMLElement;
          const computed = getComputedStyle(node);
          let css = '';
          for (let i = 0; i < computed.length; i++) {
            const prop = computed[i];
            css += `${prop}:${computed.getPropertyValue(prop)};`;
          }
          clone.removeAttribute('class');
          clone.removeAttribute('contenteditable');
          clone.setAttribute('style', css);

          for (const child of node.childNodes) {
            const clonedChild = deepCloneInlined(child);
            clone.appendChild(clonedChild);
          }
          return clone;
        }
        return node.cloneNode(true);
      };

      const clonedContent = deepCloneInlined(source) as HTMLElement;

      // Create an iframe for isolated printing  
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.width = '210mm';
      iframe.style.height = '297mm';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument!;
      iframeDoc.open();
      iframeDoc.write(`<!DOCTYPE html>
        <html><head>
          <title>${resumeData?.basics?.name || 'Resume'}</title>
          <style>
            @page { size: A4; margin: 0; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { margin: 0; padding: 0; }
          </style>
        </head><body></body></html>`);
      iframeDoc.close();
      iframeDoc.body.appendChild(clonedContent);

      // Small delay for rendering
      await new Promise(r => setTimeout(r, 500));

      iframe.contentWindow!.print();

      // Clean up after a delay
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 2000);
    } catch (e) {
      console.error('PDF export failed:', e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex bg-background font-sans h-screen w-screen overflow-hidden">
      {/* Left Canvas Panel (Resume) */}
      <div className="flex-1 h-full overflow-y-auto bg-gray-100 flex items-start justify-center p-8 no-print-bg print-container resume-scroll">
        <div className="w-full max-w-[210mm] mx-auto flex flex-col gap-4 mb-8">
          {/* Action Bar */}
          <div className="flex justify-between items-center no-print">
            <div>
              {suggestions.length > 0 && (
                <div className="flex items-center gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/60 px-4 py-2.5 rounded-xl shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    <span className="text-sm font-medium text-blue-900">
                      {suggestions.length} AI suggestion{suggestions.length !== 1 ? 's' : ''} ready
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleApproveAll}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg shadow-sm transition-all"
                    >
                      Accept All
                    </button>
                    <button
                      onClick={handleRejectAll}
                      className="px-3 py-1 bg-white hover:bg-gray-50 text-gray-600 text-xs font-medium rounded-lg border border-gray-200 shadow-sm transition-all"
                    >
                      Dismiss All
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleExportPdf}
              disabled={exporting}
              className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl shadow-sm transition-all border border-gray-200 flex items-center space-x-2 disabled:opacity-60"
            >
              {exporting ? (
                <>
                  <svg className="animate-spin w-4 h-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <span>Exporting…</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  <span>Export PDF</span>
                </>
              )}
            </button>
          </div>

          {/* Overflow warning */}
          {isOverflowing && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200/60 px-4 py-2 rounded-xl text-amber-800 text-xs font-medium no-print">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>Resume exceeds one page — ask the AI to condense it, or shorten/remove entries manually.</span>
            </div>
          )}

          <div ref={resumeRef} data-pdf-root>
            <ResumeViewer
              data={resumeData}
              onUpdate={handleUpdateSection}
              suggestions={suggestions}
              onApprove={handleApprove}
              onReject={handleReject}
              onOverflowChange={setIsOverflowing}
            />
          </div>
        </div>
      </div>

      {/* Right Interface Panel (Chat) */}
      <div className="w-[450px] flex-shrink-0 h-full flex flex-col shadow-2xl z-10 no-print border-l border-gray-200">
        <ChatPanel
          onSendMessage={handleSendMessage}
          onFileUpload={handleFileUpload}
          messages={messages}
          loading={loading}
          mode={lastMode}
        />
      </div>
    </div>
  );
}
