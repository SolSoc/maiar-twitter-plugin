export interface PersonalityType {
  name: string;
  description: string;
  personality: string[];
  bio: string;
  knowledge: string[];
  style: {
    tweets: string[];
  };
  engagement: {
    twitter: { username: string; action: string; likelihood: number }[];
  };
}
