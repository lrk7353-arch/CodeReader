import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 18765);
const content = JSON.stringify({
  codeMeaning: "The selected function validates input and returns a stable result.",
  localMeaning: "It guards the immediate caller from invalid values.",
  globalMeaning: "It is part of the controlled native journey fixture.",
  riskNotes: [],
  readerNotes: ["Deterministic local journey response."],
  trustLabel: "clear",
  trustReason: "The behavior is explicit in the selected function.",
  dependsOnLines: [],
  affectsLines: [],
  contextSources: []
});

createServer((request, response) => {
  if (request.method !== "POST") {
    response.writeHead(404).end();
    return;
  }
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    JSON.parse(body);
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        choices: [{ message: { role: "assistant", content } }]
      })
    );
  });
}).listen(port, "127.0.0.1", () => process.stdout.write(`stub-ready:${port}\n`));
