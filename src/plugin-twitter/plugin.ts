import {
  BaseContextItem,
  PluginBase,
  PluginResult,
  UserInputContext
} from "@maiar-ai/core";
import EventEmitter from "node:events";
import { z } from "zod";
import { Twitter, TwitterConfig } from "../twitter";

interface TwitterPlatformContext {
  platform: string;
  responseHandler?: (response: unknown) => void;
  metadata?: {
    twitterClient: Twitter;
  };
}

const TweetResponseSchema = z.object({
  tweet: z.string().describe("The tweet content")
});

function generateResponseTemplate(
  contextChain: BaseContextItem[],
  personality: string
): string {
  const parsed = JSON.parse(personality);
  return `Generate a tweet that the following user would post:
  
    Your name: ${parsed.name}
    Your bio: ${parsed.bio}

    KNOWLEDGE:
    - ${parsed.knowledge.join("\n    - ")}

    IMPORTANT: Your response MUST be valid JSON:
    - Use double quotes (") not single quotes (')
    - Escape any quotes within strings with backslash (\")
    - Do not use smart/curly quotes
    - The response must be parseable by JSON.parse()

    Do NOT include any metadata, context information, or explanation of how the response was generated.

    Here is the Context Chain of your previous tweets. Avoid repeating yourself and try to be original:
    ${JSON.stringify(contextChain, null, 2)}

    TASK:
    Your goal is to write a tweet in the style following style:
    - ${parsed.style.tweets.join("\n    - ")}
    from the perspective of ${parsed.name}

    Return a JSON object with a single "tweet" field containing your response.
    `;
}

export const twitterEventEmitter = new EventEmitter();

export class PluginTwitter extends PluginBase {
  private twitterClient: Twitter | null = null;

  constructor(params: TwitterConfig & { personality: string }) {
    super({
      id: "plugin-twitter",
      name: "Twitter",
      description: "Handles X/Twitter social interactions"
    });

    console.dir(params, { depth: null });
    this.twitterClient = new Twitter(params);
    this.twitterClient.init().catch((error) => {
      console.error("Failed to initialize Twitter client:", error);
    });

    this.addExecutor({
      name: "send_tweet",
      description: "Send a tweet",
      execute: async (): Promise<PluginResult> => {
        const context = this.runtime.context;
        if (!context?.platformContext?.responseHandler) {
          console.error(
            "[Twitter Plugin] Error: No response handler available"
          );
          return {
            success: false,
            error: "No response handler available"
          };
        }

        try {
          // Format the response based on the context chain
          const formattedResponse = await this.runtime.operations.getObject(
            TweetResponseSchema,
            generateResponseTemplate(context.contextChain, params.personality),
            { temperature: 0.45 }
          );

          await context.platformContext.responseHandler(
            formattedResponse.tweet
          );
          return {
            success: true,
            data: {
              message: formattedResponse.tweet,
              helpfulInstruction:
                "This is the formatted response sent to the HTTP client"
            }
          };
        } catch (error) {
          console.error("[Twitter Plugin] Error sending response:", error);
          return {
            success: false,
            error: "Failed to send response"
          };
        }
      }
    });

    this.addTrigger({
      id: "tweet_event_listened",
      start: () => {
        console.log("[Twitter Plugin] Starting Twitter event listener");

        twitterEventEmitter.on("tweet", async (tweet: string) => {
          // Create new context chain with initial user input
          const initialContext: UserInputContext = {
            id: `${this.id}-${Date.now()}`,
            pluginId: this.id,
            type: "user_input",
            action: "receive_message",
            content: "Write a tweet that the for the following personality",
            timestamp: Date.now(),
            rawMessage: "Write a tweet that the for the following personality",
            user: "system"
          };

          // Create event with initial context and response handler
          if (this.twitterClient) {
            const platformContext: TwitterPlatformContext = {
              platform: this.id,
              responseHandler: (result: unknown) => {
                if (!this.twitterClient) {
                  console.error("Twitter client not initialized");
                  throw new Error("Twitter client not initialized");
                }
                this.twitterClient.sendTweet(result as string);
              },
              metadata: {
                twitterClient: this.twitterClient
              }
            };
            await this.runtime.createEvent(initialContext, platformContext);
          } else {
            console.error("Twitter client not initialized");
            throw new Error("Twitter client not initialized");
          }
        });

        twitterEventEmitter.on("mention", async (mention: string) => {
          console.log("Received mention:", mention);
          // do some magic with the mention
          // Use the likelihood values in the character/personality.json file to determine how to/whether to respond
        });
      }
    });
  }
}
