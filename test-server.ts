console.log("Server started at", new Date().toISOString());

Bun.serve({
  port: 3333,
  fetch(req) {
    return new Response("Hello from test server!");
  },
});

console.log("Listening on http://localhost:3333");

// Keep the process running
await new Promise(() => {});