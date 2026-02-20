import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { runAgent } from './graph.js';
import { setupMcpClient } from './mcpClient.js';
import multer from 'multer';

import fs from 'fs/promises';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.resolve(__dirname, "../mcp-server/resume_state.json");
const SUGGESTIONS_FILE = path.resolve(__dirname, "../mcp-server/suggestions.json");

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/chat', async (req, res) => {
    const { message, history } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        const response = await runAgent(message, history || []);
        res.json(response);
    } catch (error) {
        console.error('Error running agent:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/upload', upload.single('resume'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        let text = '';
        if (req.file.mimetype === 'application/pdf') {
            const pdfData = await pdfParse(req.file.buffer);
            text = pdfData.text;
        } else {
            text = req.file.buffer.toString('utf-8');
        }

        const message = `I have uploaded a new resume. Please extract ALL the details and completely replace my current resume state using the update_entire_resume tool. Preserve all entries — do NOT remove or condense anything.

After saving the full resume, analyze its length. If the resume has more content than fits on a single A4 page (e.g. 4+ experience entries, many long bullets), mention this to the user and ask:
"I notice your resume extends beyond one page. Would you like me to condense it to fit on a single page, or would you prefer to keep the extra content?"

Maintain the Problem->Action->Result structure in bullets if possible, and keep it ATS-friendly.

Here is the parsed text from the file:\n\n${text}`;

        const response = await runAgent(message, []);
        res.json(response);
    } catch (error) {
        console.error('Error processing upload:', error);
        res.status(500).json({ error: 'Failed to process resume upload' });
    }
});

app.get('/api/resume', async (req, res) => {
    try {
        const { mcpClient } = await setupMcpClient();
        const result = await mcpClient.callTool({
            name: "get_resume",
            arguments: {}
        });
        res.json(JSON.parse(result.content[0].text));
    } catch (error) {
        console.error('Error fetching resume:', error);
        res.status(500).json({ error: 'Failed to fetch resume' });
    }
});

app.put('/api/resume/:section', async (req, res) => {
    const { section } = req.params;
    const content = req.body;

    try {
        const { mcpClient } = await setupMcpClient();
        await mcpClient.callTool({
            name: "update_resume_section",
            arguments: { section, content }
        });
        res.json({ success: true });
    } catch (error) {
        console.error(`Error updating resume section ${section}:`, error);
        res.status(500).json({ error: `Failed to update ${section}` });
    }
});

app.get('/api/suggestions', async (req, res) => {
    try {
        const data = await fs.readFile(SUGGESTIONS_FILE, "utf-8");
        res.json(JSON.parse(data));
    } catch (e) {
        if (e.code === "ENOENT") {
            res.json([]);
        } else {
            res.status(500).json({ error: 'Failed to fetch suggestions' });
        }
    }
});

app.post('/api/suggestions/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        let suggestions = [];
        try {
            suggestions = JSON.parse(await fs.readFile(SUGGESTIONS_FILE, "utf-8"));
        } catch (e) { }

        const suggestionIndex = suggestions.findIndex(s => s.id === id);
        if (suggestionIndex === -1) return res.status(404).json({ error: 'Suggestion not found' });

        const suggestion = suggestions[suggestionIndex];

        // Apply to resume state
        const { mcpClient } = await setupMcpClient();
        await mcpClient.callTool({
            name: "replace_text",
            arguments: { originalText: suggestion.originalText, proposedText: suggestion.proposedText }
        });

        // Remove from pending
        suggestions.splice(suggestionIndex, 1);
        await fs.writeFile(SUGGESTIONS_FILE, JSON.stringify(suggestions, null, 2));

        res.json({ success: true });
    } catch (error) {
        console.error('Error approving suggestion:', error);
        res.status(500).json({ error: 'Failed to approve suggestion' });
    }
});

app.post('/api/suggestions/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        let suggestions = [];
        try {
            suggestions = JSON.parse(await fs.readFile(SUGGESTIONS_FILE, "utf-8"));
        } catch (e) { }

        suggestions = suggestions.filter(s => s.id !== id);
        await fs.writeFile(SUGGESTIONS_FILE, JSON.stringify(suggestions, null, 2));

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reject suggestion' });
    }
});

app.post('/api/suggestions/approve-all', async (req, res) => {
    try {
        let suggestions = [];
        try {
            suggestions = JSON.parse(await fs.readFile(SUGGESTIONS_FILE, "utf-8"));
        } catch (e) { }

        const { mcpClient } = await setupMcpClient();

        // Filter out any legacy suggestions that don't have the new text fields
        const validSuggestions = suggestions.filter(s => s.originalText && s.proposedText);

        const replacements = validSuggestions.map(s => ({
            originalText: s.originalText,
            proposedText: s.proposedText
        }));

        await mcpClient.callTool({
            name: "replace_multiple_text",
            arguments: { replacements }
        });

        await fs.writeFile(SUGGESTIONS_FILE, JSON.stringify([], null, 2));
        res.json({ success: true });
    } catch (error) {
        console.error('Error approving all:', error);
        res.status(500).json({ error: 'Failed to approve all suggestions' });
    }
});

app.post('/api/suggestions/reject-all', async (req, res) => {
    try {
        await fs.writeFile(SUGGESTIONS_FILE, JSON.stringify([], null, 2));
        res.json({ success: true });
    } catch (error) {
        console.error('Error rejecting all:', error);
        res.status(500).json({ error: 'Failed to reject all suggestions' });
    }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
    console.log(`Backend server running on port ${PORT}`);
    await setupMcpClient(); // Initialize MCP connection on startup
});
