export const kvKeys = {
  user: (username: string) => `user_${username}`,
  knowledgeIndex: (userId: string) => `kp_index_${userId}`,
  knowledgePoint: (userId: string, kpId: string) => `kp_${userId}_${kpId}`,
  deck: (userId: string) => `deck_${userId}`,
  category: (userId: string) => `cat_${userId}`,
  streak: (userId: string) => `streak_${userId}`,
  chatSession: (userId: string, sessionId: string) =>
    `chat_${userId}_${sessionId}`,
  chatIndex: (userId: string) => `chat_idx_${userId}`,
  profile: (userId: string) => `profile_${userId}`,
  memory: (userId: string) => `memory_${userId}`,
  episode: (userId: string, date: string) => `episode_${userId}_${date}`,
} as const;

export const CONFIG_KEYS = {
  aiConfig: "ai_config",
  appSecrets: "app_secrets",
  inviteCode: "invite_code",
} as const;
