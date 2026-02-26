import { createApp } from "./server/app.js";

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
const app = createApp();

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`SnapFlow API listening on port ${port}`);
  });
}

export default app;
