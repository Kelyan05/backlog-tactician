import { app } from "./app.ts";

const port = 3000; // The port your express server will be running on.

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
