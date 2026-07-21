export function routeAgent(_message: string) {
  return { agent: { process: async (_input: any) => ({ reply: "Agent unavailable." }) } };
}
export function getAgent(_name: string) { return null; }
export const agentTools: any[] = [];
