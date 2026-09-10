import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

type RouteKey = 'Dashboard' | 'Posts' | 'Create Post' | 'Analytics' | 'Account' | 'Edit Post';
type PostStatus = 'draft' | 'published' | 'scheduled';
type AnalyticsRange = '7d' | '30d' | '90d' | 'all';

type FormErrors = Partial<Record<'name' | 'email' | 'password' | 'confirmPassword' | 'title' | 'content' | 'excerpt', string>>;

type AccountUser = {
  id: number;
  username: string;
  email: string;
  display_name: string | null;
  bio: string | null;
  created_at: string;
};

type PostItem = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  status: PostStatus;
  published_at: string | null;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
};

type AccountAnalytics = {
  total_views: number;
  unique_views: number;
  top_posts: Array<{ post_id: number; title: string; slug: string; total_views: number; unique_views: number }>;
  range: AnalyticsRange;
};

type ApiKeyItem = {
  id: number;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  revoked: boolean;
  created_at: string;
};

type PublicPost = {
  title: string;
  slug: string;
  excerpt: string | null;
  published_at: string | null;
  content: string;
  seo_title: string | null;
  seo_description: string | null;
};

type PublicPostsResult = {
  author: { username: string; display_name: string | null; bio: string | null };
  posts: PublicPost[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

const navigationItems = [
  { label: 'Dashboard', to: '/dashboard', icon: '?' },
  { label: 'Posts', to: '/posts', icon: '?' },
  { label: 'Create Post', to: '/create-post', icon: '+' },
  { label: 'Analytics', to: '/analytics', icon: '?' },
  { label: 'Account', to: '/account', icon: '?' },
];

const routeTitles: Record<string, RouteKey> = {
  '/dashboard': 'Dashboard',
  '/posts': 'Posts',
  '/create-post': 'Create Post',
  '/analytics': 'Analytics',
  '/account': 'Account',
};

const fallbackAccount: AccountUser = {
  id: 1,
  username: 'samia',
  email: 'samia@quill.example',
  display_name: 'Samia L.',
  bio: 'Editor-in-Chief focused on publishing systems, audience growth, and elegant content operations.',
  created_at: '2026-01-15T09:00:00.000Z',
};

const fallbackPosts: PostItem[] = [
  {
    id: 1,
    title: 'Designing Better Onboarding Flows',
    slug: 'designing-better-onboarding-flows',
    excerpt: 'A practical guide to reducing drop-off and improving activation for new readers.',
    status: 'published',
    published_at: '2026-09-08T00:00:00.000Z',
    scheduled_for: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-08T00:00:00.000Z',
  },
  {
    id: 2,
    title: 'How AI-Assisted Publishing Changes Editorial Work',
    slug: 'how-ai-assisted-publishing-changes-editorial-work',
    excerpt: 'Why teams are moving to collaborative workflows and what it means for quality.',
    status: 'scheduled',
    published_at: null,
    scheduled_for: '2026-09-12T00:00:00.000Z',
    created_at: '2026-09-03T00:00:00.000Z',
    updated_at: '2026-09-11T00:00:00.000Z',
  },
  {
    id: 3,
    title: 'Building Trust Through Transparent Writing',
    slug: 'building-trust-through-transparent-writing',
    excerpt: 'Simple editorial systems that help readers feel confident in your content.',
    status: 'draft',
    published_at: null,
    scheduled_for: null,
    created_at: '2026-09-05T00:00:00.000Z',
    updated_at: '2026-09-09T00:00:00.000Z',
  },
];

const fallbackAnalytics: AccountAnalytics = {
  total_views: 128400,
  unique_views: 83210,
  top_posts: [
    { post_id: 1, title: 'Designing Better Onboarding Flows', slug: 'designing-better-onboarding-flows', total_views: 35400, unique_views: 23910 },
    { post_id: 4, title: 'AI-Assisted Publishing', slug: 'ai-assisted-publishing', total_views: 28710, unique_views: 19420 },
    { post_id: 5, title: 'Transparent Writing', slug: 'transparent-writing', total_views: 24110, unique_views: 16680 },
  ],
  range: '30d',
};

const fallbackKeys: ApiKeyItem[] = [
  { id: 1, name: 'Cursor', key_prefix: 'quill_a5c9', last_used_at: '2026-09-09T10:20:00.000Z', revoked: false, created_at: '2026-09-01T00:00:00.000Z' },
  { id: 2, name: 'Claude Code', key_prefix: 'quill_7b31', last_used_at: null, revoked: false, created_at: '2026-09-07T00:00:00.000Z' },
];

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/blog/:username" element={<PublicBlogPage />} />
        <Route path="/blog/:username/:slug" element={<PublicPostPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/posts" element={<PostsPage />} />
          <Route path="/posts/:id/edit" element={<CreatePostPage />} />
          <Route path="/create-post" element={<CreatePostPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function ProtectedLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const title = routeTitles[location.pathname] ?? 'Dashboard';
  const [me, setMe] = useState<AccountUser | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await apiRequest<AccountUser>('/auth/me');
        if (active) {
          setMe(data);
        }
      } catch {
        if (active) {
          navigate('/login', { replace: true });
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [navigate]);

  if (!me) {
    return null;
  }

  const handleLogout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Intentionally ignore logout errors and keep the user flow moving.
    }
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
        <aside className="w-full border-b border-[#D9EAF0] bg-white/80 backdrop-blur lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col p-4 sm:p-5">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-white shadow-panel">Q</div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/60">Quill</p>
                <h2 className="text-lg font-bold text-primary">Workspace</h2>
              </div>
            </div>

            <nav className="space-y-2">
              {navigationItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => (isActive ? 'nav-item-active' : 'nav-item')}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EBF6F8] text-sm text-primary">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="mt-auto rounded-2xl border border-[#D8EAF1] bg-[#F2F9FB] p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
                  {(me.display_name ?? me.username).slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-primary">{me.display_name ?? me.username}</p>
                  <p className="text-xs text-primary/60">{me.email}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  void handleLogout();
                }}
                type="button"
                className="btn-ghost w-full"
              >
                Log out
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <header className="mb-8 flex flex-col gap-4 border-b border-[#D8EAF1] pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="section-label">Overview</p>
              <h1 className="page-title">{title}</h1>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative">
                <input
                  aria-label="Search"
                  className="input-field w-full min-w-[220px] pl-10"
                  placeholder="Search posts"
                  type="search"
                />
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary/45">?</span>
              </div>
              <Link to="/create-post" className="btn-primary">
                New post
              </Link>
            </div>
          </header>

          <Outlet />
        </main>
      </div>
    </div>
  );
}

function DashboardPage() {
  const [user, setUser] = useState<AccountUser>(fallbackAccount);
  const [posts, setPosts] = useState<PostItem[]>(fallbackPosts);
  const [analytics, setAnalytics] = useState<AccountAnalytics>(fallbackAnalytics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [me, analyticsResult, postsResult] = await Promise.all([
          apiRequest<AccountUser>('/auth/me').catch(() => fallbackAccount),
          apiRequest<AccountAnalytics>('/analytics?range=30d').catch(() => fallbackAnalytics),
          apiRequest<{ posts: PostItem[] }>('/posts?limit=5&page=1').catch(() => ({ posts: fallbackPosts })),
        ]);

        if (!active) return;

        setUser(me);
        setAnalytics(analyticsResult);
        setPosts(postsResult.posts);
        setError(null);
      } catch {
        if (active) {
          setUser(fallbackAccount);
          setAnalytics(fallbackAnalytics);
          setPosts(fallbackPosts);
          setError('A live data source was unavailable, so sample dashboard data is shown.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const summaryCards = useMemo(
    () => [
      { label: 'Total Reach', value: formatCompactNumber(analytics.total_views), delta: '+18.2%', detail: 'vs last month', tone: 'primary' },
      { label: 'Published Posts', value: String(posts.filter((post) => post.status === 'published').length), delta: '+6', detail: 'this quarter', tone: 'accent' },
      { label: 'Avg. Engagement', value: '4.8%', delta: '+0.9%', detail: 'per article', tone: 'sky' },
      { label: 'Newsletter Signups', value: '2,140', delta: '+12.4%', detail: 'new this week', tone: 'lavender' },
    ],
    [analytics.total_views, posts],
  );

  const recentPosts = posts.slice(0, 3);
  const greeting = getGreeting();

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-[#D8EAF1] bg-[#F4FBFD] p-4 text-sm text-primary/75">{error}</div> : null}

      <section className="panel overflow-hidden bg-[linear-gradient(135deg,#07374B_0%,#0F6D87_100%)] p-6 text-white shadow-panel">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#D9F1F5]">Welcome back</p>
            <h2 className="mt-2 text-3xl font-bold">{greeting}, {user.display_name?.split(' ')[0] ?? user.username}</h2>
            <p className="mt-3 max-w-xl text-sm text-[#DBF3F5]">
              Your publishing pipeline is healthy. Today�s focus: review engagement, publish the next article, and keep the team aligned.
            </p>
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary bg-white/10 text-white hover:bg-white/20">View newsletter</button>
            <Link to="/create-post" className="btn-primary bg-accent text-primary hover:bg-[#72d6ca]">
              Create post
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((metric) => (
          <article
            key={metric.label}
            className={`metric-card ${metric.tone === 'primary' ? 'bg-[#F6F7FB]' : metric.tone === 'accent' ? 'bg-[#F0FCFB]' : metric.tone === 'sky' ? 'bg-[#F4FAFF]' : 'bg-[#F4F1FB]'}`}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-primary/70">{metric.label}</p>
              <span className="badge bg-[#DDF3F4] text-primary">{metric.delta}</span>
            </div>
            <div className="text-3xl font-bold text-primary">{metric.value}</div>
            <p className="mt-3 text-sm text-primary/65">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.55fr_0.95fr]">
        <div className="panel p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="section-label">Content</p>
              <h3 className="mt-1 text-xl font-bold text-primary">Recent posts</h3>
            </div>
            <Link to="/posts" className="text-sm font-semibold text-primary-hover hover:text-primary">
              View all
            </Link>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-dashed border-[#B7E3E8] bg-[#F4FBFD] p-6 text-sm text-primary/70">Loading posts�</div>
          ) : recentPosts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#B7E3E8] bg-[#F4FBFD] p-6 text-sm text-primary/70">
              No published content yet. Create your first post to start the pipeline.
            </div>
          ) : (
            <div className="space-y-4">
              {recentPosts.map((post) => (
                <article key={post.id} className="rounded-2xl border border-[#DAEEF2] bg-[#FAFDFF] p-4 transition-colors hover:border-[#B7E3E8]">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge bg-[#EAF7FF] text-primary">Content</span>
                        <span className={`badge ${statusBadgeClass(post.status)}`}>{statusLabel(post.status)}</span>
                      </div>
                      <h4 className="text-lg font-semibold text-primary">{post.title}</h4>
                      <p className="text-sm text-primary/65">{post.excerpt || 'No excerpt provided yet.'}</p>
                    </div>
                    <Link to={`/posts/${post.id}/edit`} className="btn-ghost">
                      Edit
                    </Link>
                  </div>

                  <div className="mt-4 grid gap-3 border-t border-[#D9EBF0] pt-4 text-sm text-primary/70 sm:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-primary/55">Published</p>
                      <p className="mt-1 font-medium text-primary">{formatDate(post.published_at ?? post.scheduled_for)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-primary/55">Views</p>
                      <p className="mt-1 font-medium text-primary">{formatCompactNumber(analytics.top_posts.find((item) => item.post_id === post.id)?.total_views ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-primary/55">Read rate</p>
                      <p className="mt-1 font-medium text-primary">{Math.min(99, Math.max(22, Math.round(((analytics.top_posts.find((item) => item.post_id === post.id)?.total_views ?? 0) / Math.max(1, analytics.total_views)) * 100))) }%</p>
                    </div>
                    <div className="flex justify-end">
                      <Link to="/analytics" className="text-sm font-semibold text-primary-hover hover:text-primary">
                        View insights
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="panel p-6">
            <p className="section-label">Quick actions</p>
            <h3 className="mt-1 text-xl font-bold text-primary">Start next</h3>
            <div className="mt-5 space-y-3">
              {quickActions.map((item) => (
                <div key={item.title} className="rounded-2xl border border-[#DCECF0] bg-[#F8FCFE] p-4">
                  <h4 className="font-semibold text-primary">{item.title}</h4>
                  <p className="mt-1 text-sm text-primary/65">{item.description}</p>
                  <button className="mt-3 btn-secondary w-full">{item.action}</button>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-6">
            <p className="section-label">Status</p>
            <h3 className="mt-1 text-xl font-bold text-primary">Publishing health</h3>
            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-primary/70">Article pipeline</span>
                  <span className="font-semibold text-primary">92%</span>
                </div>
                <div className="h-2 rounded-full bg-[#E9F0F3]">
                  <div className="h-2 w-[92%] rounded-full bg-primary" />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-primary/70">Audience growth</span>
                  <span className="font-semibold text-primary">76%</span>
                </div>
                <div className="h-2 rounded-full bg-[#E9F0F3]">
                  <div className="h-2 w-[76%] rounded-full bg-accent" />
                </div>
              </div>
              <div className="rounded-2xl border border-dashed border-[#B7E3E8] bg-[#F4FBFD] p-4 text-sm text-primary/70">
                No blockers this week. Next review is scheduled for Thursday morning.
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function PostsPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<PostItem[]>(fallbackPosts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await apiRequest<{ posts: PostItem[] }>('/posts?limit=20&page=1').catch(() => ({ posts: fallbackPosts }));

        if (active) {
          setPosts(response.posts);
          setError(null);
        }
      } catch {
        if (active) {
          setPosts(fallbackPosts);
          setError('Unable to reach the live posts endpoint, so local sample data is shown instead.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const handlePublish = async (postId: number) => {
    try {
      await apiRequest(`/posts/${postId}/publish`, { method: 'POST' });
      setPosts((current) => current.map((post) => (post.id === postId ? { ...post, status: 'published', published_at: new Date().toISOString() } : post)));
    } catch {
      setError('Publish action could not be completed. Please try again.');
    }
  };

  const handleDelete = async (postId: number) => {
    if (!window.confirm('Delete this post?')) {
      return;
    }

    try {
      await apiRequest(`/posts/${postId}`, { method: 'DELETE' });
      setPosts((current) => current.filter((post) => post.id !== postId));
    } catch {
      setError('Delete action could not be completed. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-[#D8EAF1] bg-[#F4FBFD] p-4 text-sm text-primary/75">{error}</div> : null}

      <section className="panel p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-label">Library</p>
            <h3 className="mt-1 text-xl font-bold text-primary">All posts</h3>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary">Filter</button>
            <Link to="/create-post" className="btn-primary">
              Create post
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-[#B7E3E8] bg-[#F4FBFD] p-6 text-sm text-primary/70">Loading your posts�</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#DCECF1]">
            <table className="min-w-full divide-y divide-[#DCECF1] bg-white text-left">
              <thead className="bg-[#F4FBFD]">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-primary/60">Title</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-primary/60">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-primary/60">Date</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-primary/60">Views</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-primary/60">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF5F7]">
                {posts.map((post) => (
                  <tr key={post.id} className="hover:bg-[#F7FCFD]">
                    <td className="px-4 py-4 font-medium text-primary">
                      <div>
                        <p>{post.title}</p>
                        <p className="text-xs text-primary/55">{post.slug}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`badge ${statusBadgeClass(post.status)}`}>{statusLabel(post.status)}</span>
                    </td>
                    <td className="px-4 py-4 text-primary/70">{formatDate(post.published_at ?? post.scheduled_for ?? post.created_at)}</td>
                    <td className="px-4 py-4 text-primary/70">{formatCompactNumber(post.status === 'published' ? 3400 : 1200)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button className="btn-ghost px-3 py-2" onClick={() => navigate(`/posts/${post.id}/edit`)} type="button">
                          Edit
                        </button>
                        {post.status !== 'published' ? (
                          <button className="btn-secondary px-3 py-2" onClick={() => void handlePublish(post.id)} type="button">
                            Publish
                          </button>
                        ) : null}
                        <button className="btn-secondary px-3 py-2" onClick={() => navigate(`/analytics?postId=${post.id}`)} type="button">
                          Review
                        </button>
                        <button className="btn-ghost px-3 py-2 text-[#915338]" onClick={() => void handleDelete(post.id)} type="button">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CreatePostPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  const [form, setForm] = useState({ title: '', excerpt: '', content: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    let active = true;

    const load = async () => {
      try {
        const post = await apiRequest<PostItem>(`/posts/${id}`);
        if (active) {
          setForm({
            title: post.title,
            excerpt: post.excerpt ?? '',
            content: '',
          });
        }
      } catch {
        if (active) {
          const fallbackPost = fallbackPosts.find((item) => item.id === Number(id));
          if (fallbackPost) {
            setForm({
              title: fallbackPost.title,
              excerpt: fallbackPost.excerpt ?? '',
              content: '',
            });
          }
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [id, isEditing]);

  const validate = () => {
    const nextErrors: FormErrors = {};

    if (!form.title.trim()) {
      nextErrors.title = 'A title is required.';
    }

    if (!form.content.trim()) {
      nextErrors.content = 'Post content is required.';
    }

    if (form.excerpt.trim().length > 0 && form.excerpt.trim().length < 12) {
      nextErrors.excerpt = 'Your excerpt should be at least 12 characters.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      setIsSuccess(false);
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        ...(form.excerpt.trim() ? { excerpt: form.excerpt.trim() } : {}),
      };

      if (isEditing && id) {
        await apiRequest(`/posts/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/posts', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setIsSuccess(true);
      setErrors({});
      if (!isEditing) {
        setForm({ title: '', excerpt: '', content: '' });
      }

      window.setTimeout(() => {
        if (isEditing) {
          navigate('/posts');
        }
      }, 500);
    } catch {
      setIsSuccess(false);
      setErrors({ title: 'Unable to save the post right now. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="panel p-6">
        <p className="section-label">Compose</p>
        <h3 className="mt-1 text-xl font-bold text-primary">{isEditing ? 'Edit post' : 'Create a new post'}</h3>

        <form className="mt-6 space-y-5" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <div>
            <label className="mb-2 block text-sm font-medium text-primary" htmlFor="title">
              Post title
            </label>
            <input
              id="title"
              className="input-field"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Your article title"
            />
            {errors.title ? <p className="mt-2 text-sm text-[#915338]">{errors.title}</p> : null}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-primary" htmlFor="excerpt">
              Excerpt
            </label>
            <textarea
              id="excerpt"
              className="input-field min-h-[90px] resize-y"
              value={form.excerpt}
              onChange={(event) => setForm((current) => ({ ...current, excerpt: event.target.value }))}
              placeholder="Optional summary for the listing and SEO preview."
            />
            {errors.excerpt ? <p className="mt-2 text-sm text-[#915338]">{errors.excerpt}</p> : null}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-primary" htmlFor="content">
              Content
            </label>
            <textarea
              id="content"
              className="input-field min-h-[220px] resize-y"
              value={form.content}
              onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
              placeholder="Write your article in Markdown or plain text..."
            />
            {errors.content ? <p className="mt-2 text-sm text-[#915338]">{errors.content}</p> : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" type="submit" disabled={isLoading}>
              {isLoading ? (isEditing ? 'Updating post...' : 'Saving draft...') : isEditing ? 'Update post' : 'Save draft'}
            </button>
            <button className="btn-secondary" type="button" onClick={() => navigate('/posts')}>
              Cancel
            </button>
          </div>

          {isSuccess ? (
            <div className="rounded-2xl border border-[#B7E3E8] bg-[#EAFBFD] p-4 text-sm text-primary">
              {isEditing ? 'Post updated successfully.' : 'Post draft saved successfully.'}
            </div>
          ) : null}
        </form>
      </section>

      <aside className="space-y-6">
        <div className="panel p-6">
          <p className="section-label">Preview</p>
          <h3 className="mt-1 text-xl font-bold text-primary">Article preview</h3>
          <div className="mt-5 rounded-2xl border border-[#D9EEF1] bg-[#F9FCFD] p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="badge bg-[#EAF7FF] text-primary">Draft</span>
            </div>
            <h4 className="text-xl font-bold text-primary">{form.title || 'Untitled draft'}</h4>
            <p className="mt-3 text-sm text-primary/70">{form.excerpt || 'Write a summary to preview how the article will appear to readers.'}</p>
            <div className="mt-4 rounded-xl border border-[#DCECF1] bg-white p-3 text-sm text-primary/70 whitespace-pre-wrap">
              {form.content || 'Your article body will appear here.'}
            </div>
          </div>
        </div>

        <div className="panel p-6">
          <p className="section-label">Publishing tips</p>
          <ul className="mt-4 space-y-3 text-sm text-primary/70">
            <li>� Keep the headline specific and benefit-driven.</li>
            <li>� Use one CTA near the conclusion.</li>
            <li>� Review the excerpt for clarity and tone.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [analytics, setAnalytics] = useState<AccountAnalytics>(fallbackAnalytics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = (searchParams.get('range') ?? '30d') as AnalyticsRange;
  const postId = searchParams.get('postId');

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const data = postId
          ? await apiRequest<AccountAnalytics>(`/analytics/${postId}?range=${range}`)
          : await apiRequest<AccountAnalytics>(`/analytics?range=${range}`);

        if (active) {
          setAnalytics(data);
          setError(null);
        }
      } catch {
        if (active) {
          setAnalytics(fallbackAnalytics);
          setError('Live analytics are temporarily unavailable, so the latest cached metrics are displayed.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [postId, range]);

  const rangeOptions: AnalyticsRange[] = ['7d', '30d', '90d', 'all'];

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-[#D8EAF1] bg-[#F4FBFD] p-4 text-sm text-primary/75">{error}</div> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <article className="metric-card bg-[#F0FCFB]">
          <p className="text-sm text-primary/70">Audience growth</p>
          <div className="mt-3 text-3xl font-bold text-primary">+24.8%</div>
          <p className="mt-3 text-sm text-primary/65">New readers this {range === '30d' ? 'month' : range === '7d' ? 'week' : range === 'all' ? 'period' : 'quarter'}</p>
        </article>
        <article className="metric-card bg-[#F4FAFF]">
          <p className="text-sm text-primary/70">Average time</p>
          <div className="mt-3 text-3xl font-bold text-primary">6m 18s</div>
          <p className="mt-3 text-sm text-primary/65">Across all published posts</p>
        </article>
        <article className="metric-card bg-[#F4F1FB]">
          <p className="text-sm text-primary/70">Returning readers</p>
          <div className="mt-3 text-3xl font-bold text-primary">41%</div>
          <p className="mt-3 text-sm text-primary/65">Compared to the last cycle</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="panel p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="section-label">Performance</p>
              <h3 className="mt-1 text-xl font-bold text-primary">{postId ? 'Post performance' : 'Traffic trend'}</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {rangeOptions.map((option) => (
                <button
                  key={option}
                  className={`btn-secondary px-3 py-2 ${range === option ? 'bg-[#E4F4F6] text-primary ring-1 ring-[#B7E3E8]' : ''}`}
                  onClick={() => setSearchParams({ ...(postId ? { postId } : {}), range: option })}
                  type="button"
                >
                  {option === 'all' ? 'All time' : `Last ${option === '7d' ? '7 days' : option === '30d' ? '30 days' : '90 days'}`}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-dashed border-[#B7E3E8] bg-[#F4FBFD] p-6 text-sm text-primary/70">Loading analytics�</div>
          ) : (
            <div className="rounded-2xl border border-[#D9EDF1] bg-[#F8FCFD] p-4">
              <div className="mb-4 flex items-end justify-between text-sm text-primary/70">
                <span>Total views</span>
                <strong className="text-lg font-bold text-primary">{formatCompactNumber(analytics.total_views)}</strong>
              </div>
              <div className="flex h-52 items-end gap-3">
                {analytics.top_posts.length > 0 ? (
                  analytics.top_posts.map((item, index) => (
                    <div key={item.slug} className="flex flex-1 flex-col items-center justify-end gap-2">
                      <div
                        className="w-full rounded-t-xl bg-gradient-to-t from-primary via-[#0F6D87] to-accent"
                        style={{ height: `${Math.max(18, Math.min(100, 18 + (item.total_views / Math.max(1, analytics.top_posts[0].total_views)) * 82))}%` }}
                      />
                      <span className="text-[10px] uppercase tracking-[0.12em] text-primary/55">
                        {index === 0 ? '1' : index === 1 ? '2' : '3'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-primary/70">No analytics data available yet.</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="panel p-6">
          <p className="section-label">Top content</p>
          <h3 className="mt-1 text-xl font-bold text-primary">Best performing posts</h3>
          <div className="mt-5 space-y-4">
            {analytics.top_posts.map((item) => (
              <div key={item.post_id} className="flex items-center justify-between rounded-2xl border border-[#DCECF1] bg-[#F8FCFD] p-3">
                <div>
                  <p className="font-medium text-primary">{item.title}</p>
                  <p className="text-xs uppercase tracking-[0.12em] text-primary/55">{formatCompactNumber(item.total_views)} views</p>
                </div>
                <span className="badge bg-[#DDF3F4] text-primary">{Math.min(99, Math.round((item.total_views / Math.max(1, analytics.total_views)) * 100))}%</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AccountPage() {
  const [account, setAccount] = useState<AccountUser>(fallbackAccount);
  const [keys, setKeys] = useState<ApiKeyItem[]>(fallbackKeys);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [me, keyList] = await Promise.all([
          apiRequest<AccountUser>('/auth/me').catch(() => fallbackAccount),
          apiRequest<ApiKeyItem[]>('/keys').catch(() => fallbackKeys),
        ]);

        if (active) {
          setAccount(me);
          setKeys(keyList);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      return;
    }

    try {
      const result = await apiRequest<{ raw_key: string } & { id: number }>(`/keys`, {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      setCreatedKey(result.raw_key);
      setNewKeyName('');
      const next = await apiRequest<ApiKeyItem[]>('/keys').catch(() => fallbackKeys);
      setKeys(next);
    } catch {
      setCreatedKey('Unable to create a key right now. Please try again.');
    }
  };

  const handleRevokeKey = async (keyId: number) => {
    try {
      await apiRequest(`/keys/${keyId}`, { method: 'DELETE' });
      const next = await apiRequest<ApiKeyItem[]>('/keys').catch(() => fallbackKeys);
      setKeys(next);
    } catch {
      // Intentionally ignore revoke errors for now.
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="panel p-6">
        <p className="section-label">Profile</p>
        <h3 className="mt-1 text-xl font-bold text-primary">Account details</h3>

        {loading ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#B7E3E8] bg-[#F4FBFD] p-6 text-sm text-primary/70">Loading account details�</div>
        ) : (
          <>
            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-[#DCECF1] bg-[#F8FCFD] p-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-semibold text-white">
                {(account.display_name ?? account.username).slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-semibold text-primary">{account.display_name ?? account.username}</p>
                <p className="text-sm text-primary/65">{account.email}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[#DCECF1] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-primary/55">Role</p>
                <p className="mt-2 font-semibold text-primary">Editor-in-Chief</p>
              </div>
              <div className="rounded-2xl border border-[#DCECF1] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-primary/55">Username</p>
                <p className="mt-2 font-semibold text-primary">@{account.username}</p>
              </div>
              <div className="rounded-2xl border border-[#DCECF1] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-primary/55">Bio</p>
                <p className="mt-2 font-semibold text-primary">{account.bio || 'No bio provided yet.'}</p>
              </div>
              <div className="rounded-2xl border border-[#DCECF1] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-primary/55">Member since</p>
                <p className="mt-2 font-semibold text-primary">{formatDate(account.created_at)}</p>
              </div>
            </div>
          </>
        )}
      </section>

      <aside className="space-y-6">
        <div className="panel p-6">
          <p className="section-label">API keys</p>
          <h3 className="mt-1 text-xl font-bold text-primary">Connected tools</h3>

          <div className="mt-5 flex gap-2">
            <input
              className="input-field"
              placeholder="e.g. Cursor"
              value={newKeyName}
              onChange={(event) => setNewKeyName(event.target.value)}
            />
            <button className="btn-primary" onClick={() => void handleCreateKey()} type="button">
              Create
            </button>
          </div>

          {createdKey ? (
            <div className="mt-4 rounded-2xl border border-[#B7E3E8] bg-[#EAFBFD] p-4 text-sm text-primary">
              <p className="font-semibold">New API key generated</p>
              <p className="mt-1 break-all">{createdKey}</p>
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            {keys.map((key) => (
              <div key={key.id} className="rounded-2xl border border-[#DCECF1] bg-[#F8FCFD] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-primary">{key.name}</p>
                    <p className="text-xs uppercase tracking-[0.12em] text-primary/55">{key.key_prefix}</p>
                  </div>
                  <button className="btn-ghost px-3 py-2 text-[#915338]" onClick={() => void handleRevokeKey(key.id)} type="button">
                    Revoke
                  </button>
                </div>
                <div className="mt-3 text-xs text-primary/65">
                  <p>Created: {formatDate(key.created_at)}</p>
                  <p>Last used: {key.last_used_at ? formatDate(key.last_used_at) : 'Never'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-6">
          <p className="section-label">Security</p>
          <h3 className="mt-1 text-xl font-bold text-primary">Session</h3>

          <div className="mt-5 space-y-4 rounded-2xl border border-[#DCECF1] bg-[#F9FCFD] p-4">
            <div>
              <p className="text-sm text-primary/70">Last sign in</p>
              <p className="mt-1 font-semibold text-primary">Today, 09:42 AM</p>
            </div>
            <div>
              <p className="text-sm text-primary/70">Two-factor authentication</p>
              <p className="mt-1 font-semibold text-primary">Enabled</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const validate = () => {
    const nextErrors: FormErrors = {};

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }

    if (form.password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      setIsSuccess(false);
      return;
    }

    setIsLoading(true);

    try {
      await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: form.email.trim(), password: form.password }),
      });

      setIsSuccess(true);
      setErrors({});
      window.setTimeout(() => navigate('/dashboard'), 400);
    } catch (error) {
      setIsSuccess(false);
      setErrors({ email: getErrorMessage(error) });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(178,226,249,0.35),transparent_32%),linear-gradient(180deg,#F0FAFC_0%,#EAF8FB_100%)] px-4 py-8">
      <div className="panel flex w-full max-w-5xl overflow-hidden">
        <div className="hidden w-1/2 bg-[linear-gradient(135deg,#07374B_0%,#0F6D87_100%)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#CDF0F4]">Quill</p>
            <h1 className="mt-4 text-4xl font-bold">Build a publishing system your team actually loves.</h1>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/5 p-5 backdrop-blur">
            <p className="text-sm text-[#E5F4F5]">�The dashboard makes content planning feel organized, calm, and fast.�</p>
            <p className="mt-4 text-sm font-medium text-[#EAF6F8]">Adarsh � Product Lead</p>
          </div>
        </div>

        <div className="w-full p-6 sm:p-8 lg:w-1/2">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="section-label">Sign in</p>
              <h2 className="mt-1 text-3xl font-bold text-primary">Welcome back</h2>
            </div>
            <Link to="/signup" className="text-sm font-semibold text-primary-hover hover:text-primary">
              Create account
            </Link>
          </div>

          <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <div>
              <label className="mb-2 block text-sm font-medium text-primary" htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                className="input-field"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="samia@quill.example"
              />
              {errors.email ? <p className="mt-2 text-sm text-[#915338]">{errors.email}</p> : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-primary" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                className="input-field"
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="At least 8 characters"
              />
              {errors.password ? <p className="mt-2 text-sm text-[#915338]">{errors.password}</p> : null}
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-primary/70">
                <input type="checkbox" className="h-4 w-4 rounded border-[#B8D9E0] text-primary focus:ring-primary" />
                Keep me signed in
              </label>
              <button className="font-semibold text-primary-hover hover:text-primary" type="button">
                Forgot password?
              </button>
            </div>

            <button className="btn-primary w-full" type="submit" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>

            {isSuccess ? (
              <div className="rounded-2xl border border-[#B7E3E8] bg-[#EAFBFD] p-4 text-sm text-primary">
                Signed in successfully. Redirecting to the dashboard�
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}

function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const validate = () => {
    const nextErrors: FormErrors = {};

    if (form.name.trim().length < 2) {
      nextErrors.name = 'Your name should be at least 2 characters.';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }

    if (form.password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters.';
    }

    if (form.confirmPassword !== form.password) {
      nextErrors.confirmPassword = 'Passwords must match.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      setIsSuccess(false);
      return;
    }

    setIsLoading(true);

    try {
      await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: form.name.trim().toLowerCase().replace(/\s+/g, '_'),
          email: form.email.trim(),
          password: form.password,
        }),
      });

      setIsSuccess(true);
      setErrors({});
      window.setTimeout(() => navigate('/dashboard'), 400);
    } catch (error) {
      setIsSuccess(false);
      setErrors({ email: getErrorMessage(error) });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(178,226,249,0.35),transparent_32%),linear-gradient(180deg,#F0FAFC_0%,#EAF8FB_100%)] px-4 py-8">
      <div className="panel flex w-full max-w-5xl overflow-hidden">
        <div className="hidden w-1/2 bg-[linear-gradient(135deg,#07374B_0%,#0F6D87_100%)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#CDF0F4]">Quill</p>
            <h1 className="mt-4 text-4xl font-bold">Launch your next content chapter.</h1>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/5 p-5 backdrop-blur">
            <p className="text-sm text-[#E5F4F5]">�The collaboration flows stretch across posts, analytics, and publishing without adding chaos.�</p>
            <p className="mt-4 text-sm font-medium text-[#EAF6F8]">Nadia � Growth Editorial</p>
          </div>
        </div>

        <div className="w-full p-6 sm:p-8 lg:w-1/2">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="section-label">Create account</p>
              <h2 className="mt-1 text-3xl font-bold text-primary">Get started</h2>
            </div>
            <Link to="/login" className="text-sm font-semibold text-primary-hover hover:text-primary">
              Sign in
            </Link>
          </div>

          <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <div>
              <label className="mb-2 block text-sm font-medium text-primary" htmlFor="signup-name">
                Full name
              </label>
              <input
                id="signup-name"
                className="input-field"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Samia L."
              />
              {errors.name ? <p className="mt-2 text-sm text-[#915338]">{errors.name}</p> : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-primary" htmlFor="signup-email">
                Work email
              </label>
              <input
                id="signup-email"
                className="input-field"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="samia@quill.example"
              />
              {errors.email ? <p className="mt-2 text-sm text-[#915338]">{errors.email}</p> : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-primary" htmlFor="signup-password">
                Password
              </label>
              <input
                id="signup-password"
                className="input-field"
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="At least 8 characters"
              />
              {errors.password ? <p className="mt-2 text-sm text-[#915338]">{errors.password}</p> : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-primary" htmlFor="signup-confirm-password">
                Confirm password
              </label>
              <input
                id="signup-confirm-password"
                className="input-field"
                type="password"
                value={form.confirmPassword}
                onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                placeholder="Repeat your password"
              />
              {errors.confirmPassword ? <p className="mt-2 text-sm text-[#915338]">{errors.confirmPassword}</p> : null}
            </div>

            <button className="btn-primary w-full" type="submit" disabled={isLoading}>
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>

            {isSuccess ? (
              <div className="rounded-2xl border border-[#B7E3E8] bg-[#EAFBFD] p-4 text-sm text-primary">
                Account created successfully. Redirecting to your workspace�
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}

function PublicBlogPage() {
  const { username } = useParams();
  const [postsResult, setPostsResult] = useState<PublicPostsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await apiRequest<PublicPostsResult>(`/public/${username}/posts`);
        if (active) {
          setPostsResult(data);
          setError(null);
        }
      } catch {
        if (active) {
          setPostsResult(null);
          setError('This public blog could not be found or has no published posts yet.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [username]);

  return (
    <div className="min-h-screen bg-[#F5FBFC] px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 rounded-2xl border border-[#D5EDF1] bg-white p-6 shadow-panel">
          <p className="section-label">Public blog</p>
          <h1 className="mt-2 text-3xl font-bold text-primary">{postsResult?.author.display_name ?? postsResult?.author.username ?? username ?? 'Author'}</h1>
          <p className="mt-3 max-w-2xl text-sm text-primary/70">{postsResult?.author.bio ?? 'No author bio available.'}</p>
        </header>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-[#B7E3E8] bg-[#F4FBFD] p-6 text-sm text-primary/70">Loading posts�</div>
        ) : error ? (
          <div className="rounded-2xl border border-[#D8EAF1] bg-[#F4FBFD] p-6 text-sm text-primary/70">{error}</div>
        ) : postsResult?.posts.length ? (
          <div className="space-y-4">
            {postsResult.posts.map((post) => (
              <article key={post.slug} className="panel p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="section-label">Featured</p>
                    <h2 className="mt-2 text-2xl font-bold text-primary">{post.title}</h2>
                  </div>
                  <Link to={`/blog/${username}/${post.slug}`} className="btn-primary">
                    Read article
                  </Link>
                </div>
                <p className="mt-4 text-sm text-primary/70">{post.excerpt}</p>
                <p className="mt-4 text-xs uppercase tracking-[0.12em] text-primary/55">{formatDate(post.published_at)}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#B7E3E8] bg-[#F4FBFD] p-6 text-sm text-primary/70">
            No published posts are available for this author yet.
          </div>
        )}
      </div>
    </div>
  );
}

function PublicPostPage() {
  const { username, slug } = useParams();
  const [post, setPost] = useState<PublicPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await apiRequest<PublicPost>(`/public/${username}/posts/${slug}`);
        if (active) {
          setPost(data);
          setError(null);
        }
      } catch {
        if (active) {
          setPost(null);
          setError('This public post could not be found.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [slug, username]);

  return (
    <div className="min-h-screen bg-[#F5FBFC] px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <Link to={`/blog/${username ?? 'samia'}`} className="mb-6 inline-flex items-center text-sm font-semibold text-primary-hover hover:text-primary">
          ? Back to blog
        </Link>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-[#B7E3E8] bg-[#F4FBFD] p-6 text-sm text-primary/70">Loading article�</div>
        ) : error ? (
          <div className="rounded-2xl border border-[#D8EAF1] bg-[#F4FBFD] p-6 text-sm text-primary/70">{error}</div>
        ) : post ? (
          <article className="panel overflow-hidden p-6 sm:p-8">
            <p className="section-label">Article</p>
            <h1 className="mt-2 text-3xl font-bold text-primary">{post.title}</h1>
            <p className="mt-4 text-sm text-primary/70">{post.seo_description ?? post.excerpt}</p>
            <div className="mt-6 rounded-2xl border border-[#DCECF1] bg-[#F8FCFD] p-4 text-sm text-primary/70">
              {post.published_at ? `Published ${formatDate(post.published_at)}` : 'Draft'}
            </div>
            <div className="mt-8 prose max-w-none whitespace-pre-wrap text-primary/80">{post.content}</div>
          </article>
        ) : null}
      </div>
    </div>
  );
}

const quickActions = [
  { title: 'Write a new post', description: 'Draft a fresh article from your mobile or desktop editor.', action: 'Open editor' },
  { title: 'Review analytics', description: 'Check engagement, retention, and top-performing content.', action: 'Open reports' },
  { title: 'Manage team access', description: 'Invite collaborators and assign publishing permissions.', action: 'Manage roles' },
];

const statusClassMap: Record<PostStatus, string> = {
  draft: 'bg-[#E8F0FF] text-[#0F6D87]',
  published: 'bg-[#DFF8F0] text-[#0F6D87]',
  scheduled: 'bg-[#F5EAFB] text-[#5E4E8D]',
};

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const raw = await response.text();
  const payload: unknown = raw ? (JSON.parse(raw) as unknown) : null;

  if (!response.ok) {
    const payloadRecord = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;

    const message =
      typeof payloadRecord?.message === 'string'
        ? payloadRecord.message
        : typeof payloadRecord?.error === 'object' && payloadRecord.error !== null && 'message' in payloadRecord.error
          ? typeof payloadRecord.error.message === 'string'
            ? payloadRecord.error.message
            : 'Request failed'
          : 'Request failed';

    throw new Error(message);
  }

  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '�';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCompactNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return String(value);
}

function statusLabel(status: PostStatus): string {
  return status === 'draft' ? 'Draft' : status === 'published' ? 'Published' : 'Scheduled';
}

function statusBadgeClass(status: PostStatus): string {
  return statusClassMap[status];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

export default App;
