import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Local CLI scripts load the repo-root .env. Real environments provide variables directly.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
