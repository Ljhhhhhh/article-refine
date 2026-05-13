#!/usr/bin/env node
import "dotenv/config";
import React from "react";
import { render } from "ink";
import { App } from "./tui/App.js";

const url = process.argv[2];
render(React.createElement(App, { initialUrl: url, options: {} }));
