import { useState, type FormEvent } from 'react';
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
} from 'react-router-dom';

type RouteKey = 'Dashboard' | 'Posts' | 'Create Post' | 'Analytics' | 'Account';

type FormErrors = Partial<Record<'name' | 'email' | 'password' | 'confirmPassword' | 'title' | 'summary' | 'category', string>>;

type PostItem = {
  id: string;
  title: string;
  excerpt: string;
  status: 'Draft' | 'Published' | 'Scheduled';
  category: string;
  publishedAt: string;
  views: string;
  reads: string;
};

const navigationItems = [
  { label: 'Dashboard', to: '/dashboard', icon: '▣' },
  { label: 'Posts', to: '/posts', icon: '◫' },
  { label: 'Create Post', to: '/create-post', icon: '+' },
  { label: 'Analytics', to: '/analytics', icon: '◌' },
  { label: 'Account', to: '/account', icon: '◎' },
];

const routeTitles: Record<string, RouteKey> = {
  '/dashboard': 'Dashboard',
  '/posts': 'Posts',
  '/create-post': 'Create Post',
  '/analytics': 'Analytics',
  '/account': 'Account',
};

const metrics = [
  { label: 'Total Reach', value: '128.4K', delta: '+18.2%', detail: 'vs last month', tone: 'primary' },
  { label: 'Published Posts', value: '34', delta: '+6', detail: 'this quarter', tone: 'accent' },
  { label: 'Avg. Engagement', value: '4.8%', delta: '+0.9%', detail: 'per article', tone: 'sky' },
  { label: 'Newsletter Signups', value: '2,140', delta: '+12.4%', detail: 'new this week', tone: 'lavender' },
];

const recentPosts: PostItem[] = [
  {
    id: '1',
    title: 'Designing Better Onboarding Flows',
    excerpt: 'A practical guide to reducing drop-off and improving activation for new readers.',
    status: 'Published',
    category: 'Product',
    publishedAt: 'Sep 08, 2026',
    views: '18.4K',
    reads: '82%',
  },
  {
    id: '2',
    title: 'How AI-Assisted Publishing Changes Editorial Work',
    excerpt: 'Why teams are moving to collaborative workflows and what it means for quality.',
    status: 'Scheduled',
    category: 'Strategy',
    publishedAt: 'Sep 12, 2026',
    views: '4.1K',
    reads: '68%',
  },
  {
    id: '3',
    title: 'Building Trust Through Transparent Writing',
    excerpt: 'Simple editorial systems that help readers feel confident in your content.',
    status: 'Draft',
    category: 'Writing',
    publishedAt: 'Draft',
    views: '0',
    reads: '-',
  },
];

const quickActions = [
  { title: 'Write a new post', description: 'Draft a fresh article from your mobile or desktop editor.', action: 'Open editor' },
  { title: 'Review analytics', description: 'Check engagement, retention, and top-performing content.', action: 'Open reports' },
  { title: 'Manage team access', description: 'Invite collaborators and assign publishing permissions.', action: 'Manage roles' },
];

const analyticsSeries = [68, 94, 80, 120, 110, 136, 118];

const postsTable = [
  { title: 'A Smarter Editorial Calendar', status: 'Published', date: 'Sep 02', views: '14.8K' },
  { title: 'Improving Reader Retention', status: 'Scheduled', date: 'Sep 07', views: '6.4K' },
  { title: 'What Makes A Newsletter Valuable', status: 'Draft', date: 'Sep 11', views: '1.2K' },
];

const statusClassMap: Record<PostItem['status'], string> = {
  Draft: 'bg-[#E8F0FF] text-[#0F6D87]',
  Published: 'bg-[#DFF8F0] text-[#0F6D87]',
  Scheduled: 'bg-[#F5EAFB] text-[#5E4E8D]',
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/posts" element={<PostsPage />} />
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
  const title = routeTitles[location.pathname] ?? 'Dashboard';

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
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">SL</div>
                <div>
                  <p className="text-sm font-semibold text-primary">Samia L.</p>
                  <p className="text-xs text-primary/60">Editor-in-Chief</p>
                </div>
              </div>
              <Link to="/login" className="btn-ghost w-full">
                Log out
              </Link>
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
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary/45">⌕</span>
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
  return (
    <div className="space-y-6">
      <section className="panel overflow-hidden bg-[linear-gradient(135deg,#07374B_0%,#0F6D87_100%)] p-6 text-white shadow-panel">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#D9F1F5]">Welcome back</p>
            <h2 className="mt-2 text-3xl font-bold">Good morning, Samia</h2>
            <p className="mt-3 max-w-xl text-sm text-[#DBF3F5]">
              Your publishing pipeline is healthy. Today’s focus: review engagement, publish the next article, and keep the team aligned.
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
        {metrics.map((metric) => (
          <article key={metric.label} className={`metric-card ${metric.tone === 'primary' ? 'bg-[#F6F7FB]' : metric.tone === 'accent' ? 'bg-[#F0FCFB]' : metric.tone === 'sky' ? 'bg-[#F4FAFF]' : 'bg-[#F4F1FB]'}`}>
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

          <div className="space-y-4">
            {recentPosts.map((post) => (
              <article key={post.id} className="rounded-2xl border border-[#DAEEF2] bg-[#FAFDFF] p-4 transition-colors hover:border-[#B7E3E8]">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge bg-[#EAF7FF] text-primary">{post.category}</span>
                      <span className={`badge ${statusClassMap[post.status]}`}>{post.status}</span>
                    </div>
                    <h4 className="text-lg font-semibold text-primary">{post.title}</h4>
                    <p className="text-sm text-primary/65">{post.excerpt}</p>
                  </div>
                  <button className="btn-ghost">Edit</button>
                </div>

                <div className="mt-4 grid gap-3 border-t border-[#D9EBF0] pt-4 text-sm text-primary/70 sm:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-primary/55">Published</p>
                    <p className="mt-1 font-medium text-primary">{post.publishedAt}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-primary/55">Views</p>
                    <p className="mt-1 font-medium text-primary">{post.views}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-primary/55">Read rate</p>
                    <p className="mt-1 font-medium text-primary">{post.reads}</p>
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
  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-label">Library</p>
            <h3 className="mt-1 text-xl font-bold text-primary">All posts</h3>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary">Filter</button>
            <Link to="/create-post" className="btn-primary">Create post</Link>
          </div>
        </div>

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
              {postsTable.map((post) => (
                <tr key={post.title} className="hover:bg-[#F7FCFD]">
                  <td className="px-4 py-4 font-medium text-primary">{post.title}</td>
                  <td className="px-4 py-4">
                    <span className={`badge ${post.status === 'Published' ? 'bg-[#DFF8F0] text-[#0F6D87]' : post.status === 'Scheduled' ? 'bg-[#F5EAFB] text-[#5E4E8D]' : 'bg-[#E8F0FF] text-[#0F6D87]'}`}>
                      {post.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-primary/70">{post.date}</td>
                  <td className="px-4 py-4 text-primary/70">{post.views}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <button className="btn-ghost px-3 py-2">Edit</button>
                      <button className="btn-secondary px-3 py-2">Review</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CreatePostPage() {
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({ title: '', summary: '', category: '' });

  const validate = () => {
    const nextErrors: FormErrors = {};

    if (!form.title.trim()) {
      nextErrors.title = 'A title is required.';
    }

    if (!form.summary.trim() || form.summary.trim().length < 24) {
      nextErrors.summary = 'Write at least 24 characters for the summary.';
    }

    if (!form.category.trim()) {
      nextErrors.category = 'Choose a category.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      setIsSubmitted(false);
      return;
    }

    setIsLoading(true);
    setIsSubmitted(false);

    window.setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
    }, 650);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="panel p-6">
        <p className="section-label">Compose</p>
        <h3 className="mt-1 text-xl font-bold text-primary">Create a new post</h3>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
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
            <label className="mb-2 block text-sm font-medium text-primary" htmlFor="category">
              Category
            </label>
            <select
              id="category"
              className="input-field"
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
            >
              <option value="">Select a category</option>
              <option value="Marketing">Marketing</option>
              <option value="Product">Product</option>
              <option value="Writing">Writing</option>
              <option value="Strategy">Strategy</option>
            </select>
            {errors.category ? <p className="mt-2 text-sm text-[#915338]">{errors.category}</p> : null}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-primary" htmlFor="summary">
              Summary
            </label>
            <textarea
              id="summary"
              className="input-field min-h-[120px] resize-y"
              value={form.summary}
              onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
              placeholder="Describe the article, value proposition, and audience."
            />
            {errors.summary ? <p className="mt-2 text-sm text-[#915338]">{errors.summary}</p> : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" type="submit" disabled={isLoading}>
              {isLoading ? 'Saving draft...' : 'Save draft'}
            </button>
            <button className="btn-secondary" type="button">
              Schedule publish
            </button>
          </div>

          {isSubmitted ? (
            <div className="rounded-2xl border border-[#B7E3E8] bg-[#EAFBFD] p-4 text-sm text-primary">
              Post draft saved successfully. You can continue editing or publish it when ready.
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
              <span className="badge bg-[#EAF7FF] text-primary">{form.category || 'Category'}</span>
              <span className="badge bg-[#E8F0FF] text-primary">Draft</span>
            </div>
            <h4 className="text-xl font-bold text-primary">{form.title || 'Untitled draft'}</h4>
            <p className="mt-3 text-sm text-primary/70">{form.summary || 'Write a summary to preview how the article will appear to readers.'}</p>
          </div>
        </div>

        <div className="panel p-6">
          <p className="section-label">Publishing tips</p>
          <ul className="mt-4 space-y-3 text-sm text-primary/70">
            <li>• Keep the headline specific and benefit-driven.</li>
            <li>• Use one CTA near the conclusion.</li>
            <li>• Review the excerpt for clarity and tone.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <article className="metric-card bg-[#F0FCFB]">
          <p className="text-sm text-primary/70">Audience growth</p>
          <div className="mt-3 text-3xl font-bold text-primary">+24.8%</div>
          <p className="mt-3 text-sm text-primary/65">New readers this month</p>
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
              <h3 className="mt-1 text-xl font-bold text-primary">Traffic trend</h3>
            </div>
            <button className="btn-secondary">Last 30 days</button>
          </div>

          <div className="flex h-52 items-end gap-3 rounded-2xl border border-[#D9EDF1] bg-[#F8FCFD] p-4">
            {analyticsSeries.map((height, index) => (
              <div key={height + index} className="flex flex-1 flex-col items-center justify-end gap-2">
                <div className="w-full rounded-t-xl bg-gradient-to-t from-primary via-[#0F6D87] to-accent" style={{ height: `${height}%` }} />
                <span className="text-[10px] uppercase tracking-[0.12em] text-primary/55">{['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-6">
          <p className="section-label">Top content</p>
          <h3 className="mt-1 text-xl font-bold text-primary">Best performing posts</h3>
          <div className="mt-5 space-y-4">
            {[
              { title: 'Designing Better Onboarding Flows', score: '96%' },
              { title: 'AI-Assisted Publishing', score: '89%' },
              { title: 'Transparent Writing', score: '84%' },
            ].map((item) => (
              <div key={item.title} className="flex items-center justify-between rounded-2xl border border-[#DCECF1] bg-[#F8FCFD] p-3">
                <div>
                  <p className="font-medium text-primary">{item.title}</p>
                  <p className="text-xs uppercase tracking-[0.12em] text-primary/55">Engagement</p>
                </div>
                <span className="badge bg-[#DDF3F4] text-primary">{item.score}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AccountPage() {
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate('/login');
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="panel p-6">
        <p className="section-label">Profile</p>
        <h3 className="mt-1 text-xl font-bold text-primary">Account details</h3>

        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-[#DCECF1] bg-[#F8FCFD] p-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-semibold text-white">SL</div>
          <div>
            <p className="text-lg font-semibold text-primary">Samia L.</p>
            <p className="text-sm text-primary/65">samia@quill.example</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#DCECF1] bg-white p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-primary/55">Role</p>
            <p className="mt-2 font-semibold text-primary">Editor-in-Chief</p>
          </div>
          <div className="rounded-2xl border border-[#DCECF1] bg-white p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-primary/55">Location</p>
            <p className="mt-2 font-semibold text-primary">Lahore, Pakistan</p>
          </div>
          <div className="rounded-2xl border border-[#DCECF1] bg-white p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-primary/55">Team</p>
            <p className="mt-2 font-semibold text-primary">Content & Audience</p>
          </div>
          <div className="rounded-2xl border border-[#DCECF1] bg-white p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-primary/55">Plan</p>
            <p className="mt-2 font-semibold text-primary">Growth Pro</p>
          </div>
        </div>
      </section>

      <aside className="panel p-6">
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

        <button className="btn-primary mt-6 w-full" onClick={handleLogout} type="button">
          Log out
        </button>
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      setIsSuccess(false);
      return;
    }

    setIsLoading(true);
    window.setTimeout(() => {
      setIsLoading(false);
      setIsSuccess(true);
      window.setTimeout(() => navigate('/dashboard'), 400);
    }, 700);
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
            <p className="text-sm text-[#E5F4F5]">“The dashboard makes content planning feel organized, calm, and fast.”</p>
            <p className="mt-4 text-sm font-medium text-[#EAF6F8]">Adarsh • Product Lead</p>
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

          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
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
                Signed in successfully. Redirecting to the dashboard…
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      setIsSuccess(false);
      return;
    }

    setIsLoading(true);
    window.setTimeout(() => {
      setIsLoading(false);
      setIsSuccess(true);
      window.setTimeout(() => navigate('/dashboard'), 400);
    }, 700);
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
            <p className="text-sm text-[#E5F4F5]">“The collaboration flows stretch across posts, analytics, and publishing without adding chaos.”</p>
            <p className="mt-4 text-sm font-medium text-[#EAF6F8]">Nadia • Growth Editorial</p>
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

          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
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
                Account created successfully. Redirecting to your workspace…
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
