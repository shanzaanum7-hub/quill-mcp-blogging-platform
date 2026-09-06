import type Database from 'better-sqlite3';
import { AnalyticsRepository, ApiKeyRepository, PostRepository, UserRepository } from '@quill/database';
import { AnalyticsService } from './AnalyticsService.js';
import { ApiKeyService } from './ApiKeyService.js';
import { AuthService } from './AuthService.js';
import { PostService } from './PostService.js';

export type ServiceContainer = {
  authService: AuthService;
  postService: PostService;
  apiKeyService: ApiKeyService;
  analyticsService: AnalyticsService;
};

export function createServiceContainer(db: Database.Database): ServiceContainer {
  const users = new UserRepository(db);
  const posts = new PostRepository(db);
  return {
    authService: new AuthService(users),
    postService: new PostService(posts, users),
    apiKeyService: new ApiKeyService(new ApiKeyRepository(db)),
    analyticsService: new AnalyticsService(new AnalyticsRepository(db), posts),
  };
}