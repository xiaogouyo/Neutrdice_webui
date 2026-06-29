import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { HiHome, HiServer, HiCog, HiMenu, HiX, HiSun, HiMoon } from 'react-icons/hi';
import { useState } from 'react';
import clsx from 'clsx';
import { useTheme } from '../contexts/ThemeContext';

const navItems = [
  { path: '/', label: '概览', icon: HiHome },
  { path: '/instances', label: '实例管理', icon: HiServer },
  { path: '/settings', label: '设置', icon: HiCog },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex min-h-screen">
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-64 glass transition-transform duration-300 lg:translate-x-0 lg:static',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-5 border-b border-primary-200/30 dark:border-primary-500/20">
            <img src="/logo.svg" alt="NeutrDice" className="w-10 h-10" />
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-white">NeutrDice</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">管理面板</p>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary-100 dark:bg-primary-500/30 text-primary-700 dark:text-primary-300'
                      : 'text-slate-600 dark:text-slate-300/70 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-800 dark:hover:text-slate-200'
                  )
                }
              >
                <Icon className="w-5 h-5" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="px-6 py-4 border-t border-slate-200/30 dark:border-slate-700/30">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              NeutrDice Panel v1.0.0
            </p>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 glass border-b border-slate-200/30 dark:border-slate-700/30">
          <div className="flex items-center gap-4 px-6 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300"
            >
              <HiMenu className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h2 className="text-sm font-medium text-slate-600 dark:text-slate-300/70">
                {navItems.find((item) =>
                  item.path === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.path)
                )?.label || 'NeutrDice'}
              </h2>
            </div>
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 transition-colors"
              title={theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'}
            >
              {theme === 'light' ? (
                <HiMoon className="w-5 h-5" />
              ) : (
                <HiSun className="w-5 h-5" />
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
