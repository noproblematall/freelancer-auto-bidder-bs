import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-navy-950 dark:to-navy-900">
      <Sidebar />
      <Header />
      <main className="flex-1 ml-66 pt-16 p-8">
        <Outlet />
      </main>
    </div>
  )
}
