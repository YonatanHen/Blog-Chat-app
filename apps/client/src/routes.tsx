import { createBrowserRouter, Outlet } from 'react-router'
import { PageShell } from './components/layouts/PageShell.js'
import { BlogFeedPage } from './pages/BlogFeedPage.js'
import { PostPage } from './pages/PostPage.js'
import { NewPostPage } from './pages/NewPostPage.js'
import { EditPostPage } from './pages/EditPostPage.js'
import { LoginPage } from './pages/LoginPage.js'
import { SignupPage } from './pages/SignupPage.js'

export const router = createBrowserRouter([
  {
    element: (
      <PageShell>
        <Outlet />
      </PageShell>
    ),
    children: [
      { path: '/', element: <BlogFeedPage /> },
      { path: '/blog/new', element: <NewPostPage /> },
      { path: '/blog/:slug', element: <PostPage /> },
      { path: '/blog/:slug/edit', element: <EditPostPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
    ],
  },
])
