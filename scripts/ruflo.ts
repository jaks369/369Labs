import "dotenv/config";
import { listRuFloAgents, runRuFlo } from "../server/ruflo/orchestrator.js";
import type { RuFloAgentId } from "../server/ruflo/config.js";

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function printUsage() {
  console.log(`Usage:
  pnpm ruflo:list
  pnpm ruflo:run -- --agent strategy-architect --prompt "Build a Volatility 75 digit bot"

Agents:
${listRuFloAgents()
  .map(agent => `  ${agent.id} - ${agent.purpose}`)
  .join("\n")}
`);
}

async function main() {
  const command = process.argv[2];

  if (command === "list") {
    console.table(listRuFloAgents());
    return;
  }

  if (command !== "run") {
    printUsage();
    return;
  }

  const prompt = readArg("--prompt");
  const agentId = readArg("--agent") as RuFloAgentId | undefined;
  const context = readArg("--context");

  if (!prompt) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const result = await runRuFlo({ agentId, prompt, context });

  console.log(`# ${result.agentName}`);
  console.log(`Agent: ${result.agentId}`);
  console.log(`Model: ${result.model}`);
  console.log("");
  console.log(result.output);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
