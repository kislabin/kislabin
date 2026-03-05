import { kernel } from "@kislabin/core";
import { http } from "@kislabin/net-http";

const app = await kernel()
  .use(http({ port: 3000 }))
  .handle("http:GET:/", () => ({ hello: "world" }))
  .handle("http:GET:/users", () => [
    { id: 1, name: "João" },
    { id: 2, name: "Maria" },
  ])
  .start();

console.log(`Server running → http://localhost:3000  (state: ${app.state})`);
