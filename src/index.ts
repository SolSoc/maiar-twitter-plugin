import "dotenv/config";

// Suppress deprecation warnings
process.removeAllListeners("warning");

import { config } from "dotenv";
import path from "path";

// Load environment variables from root .env
config({
  path: path.resolve(__dirname, "../../..", ".env"),
});

import { createRuntime } from "@maiar-ai/core";

// Import all plugins
import { PluginTextGeneration } from "@maiar-ai/plugin-text";
import { PluginTime } from "@maiar-ai/plugin-time";

import { SQLiteProvider } from "@maiar-ai/memory-sqlite";
import { OpenAIProvider } from "@maiar-ai/model-openai";

import { PluginTwitter, twitterEventEmitter } from "./plugin-twitter";

import { readFileSync } from "fs";

// Create and start the agent
const runtime = createRuntime({
  model: new OpenAIProvider({
    model: "gpt-4o",
    apiKey: process.env.OPENAI_API_KEY as string,
  }),
  memory: new SQLiteProvider({
    dbPath: path.join(process.cwd(), "data", "conversations.db"),
  }),
  plugins: [
    new PluginTextGeneration(),
    new PluginTime(),
    new PluginTwitter({
      username: process.env.TWITTER_USERNAME as string,
      password: process.env.TWITTER_PASSWORD as string,
      email: process.env.TWITTER_EMAIL as string,
      personality: readFileSync(__dirname + "/../character/personality.json", {
        encoding: "utf8",
      }),
    }),
  ],
});

// Start the runtime if this file is run directly
if (require.main === module) {
  console.log("Starting agent...");
  runtime.start().catch((error) => {
    console.error("Failed to start agent:", error);
    process.exit(1);
  });

  // Handle shutdown gracefully
  process.on("SIGINT", async () => {
    console.log("Shutting down agent...");
    await runtime.stop();
    process.exit(0);
  });
}

// Tweet timer loop
async function tweetTimer() {
  twitterEventEmitter.emit("tweet");
  setTimeout(tweetTimer, 60000);
}

tweetTimer();
