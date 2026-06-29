import { useState, useEffect } from 'react';
import { HiSave, HiLockClosed, HiArrowUp, HiCheck, HiLogout } from 'react-icons/hi';
import { configApi } from '../api';
import axios from 'axios';
import clsx from 'clsx';

export default function Settings() {
  const [config, setConfig] = useState({
    panel_port: '3001',
    panel_password: 'neutrdice2024',
    docker_socket: '/var/run/docker.sock',
    base_dir: '/opt/neutrdice',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [panelVersion, setPanelVersion] = useState<string>('');
  const [panelUpdateLoading, setPanelUpdateLoading] = useState(false);
  const [panelUpdateAvailable, setPanelUpdateAvailable] = useState(false);

  useEffect(() => {
    configApi
      .get()
      .then((res) => {
        if (res.success && res.config) {
          setConfig({
            panel_port: res.config.panel_port || '3001',
            panel_password: res.config.panel_password || 'neutrdice2024',
            docker_socket: res.config.docker_socket || '/var/run/docker.sock',
            base_dir: res.config.base_dir || '/opt/neutrdice',
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const fetchPanelVersion = async () => {
    try {
      const res = await axios.get('/api/panel/version');
      if (res.data?.success) {
        setPanelVersion(res.data.local_rev || 'unknown');
        setPanelUpdateAvailable(Boolean(res.data.update_available));
      }
    } catch (err: any) {
      console.error('Failed to fetch panel version', err);
    }
  };

  useEffect(() => {
    fetchPanelVersion();
  }, []);

  const handlePanelUpdate = async () => {
    if (!confirm('确定要从 GitHub 更新 NeutrDice 到最新版本吗？')) return;
    setPanelUpdateLoading(true);
    try {
      const res = await axios.post('/api/panel/update');
      if (res.data?.success) {
        alert(res.data.message || '更新成功，页面即将刷新');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        alert(res.data?.error || '更新失败');
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || err?.message || '更新失败');
    } finally {
      setPanelUpdateLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await configApi.save(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err?.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('neutrdice_password');
    window.location.href = '/login';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">设置</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">配置面板服务参数</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => versionsApi.getVersions().then((res) => {
              if (res.success && res.versions && typeof res.versions === 'object') setVersions(res.versions);
            })}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 transition-colors"
          >
            <HiRefresh className="w-4 h-4" />
            刷新版本
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <HiArrowUp className="w-5 h-5 text-emerald-500" />
            面板服务
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">从 GitHub 检查并更新 NeutrDice 当前环境版本</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">当前提交版本</p>
                <p className="text-gray-900 dark:text-white font-medium mt-1 font-mono">{panelVersion || '未知版本'}</p>
              </div>
              <div className="flex items-center gap-2">
                {panelUpdateAvailable && (
                  <span className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium">
                    可更新
                  </span>
                )}
                <button
                  onClick={fetchPanelVersion}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 transition-colors"
                >
                  <HiRefresh className="w-4 h-4" />
                  刷新
                </button>
                <button
                  onClick={handlePanelUpdate}
                  disabled={panelUpdateLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {panelUpdateLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      更新中...
                    </>
                  ) : (
                    <>
                      <HiArrowUp className="w-4 h-4" />
                      立即更新
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <HiLockClosed className="w-5 h-5 text-purple-500" />
            服务配置
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
              面板端口
            </label>
            <input
              type="text"
              value={config.panel_port}
              onChange={(e) => setConfig((c) => ({ ...c, panel_port: e.target.value }))}
              placeholder="3001"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">API 服务监听端口</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
              访问密码
            </label>
            <input
              type="password"
              value={config.panel_password}
              onChange={(e) => setConfig((c) => ({ ...c, panel_password: e.target.value }))}
              placeholder="neutrdice2024"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">面板登录密码</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
              Docker Socket
            </label>
            <input
              type="text"
              value={config.docker_socket}
              onChange={(e) => setConfig((c) => ({ ...c, docker_socket: e.target.value }))}
              placeholder="/var/run/docker.sock"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Docker 守护进程 Socket 路径</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
              数据目录
            </label>
            <input
              type="text"
              value={config.base_dir}
              onChange={(e) => setConfig((c) => ({ ...c, base_dir: e.target.value }))}
              placeholder="/opt/neutrdice"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">NeutrDice 数据存储根目录</p>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <HiSave className="w-4 h-4" />
                  保存配置
                </>
              )}
            </button>

            {saved && (
              <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <HiCheck className="w-4 h-4" />
                配置已保存
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-red-200 dark:border-red-900/50">
        <div className="px-6 py-4 border-b border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20">
          <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
            <HiLogout className="w-5 h-5" />
            账户操作
          </h2>
        </div>
        <div className="p-6">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 text-sm font-medium rounded-lg transition-colors"
          >
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
