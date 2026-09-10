export type PostStatus = 'draft' | 'published' | 'scheduled';

export interface Post {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  status: PostStatus;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  readTime: string;
}

export interface UserProfile {
  name: string;
  email: string;
  role: string;
  location: string;
}

export interface MetricCard {
  label: string;
  value: string;
  delta: string;
  detail: string;
  tone: 'primary' | 'accent' | 'sky' | 'lavender';
}
