import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const envDirectory = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(envDirectory, ".env") });
if (process.env.NODE_ENV !== "production") {
  dotenv.config({
    path: path.join(envDirectory, ".env.local"),
    override: true,
  });
}
