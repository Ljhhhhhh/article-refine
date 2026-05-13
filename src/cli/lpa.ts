#!/usr/bin/env node
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from the package root (two levels up from dist/cli/)
config({ path: path.resolve(__dirname, "../../.env") });

import React from "react";
import { render } from "ink";
import { App } from "./tui/App.js";

const url = process.argv[2];
render(React.createElement(App, { initialUrl: url, options: {} }));
