import express from "express";
import os from "node:os";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get("/api/status", (_request, response) => {
  response.json({
    status: "okay",
    service: "api",
    hostname: os.hostname(),
    timestamp: new Date().toISOString(),
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on port ${port}`);
});
