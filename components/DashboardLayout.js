"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import {
  LayoutDashboard,
  Package,
  Factory,
  FileText,
  BarChart3,
  Users,
  HelpCircle,
  Settings,
  Menu,
  X,
  Bell,
  Mail,
  LogOut,
  Sun,
  Moon,
} from "lucide-react"
import Breadcrumb from "./Breadcrumb"

export default function DashboardLayout({ children, activeMenu }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [theme, setTheme] = useState("light") // "light" or "dark"
  const router = useRouter()
  const pathname = usePathname()

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem("dashboard-theme")
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    
    if (savedTheme) {
      setTheme(savedTheme)
    } else if (systemPrefersDark) {
      setTheme("dark")
    }
  }, [])

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement
    if (theme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
    localStorage.setItem("dashboard-theme", theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === "light" ? "dark" : "light")
  }

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated")
    router.push("/login")
  }

  const navItems = [
    { key: "dashboard", name: "Dashboard", href: "/project-manager/dashboard", icon: LayoutDashboard, active: true },
    { key: "inventory", name: "Inventory", href: "/project-manager/dashboard/inventory", icon: Package, active: true },
    { key: "production", name: "Production", href: "/project-manager/dashboard/production", icon: Factory, active: true },
    { key: "order", name: "Order", href: "/project-manager/dashboard/order", icon: FileText, active: false },
    { key: "report", name: "Report", href: "/project-manager/dashboard/report", icon: BarChart3, active: false },
    { key: "users", name: "User Access", href: "/project-manager/dashboard/users", icon: Users, active: false },
    { key: "support", name: "Support", href: "/project-manager/dashboard/support", icon: HelpCircle, active: false },
    { key: "settings", name: "Setting", href: "/project-manager/dashboard/settings", icon: Settings, active: false },
  ]

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Overlay (mobile only) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-50
          w-64 transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:${sidebarOpen ? "translate-x-0" : "-translate-x-64"}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo + Close */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">G</span>
              </div>
              <div>
                <h1 className="text-gray-900 dark:text-white font-semibold text-lg">Grav Clothing</h1>
                <p className="text-gray-500 dark:text-gray-400 text-xs">Project Manager</p>
              </div>
            </div>

            {/* Close button (desktop + mobile) */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 overflow-y-auto">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const isActive = activeMenu === item.key

                return (
                  <li key={item.key}>
                    {item.active ? (
                      <Link
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`
                          flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                          ${isActive
                            ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"}
                        `}
                      >
                        <item.icon className="w-5 h-5" />
                        <span className="font-medium">{item.name}</span>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50">
                        <item.icon className="w-5 h-5" />
                        <span className="font-medium">{item.name}</span>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* User Info */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                <span className="text-gray-700 dark:text-gray-300 font-semibold">AD</span>
              </div>
              <div className="flex-1">
                <p className="text-gray-900 dark:text-white font-medium text-sm">Project Manager</p>
                <p className="text-gray-500 dark:text-gray-400 text-xs">admin@gravclothing.com</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2
              bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg 
              hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors font-medium text-sm"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div
        className={`
          transition-all duration-300
          ${sidebarOpen ? "lg:pl-64" : "lg:pl-0"}
        `}
      >
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="px-4 lg:px-8 py-4">
            {/* Top row: Toggle + User controls */}
            <div className="flex flex-col items-center justify-between lg:flex-row">

              <div className="flex items-center gap-4">
                {/* Toggle button */}
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  {sidebarOpen ? (
                    <></>
                  ) : (
                    <Menu className="w-6 h-6 text-gray-700 dark:text-gray-300" />
                  )}
                </button>

                {/* Breadcrumb */}
                <div className="flex items-center justify-between">
                  <Breadcrumb />
                </div>

              </div>

              <div className="flex-1 lg:hidden">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white text-center">
                  Grav Clothing
                </h2>
              </div>

              <div className="flex items-center gap-2">
                {/* Theme Toggle Button */}
                <button
                  onClick={toggleTheme}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
                >
                  {theme === "light" ? (
                    <Moon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  ) : (
                    <Sun className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  )}
                </button>

                <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg relative">
                  <Mail className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full" />
                </button>

                <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg relative">
                  <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                </button>

                <div className="hidden sm:flex items-center gap-2 ml-2">
                  <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                    <span className="text-gray-700 dark:text-gray-300 font-semibold text-sm">AD</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-8">{children}</main>
      </div>
    </div>
  )
}