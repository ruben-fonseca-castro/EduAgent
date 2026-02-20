import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mcpClient = null;
let mcpTransport = null;

export async function setupMcpClient() {
    if (mcpClient) return { mcpClient, mcpTransport };

    const serverPath = path.resolve(__dirname, "../mcp-server/index.js");

    const transport = new StdioClientTransport({
        command: "node",
        args: [serverPath],
    });

    const client = new Client(
        { name: "resume-backend-client", version: "1.0.0" },
        { capabilities: { tools: {} } }
    );

    await client.connect(transport);

    mcpClient = client;
    mcpTransport = transport;

    console.log("Connected to MCP Server");
    return { mcpClient, mcpTransport };
}
