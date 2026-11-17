import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../scripts/build.mjs";

export default function setup() { build(resolve(fileURLToPath(new URL("..", import.meta.url)))); }
