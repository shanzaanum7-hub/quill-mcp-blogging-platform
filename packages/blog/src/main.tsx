import { useEffect, useState, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import './index.css';

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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/blog/:username" element={<PublicBlogPage />} />
        <Route path="/blog/:username/:slug" element={<PublicPostPage />} />
        <Route path="/:username" element={<PublicBlogPage />} />
        <Route path="/:username/:slug" element={<PublicPostPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function PublicBlogPage() {
  const { username } = useParams();
  const [result, setResult] = useState<PublicPostsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await apiRequest<PublicPostsResult>(`/public/${username}/posts`);
        if (active) {
          setResult(data);
          setError(null);
        }
      } catch {
        if (active) setError('This public blog could not be found.');
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [username]);

  return (
    <BlogShell>
      <header className="blog-header">
        <p className="eyebrow">Public blog</p>
        <h1>{result?.author.display_name ?? result?.author.username ?? username}</h1>
        <p>{result?.author.bio ?? 'Published writing from Quill.'}</p>
      </header>

      {error ? <Message>{error}</Message> : result?.posts.length ? (
        <div className="post-list">
          {result.posts.map((post) => (
            <article className="post-card" key={post.slug}>
              <p className="eyebrow">Article</p>
              <h2>{post.title}</h2>
              <p>{post.excerpt ?? 'Read the full article.'}</p>
              <Link className="button" to={`/blog/${username}/${post.slug}`}>Read article</Link>
            </article>
          ))}
        </div>
      ) : result ? (
        <Message>No published posts are available yet.</Message>
      ) : (
        <Message>Loading posts...</Message>
      )}
    </BlogShell>
  );
}

function PublicPostPage() {
  const { username, slug } = useParams();
  const [post, setPost] = useState<PublicPost | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        // The API detail request records the page_view server-side.
        const data = await apiRequest<PublicPost>(`/public/${username}/posts/${slug}`);
        if (active) {
          setPost(data);
          setError(null);
        }
      } catch {
        if (active) setError('This public post could not be found.');
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [slug, username]);

  return (
    <BlogShell>
      <Link className="back-link" to={`/blog/${username}`}>Back to blog</Link>
      {error ? <Message>{error}</Message> : post ? (
        <article className="article">
          <p className="eyebrow">Article</p>
          <h1>{post.title}</h1>
          <p className="article-meta">{post.published_at ? formatDate(post.published_at) : 'Published'}</p>
          <div className="article-content">{post.content}</div>
        </article>
      ) : (
        <Message>Loading article...</Message>
      )}
    </BlogShell>
  );
}

function BlogShell({ children }: { children: ReactNode }) {
  return <main className="blog-shell"><div className="blog-content">{children}</div></main>;
}

function Message({ children }: { children: ReactNode }) {
  return <div className="message">{children}</div>;
}

async function apiRequest<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`, { headers: { Accept: 'application/json' } });
  const payload: unknown = await response.json();

  if (!response.ok) throw new Error('Request failed');
  if (payload && typeof payload === 'object' && 'data' in payload) return (payload as { data: T }).data;
  return payload as T;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in the DOM');
}

ReactDOM.createRoot(rootElement).render(
  <App />,
);
