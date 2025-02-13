import { Profile, Scraper } from "agent-twitter-client";
import { Cookie } from "tough-cookie";

export interface TwitterConfig {
  username: string;
  password: string;
  email: string;
}

export class Twitter {
  twitterClient: Scraper = new Scraper();
  cookies: Cookie[] = [];
  profile: Profile | null = null;
  initParams: TwitterConfig = { username: "", password: "", email: "" };
  constructor(params: TwitterConfig) {
    this.initParams = params;
  }

  async init() {
    const { username, password, email } = this.initParams;
    if (await this.twitterClient.isLoggedIn()) {
      console.log("Already logged in to Twitter");
      await this.fetchProfile(username);
      return;
    }

    let retries = 5;
    let loggedIn = false;
    while (retries > 0) {
      try {
        if (await this.twitterClient.isLoggedIn()) {
          console.log("Already logged in to Twitter");
          break;
        } else {
          console.log("Logging in to Twitter...");
          await this.twitterClient.login(username, password, email);
          if (await this.twitterClient.isLoggedIn()) {
            console.log("Successfully logged in to Twitter");
            loggedIn = true;
            this.cookies = await this.twitterClient.getCookies();
            break;
          }
        }
      } catch (error) {
        console.error("Failed to login to Twitter:", error);
      }
      retries--;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (loggedIn) {
      console.log("Successfully logged in to Twitter");
      await this.fetchProfile(username);
    } else {
      console.error("Failed to login to Twitter");
      throw new Error("Failed to login to Twitter");
    }
  }

  async fetchProfile(username: string) {
    const profile = await this.twitterClient.getProfile(username);
    console.log("Fetched profile:", profile);
    this.profile = profile;
    return profile;
  }

  async fetchFollowingTimeline(count: number) {
    const timeline = await this.twitterClient.fetchFollowingTimeline(count, []);
    console.dir(timeline, { depth: null });
    return await Promise.all(timeline.map((tweet) => this.parseTweet(tweet)));
  }

  async parseTweet(tweet: any) {
    const flattenedTweets = [tweet];
    const queue = [tweet];
    let count = 0;
    let currentTweet;
    while (count < 3 && (currentTweet = queue.shift())) {
      if (currentTweet.quoted_status_result?.result) {
        flattenedTweets.push(currentTweet.quoted_status_result.result);
        queue.push(currentTweet.quoted_status_result.result);
      }
      if (currentTweet.retweeted_status_result?.result) {
        flattenedTweets.push(currentTweet.retweeted_status_result.result);
        queue.push(currentTweet.retweeted_status_result.result);
      }
    }

    return flattenedTweets.map((raw) => ({
      bookmarkCount:
        raw.bookmarkCount ?? raw.legacy?.bookmark_count ?? undefined,
      conversationId: raw.conversationId ?? raw.legacy?.conversation_id_str,
      hashtags: raw.hashtags ?? raw.legacy?.entities?.hashtags ?? [],
      html: raw.html,
      id: raw.id ?? raw.rest_id ?? raw.id_str ?? undefined,
      inReplyToStatus: raw.inReplyToStatus,
      inReplyToStatusId:
        raw.inReplyToStatusId ??
        raw.legacy?.in_reply_to_status_id_str ??
        undefined,
      isQuoted: raw.legacy?.is_quote_status === true,
      isPin: raw.isPin,
      isReply: raw.isReply,
      isRetweet: raw.legacy?.retweeted === true,
      isSelfThread: raw.isSelfThread,
      language: raw.legacy?.lang,
      likes: raw.legacy?.favorite_count ?? 0,
      name:
        raw.name ??
        raw?.user_results?.result?.legacy?.name ??
        raw.core?.user_results?.result?.legacy?.name,
      mentions: raw.mentions ?? raw.legacy?.entities?.user_mentions ?? [],
      permanentUrl:
        raw.permanentUrl ??
        (raw.core?.user_results?.result?.legacy?.screen_name && raw.rest_id
          ? `https://x.com/${raw.core?.user_results?.result?.legacy?.screen_name}/status/${raw.rest_id}`
          : undefined),
      photos:
        raw.photos ??
        (raw.legacy?.entities?.media
          ?.filter((media: any) => media.type === "photo")
          .map((media: any) => ({
            id: media.id_str,
            url: media.media_url_https,
            alt_text: media.alt_text
          })) ||
          []),
      place: raw.place,
      poll: raw.poll ?? null,
      quotedStatus: raw.quoted_status_result?.result,
      quotedStatusId:
        raw.quotedStatusId ?? raw.legacy?.quoted_status_id_str ?? undefined,
      quotes: raw.legacy?.quote_count ?? 0,
      replies: raw.legacy?.reply_count ?? 0,
      retweets: raw.legacy?.retweet_count ?? 0,
      retweetedStatus: raw.retweeted_status_result?.result,
      retweetedStatusId: raw.legacy?.retweeted_status_id_str ?? undefined,
      text: raw.text ?? raw.legacy?.full_text ?? undefined,
      thread: raw.thread || [],
      timeParsed: raw.timeParsed
        ? new Date(raw.timeParsed)
        : raw.legacy?.created_at
          ? new Date(raw.legacy?.created_at)
          : undefined,
      timestamp:
        raw.timestamp ??
        (raw.legacy?.created_at
          ? new Date(raw.legacy.created_at).getTime() / 1000
          : undefined),
      urls: raw.urls ?? raw.legacy?.entities?.urls ?? [],
      userId: raw.userId ?? raw.legacy?.user_id_str ?? undefined,
      username:
        raw.username ??
        raw.core?.user_results?.result?.legacy?.screen_name ??
        undefined,
      videos:
        raw.videos ??
        raw.legacy?.entities?.media?.filter(
          (media: any) => media.type === "video"
        ) ??
        [],
      views: raw.views?.count ? Number(raw.views.count) : 0,
      sensitiveContent: raw.sensitiveContent
    }));
  }

  async sendTweet(tweet: string) {
    console.log("Sending tweet:", tweet);

    if (tweet.length > 280) {
      console.error("Tweet is too long");
      return;
    }

    const test = "Tweeted using $MAIAR";
    if (tweet.length + test.length + 1 < 280) {
      tweet += "\n" + test;
    }

    try {
      const tweetResult = await this.twitterClient.sendTweet(tweet);
      const body = await tweetResult.json();
      if (!body?.data?.create_tweet?.tweet_results?.result) {
        console.error("Error sending tweet; Bad response:", body);
        return;
      }
    } catch (error) {
      console.error("Failed to send tweet:", error);
    }
    // await this.twitterClient.sendTweet(tweet);
  }
}
