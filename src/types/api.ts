export type UserRole = 'user' | 'admin' | 'agent';
export type CreatorTier = 'free' | 'creator';
export type PostType = 'text' | 'image' | 'video' | 'music';
export type ModerationStatus = 'clean' | 'flagged';
export type WaitlistStatus = 'pending' | 'approved' | 'rejected' | 'registered';
export type AgentStatus = 'active' | 'rate_limited' | 'suspended';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  creator_tier?: CreatorTier;
  profile_image?: string | null;
}

export interface Post {
  id: number;
  user_id: number;
  username: string;
  post_type: PostType;
  created_at: string;
  content?: string | null;
  image_url?: string | null;
  caption?: string | null;
  video_url?: string | null;
  video_type?: 'upload' | 'youtube' | 'url' | null;
  music_title?: string | null;
  audio_url?: string | null;
  stream_url?: string | null;
  platform?: 'spotify' | 'soundcloud' | 'apple' | 'other' | null;
  is_agent_post: boolean;
  source_url?: string | null;
  provenance_urls?: string[] | null;
  agent_id?: number | null;
  moderation_status?: ModerationStatus | null;
  moderation_reason?: string | null;
  verified_count: number;
  disputed_count: number;
}

export interface Artist {
  artist_id: number;
  artist_name: string;
  name?: string;
  aka?: string | null;
  genre?: string | null;
  count: number;
  state?: string | null;
  region?: string | null;
  label?: string | null;
  image_url?: string | null;
  mixtape?: string | null;
  albums?: Album[];
}

export interface Album {
  album_id: number;
  artist_id: number;
  album_name: string;
  year?: number | null;
  certifications?: string | null;
  album_image_url?: string | null;
}

export interface Comment {
  comment_id: number;
  post_type: string;
  post_id: number;
  user_id: number;
  username: string;
  content: string;
  created_at: string;
}

export interface WaitlistEntry {
  waitlist_id: number;
  email: string;
  full_name?: string | null;
  status: WaitlistStatus;
  invite_code?: string | null;
  created_at: string;
}

export interface Agent {
  agent_id: number;
  owner_id: number;
  name: string;
  manifest_url: string;
  status: AgentStatus;
  created_at: string;
  owner?: string;
}

export interface ModerationQueueItem {
  post_id: number;
  content: string;
  moderation_reason?: string | null;
  created_at: string;
  username: string;
  user_id: number;
}

export interface Conversation {
  conversation_id: number;
  user_one: number;
  user_two: number;
  updated_at: string;
  other_username: string;
  other_user_id: number;
  other_profile_image?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  last_sender_id?: number | null;
  unread_count: number;
}

export interface Message {
  message_id: number;
  conversation_id: number;
  sender_id: number;
  sender_username?: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

export interface AdminStats {
  total_users: string;
  pending_waitlist: string;
  total_posts: string;
}

// AppSettings values are all string (VARCHAR in DB) — not boolean. Coerce in UI.
export interface AppSettings {
  waitlist_enabled: string;
  agent_posts_enabled: string;
  agent_penalty_hours: string;
  feed_limit: string;
}
