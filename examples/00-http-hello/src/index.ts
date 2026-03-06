import { kernel } from "@kislabin/core";
import { http } from "@kislabin/net-http";

const app = http({ port: 3000 })
  .route({
    path: '/users/:id',
    handlers: {
      get: ({ params }) => ({ id: params.id })
    }
  });

await kernel().use(app).start();