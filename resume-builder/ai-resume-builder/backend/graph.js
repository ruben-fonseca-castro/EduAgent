import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { setupMcpClient } from "./mcpClient.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import * as cheerio from "cheerio";
// Define the state schema for our graph
const AgentState = {
    messages: {
        value: (x, y) => x.concat(y),
        default: () => [],
    },
    mode: {
        value: (x, y) => y ?? x,
        default: () => null,
    }
};

// Define Tools
const getResumeTool = tool(
    async () => {
        const { mcpClient } = await setupMcpClient();
        const result = await mcpClient.callTool({ name: "get_resume", arguments: {} });
        return result.content[0].text;
    },
    {
        name: "get_resume",
        description: "Get the current structured state of the user's resume.",
        schema: z.object({}),
    }
);

const readUrlTool = tool(
    async ({ url }) => {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const html = await response.text();
            const $ = cheerio.load(html);
            $('script, style, noscript, nav, footer, header').remove();
            return $('body').text().replace(/\s+/g, ' ').trim();
        } catch (error) {
            return `Failed to fetch or parse URL: ${error.message}`;
        }
    },
    {
        name: "read_url",
        description: "Fetch and read the text content of a webpage (like a job description) from a URL. ALWAYS use this if the user provides a link.",
        schema: z.object({
            url: z.string().url().describe("The URL of the webpage to read"),
        }),
    }
);

const updateSectionTool = tool(
    async ({ section, content }) => {
        const { mcpClient } = await setupMcpClient();
        const result = await mcpClient.callTool({
            name: "update_resume_section",
            arguments: { section, content }
        });
        return result.content[0].text;
    },
    {
        name: "update_resume_section",
        description: "DIRECTLY update a specific section of the resume. Use this ONLY if the user explicitly asks to fix a typo or asks for an immediate direct edit.",
        schema: z.object({
            section: z.enum(["basics", "education", "experience", "projects", "skills"]),
            content: z.any().describe("The new structured content for the section. Must match the existing schema structure.")
        }),
    }
);

const proposeUpdateTool = tool(
    async ({ originalText, proposedText, explanation }) => {
        const { mcpClient } = await setupMcpClient();
        const result = await mcpClient.callTool({
            name: "propose_resume_update",
            arguments: { originalText, proposedText, explanation }
        });
        return result.content[0].text;
    },
    {
        name: "propose_resume_update",
        description: "Propose an edit to a specific exact text snippet (like a single bullet point) in the resume.",
        schema: z.object({
            originalText: z.string().describe("The EXACT string from the resume that you want to replace. Must match perfectly."),
            proposedText: z.string().describe("The new text that will replace originalText."),
            explanation: z.string().describe("Why this change is recommended.")
        }),
    }
);

const updateEntireResumeTool = tool(
    async ({ resume }) => {
        const { mcpClient } = await setupMcpClient();
        const result = await mcpClient.callTool({
            name: "update_entire_resume",
            arguments: { resume }
        });
        return result.content[0].text;
    },
    {
        name: "update_entire_resume",
        description: "Completely replace the entire resume state. Use this when parsing a newly uploaded resume.",
        schema: z.object({
            resume: z.object({
                basics: z.object({
                    name: z.string(),
                    email: z.string().optional().default(""),
                    phone: z.string().optional().default(""),
                    linkedin: z.string().optional().default(""),
                    github: z.string().optional().default("")
                }),
                education: z.array(z.object({
                    degree: z.string(),
                    institution: z.string(),
                    date: z.string(),
                    gpa: z.string().optional().default("")
                })),
                experience: z.array(z.object({
                    title: z.string(),
                    company: z.string(),
                    location: z.string().optional().default(""),
                    date: z.string(),
                    bullets: z.array(z.string())
                })),
                projects: z.array(z.object({
                    name: z.string(),
                    techStack: z.string().optional().default(""),
                    bullets: z.array(z.string())
                })),
                skills: z.object({
                    languages: z.array(z.string()).optional().default([]),
                    frameworks: z.array(z.string()).optional().default([]),
                    tools: z.array(z.string()).optional().default([]),
                    softSkills: z.array(z.string()).optional().default([])
                })
            }).describe("The complete structured new resume. Must include basics, education, experience, projects, skills.")
        }),
    }
);

// Router Node: Determine if request is Edit or Analysis
async function routeRequest(state) {
    const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
    const messages = state.messages;

    const systemPrompt = `You are a router. Determine if the user's request is an "Edit" or "Analysis" request.
  Edit means they want to modify, update, tailor, shorten, or rewrite their resume.
  Analysis means they are asking questions, requesting feedback, or providing a job description without explicitly asking to tailor.
  Respond with ONLY the word "Edit" or "Analysis".`;

    const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        messages[messages.length - 1]
    ]);

    const mode = response.content.trim() === "Edit" ? "edit" : "analysis";
    return { mode };
}

// Analysis Node: Only reads resume, gives advice, NO mutations
async function analysisNode(state) {
    const llm = new ChatOpenAI({ model: "gpt-4o", temperature: 0.7 });
    const tools = [getResumeTool, readUrlTool];
    const llmWithTools = llm.bindTools(tools);

    const systemPrompt = new SystemMessage(`You are an AI Resume Builder in ANALYSIS MODE.
  Rules:
  - Do not modify the resume.
  - Read the resume via the get_resume tool if needed to answer questions.
  - If the user provides a link to a job description, USE the read_url tool to fetch its contents before responding.
  - Provide constructive feedback, measure impact, and suggest ATS-friendly improvements.
  - Be concise. Avoid fluff.`);

    let currentMessages = [systemPrompt, ...state.messages];
    let response = await llmWithTools.invoke(currentMessages);
    let iterations = 0;

    while (response.tool_calls && response.tool_calls.length > 0 && iterations < 3) {
        currentMessages.push(response);
        for (const toolCall of response.tool_calls) {
            const tool = tools.find(t => t.name === toolCall.name);
            const result = await tool.invoke(toolCall.args);
            currentMessages.push({ role: "tool", content: result, tool_call_id: toolCall.id });
        }
        response = await llmWithTools.invoke(currentMessages);
        iterations++;
    }

    return { messages: [response] };
}

// Edit Node: Modifies resume Sections
async function editNode(state) {
    const llm = new ChatOpenAI({ model: "gpt-4o", temperature: 0.2 });
    const tools = [getResumeTool, readUrlTool, updateSectionTool, proposeUpdateTool, updateEntireResumeTool];
    const llmWithTools = llm.bindTools(tools);

    const systemPrompt = new SystemMessage(`You are an AI Resume Builder in EDIT MODE.
  Rules:
  - By default, when tailoring a resume to a job description, USE the propose_resume_update tool. Provide the EXACT original text of a bullet or field you want to rewrite, the newly proposed text, and a short explanation. Do NOT overwrite whole sections for simple stylistic choices.
  - ONLY use update_resume_section for direct, explicit user commands to overwrite data (like fixing a typo).
  - If the user provides a link to a job description, USE the read_url tool to fetch its contents before editing.
  - Preserve all other state.
  
  PAGE LENGTH AWARENESS:
  - A single A4 page resume fits roughly: 3 experience entries with 2-3 bullets each, 2 projects with 2 bullets each, and concise bullets under 130 characters.
  - After reading the resume, if you detect it has MORE content than can fit one page (e.g. 4+ experiences, many long bullets), ALWAYS mention this to the user and ask:
    "I notice your resume currently extends beyond one page. Would you like me to condense it to fit on a single page, or would you prefer to keep the extra content?"
  - If the user says condense: your goal is to FILL the full A4 page as densely as possible while staying within one page. Do NOT just delete entries — instead:
    1. Tighten and rewrite bullet points to be shorter but equally impactful (combine related achievements into single powerful bullets).
    2. Merge similar roles if possible (e.g. two short internships at the same company).
    3. Only remove an entry entirely as a last resort if there is no room even after tightening.
    4. Keep the most relevant experiences for the target role. Aim for maximum content density — the page should look full, not sparse.
  - If the user says keep it: proceed without trimming.
  - Use Problem -> Action -> Result structure in bullet points.
  - Prioritize quality over quantity — fewer, stronger bullets beat many weak ones.
  
  - You must always read the resume first before modifying it to ensure you preserve non-edited fields.`);

    let currentMessages = [systemPrompt, ...state.messages];
    let response = await llmWithTools.invoke(currentMessages);
    let iterations = 0;

    while (response.tool_calls && response.tool_calls.length > 0 && iterations < 5) {
        currentMessages.push(response);
        for (const toolCall of response.tool_calls) {
            const tool = tools.find(t => t.name === toolCall.name);
            const result = await tool.invoke(toolCall.args);
            currentMessages.push({ role: "tool", content: result, tool_call_id: toolCall.id });
        }
        response = await llmWithTools.invoke(currentMessages);
        iterations++;
    }

    return { messages: [response] };
}

// Build Graph
const workflow = new StateGraph({ channels: AgentState })
    .addNode("router", routeRequest)
    .addNode("analysis", analysisNode)
    .addNode("edit", editNode)
    .addEdge(START, "router")
    .addConditionalEdges("router", (state) => state.mode, {
        analysis: "analysis",
        edit: "edit"
    })
    .addEdge("analysis", END)
    .addEdge("edit", END);

const checkpointer = new MemorySaver();
const app = workflow.compile({ checkpointer });

export async function runAgent(userInput, history = []) {
    // Convert history from plain objects to proper message classes if needed. 
    // For simplicity we just pass human message. 
    // We use a predefined thread_id for a single local session.
    const config = { configurable: { thread_id: "local_session" } };
    const inputMessage = new HumanMessage(userInput);

    const result = await app.invoke({ messages: [inputMessage] }, config);
    const finalMessage = result.messages[result.messages.length - 1].content;
    return { reply: finalMessage, mode: result.mode };
}
