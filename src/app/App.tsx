import { BrowserRouter } from 'react-router'
import { Shell } from './Shell'
import { ToastProvider } from './Toast'
import { UpdatePrompt } from './UpdatePrompt'

export default function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/'
  return (
    <BrowserRouter basename={basename}>
      <ToastProvider>
        <Shell />
        <UpdatePrompt />
      </ToastProvider>
    </BrowserRouter>
  )
}
