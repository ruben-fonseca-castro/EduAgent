import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import { fileURLToPath } from 'url';
import fs from "fs/promises";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(__dirname, "resume_state.json");
const SUGGESTIONS_FILE = path.join(__dirname, "suggestions.json");

const defaultResumeState = {
    basics: {
        name: "Jane Doe",
        email: "jane.doe@example.com",
        phone: "123-456-7890",
        linkedin: "linkedin.com/in/janedoe",
        github: "github.com/janedoe"
    },
    education: [
        {
            degree: "B.S. Computer Science",
            institution: "State University",
            date: "May 2024",
            gpa: "3.8/4.0"
        }
    ],
    experience: [],
    projects: [],
    skills: {
        languages: ["JavaScript", "Python", "TypeScript"],
        frameworks: ["React", "Node.js"],
        tools: ["Git", "Docker"],
        softSkills: ["Communication", "Leadership"]
    }
};

class ResumeServer {
    constructor() {
        this.server = new Server(
            {
                name: "ai-resume-mcp-server",
                version: "1.0.0",
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );
        this.setupHandlers();
    }

    async getResumeState() {
        try {
            const data = await fs.readFile(STATE_FILE, "utf-8");
            return JSON.parse(data);
        } catch (e) {
            if (e.code === "ENOENT") {
                await this.saveResumeState(defaultResumeState);
                return defaultResumeState;
            }
            throw e;
        }
    }

    async saveResumeState(state) {
        await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
    }

    async getSuggestions() {
        try {
            const data = await fs.readFile(SUGGESTIONS_FILE, "utf-8");
            return JSON.parse(data);
        } catch (e) {
            if (e.code === "ENOENT") {
                await this.saveSuggestions([]);
                return [];
            }
            throw e;
        }
    }

    async saveSuggestions(suggestions) {
        await fs.writeFile(SUGGESTIONS_FILE, JSON.stringify(suggestions, null, 2));
    }

    setupHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "get_resume",
                        description: "Retrieve the current structured resume state.",
                        inputSchema: {
                            type: "object",
                            properties: {},
                            required: [],
                        },
                    },
                    {
                        name: "update_resume_section",
                        description: "Update a specific section of the resume (basics, education, experience, projects, skills).",
                        inputSchema: {
                            type: "object",
                            properties: {
                                section: {
                                    type: "string",
                                    enum: ["basics", "education", "experience", "projects", "skills"],
                                    description: "The section of the resume to update.",
                                },
                                content: {
                                    type: "object",
                                    description: "The new content for this section.",
                                },
                            },
                            required: ["section", "content"],
                        },
                    },
                    {
                        name: "propose_resume_update",
                        description: "Propose an update to a specific text snippet in the resume (like a single bullet point). Use this when tailoring to allow user review.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                originalText: {
                                    type: "string",
                                    description: "The EXACT string from the resume that you want to replace. Must match perfectly for find-and-replace to work."
                                },
                                proposedText: {
                                    type: "string",
                                    description: "The new text that will replace originalText."
                                },
                                explanation: {
                                    type: "string",
                                    description: "A short explanation of why this change improves the resume."
                                }
                            },
                            required: ["originalText", "proposedText", "explanation"],
                        },
                    },
                    {
                        name: "replace_text",
                        description: "Utility to execute a find-and-replace of an exact string anywhere in the resume state.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                originalText: { type: "string" },
                                proposedText: { type: "string" }
                            },
                            required: ["originalText", "proposedText"]
                        }
                    },
                    {
                        name: "replace_multiple_text",
                        description: "Utility to execute a batch find-and-replace of multiple exact strings anywhere in the resume state safely.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                replacements: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            originalText: { type: "string" },
                                            proposedText: { type: "string" }
                                        }
                                    }
                                }
                            },
                            required: ["replacements"]
                        }
                    },
                    {
                        name: "update_entire_resume",
                        description: "Update the entire resume structure at once. Used cautiously.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                resume: {
                                    type: "object",
                                    description: "The complete new resume state.",
                                }
                            },
                            required: ["resume"]
                        }
                    }
                ],
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (request.params.name === "get_resume") {
                const state = await this.getResumeState();
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(state, null, 2),
                        },
                    ],
                };
            } else if (request.params.name === "update_resume_section") {
                const { section, content } = request.params.arguments;
                const state = await this.getResumeState();

                if (!state[section] && section !== 'basics') {
                    state[section] = [];
                }

                state[section] = content;
                await this.saveResumeState(state);

                return {
                    content: [
                        {
                            type: "text",
                            text: `Successfully updated ${section}`,
                        },
                    ],
                };
            } else if (request.params.name === "propose_resume_update") {
                const { originalText, proposedText, explanation } = request.params.arguments;
                const suggestions = await this.getSuggestions();

                const newSuggestion = {
                    id: crypto.randomUUID(),
                    originalText,
                    proposedText,
                    explanation,
                    status: 'pending'
                };

                suggestions.push(newSuggestion);
                await this.saveSuggestions(suggestions);

                return {
                    content: [
                        {
                            type: "text",
                            text: `Successfully proposed update. It is pending user approval.`,
                        },
                    ],
                };
            } else if (request.params.name === "replace_text") {
                const { originalText, proposedText } = request.params.arguments;
                const state = await this.getResumeState();

                // Recursively find and replace string
                const recursiveReplace = (obj) => {
                    if (typeof obj === 'string') {
                        return obj.trim() === originalText.trim() ? proposedText : obj;
                    }
                    if (Array.isArray(obj)) {
                        return obj.map(item => recursiveReplace(item));
                    }
                    if (typeof obj === 'object' && obj !== null) {
                        const newObj = {};
                        for (const key in obj) {
                            newObj[key] = recursiveReplace(obj[key]);
                        }
                        return newObj;
                    }
                    return obj;
                };

                const updatedState = recursiveReplace(state);
                await this.saveResumeState(updatedState);

                return {
                    content: [
                        {
                            type: "text",
                            text: "Successfully replaced text.",
                        },
                    ],
                };
            } else if (request.params.name === "replace_multiple_text") {
                const { replacements } = request.params.arguments;
                const state = await this.getResumeState();

                // Recursively find and replace string for multiple targets
                const recursiveReplaceBatch = (obj) => {
                    if (typeof obj === 'string') {
                        let currentStr = obj;
                        for (const r of replacements) {
                            if (currentStr.trim() === r.originalText.trim()) {
                                currentStr = r.proposedText;
                                // Assuming one replacement per string for simplicity in bullets
                            }
                        }
                        return currentStr;
                    }
                    if (Array.isArray(obj)) {
                        return obj.map(item => recursiveReplaceBatch(item));
                    }
                    if (typeof obj === 'object' && obj !== null) {
                        const newObj = {};
                        for (const key in obj) {
                            newObj[key] = recursiveReplaceBatch(obj[key]);
                        }
                        return newObj;
                    }
                    return obj;
                };

                const updatedState = recursiveReplaceBatch(state);
                await this.saveResumeState(updatedState);

                return {
                    content: [
                        {
                            type: "text",
                            text: `Successfully replaced ${replacements.length} texts.`,
                        },
                    ],
                };
            } else if (request.params.name === "update_entire_resume") {
                const { resume } = request.params.arguments;
                await this.saveResumeState(resume);
                return {
                    content: [
                        {
                            type: "text",
                            text: "Successfully updated entire resume.",
                        },
                    ],
                };
            }

            throw new Error(`Tool not found: ${request.params.name}`);
        });
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("AI Resume MCP Server running on stdio");
    }
}

const server = new ResumeServer();
server.run().catch(console.error);
