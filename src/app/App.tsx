import { BrowserRouter } from 'react-router'
import { Shell } from './Shell'
import { ToastProvider } from './Toast'
import { UpdatePrompt } from './UpdatePrompt'

export default function App() {
  // Keep the base path's trailing slash (/focus/). Stripped, links to Today point at /focus, which is
  // outside the service worker's scope, so refreshing Today without a connection fails.
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ToastProvider>
        <Shell />
        <UpdatePrompt />
      </ToastProvider>
    </BrowserRouter>
  )
}
