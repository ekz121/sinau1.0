import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar'
import BottomNav from '../components/BottomNav'
import Sidebar from '../components/Sidebar'

export default function StudentLayout() {
  return (
    <div className="min-h-screen bg-[#FFFFFF]">
      {/* Mobile top navbar */}
      <div className="md:hidden">
        <Navbar />
      </div>

      <div className="flex">
        {/* Desktop sidebar */}
        <Sidebar />

        {/* Main content — offset by sidebar on desktop */}
        <main className="flex-1 md:ml-60 min-h-screen">
          <div className="max-w-5xl mx-auto px-4 py-4 pb-24 md:pb-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  )
}
