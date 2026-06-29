import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiServer,
  HiPlay,
  HiStop,
  HiRefresh,
  HiExternalLink,
  HiCog,
  HiClipboardCopy,
  HiChip,
  HiChartPie,
} from 'react-icons/hi';
import { containersApi } from '../api';
import { useData } from '../contexts/DataContext';
import clsx from 'clsx';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function Dashboard() {
  const { containers, containersLoading, refreshContainers, stats, sealdiceContainer, napcatContainer } = useData();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const navigate = useNavigate();

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast('已复制到剪贴板');
      setTimeout(() => setToast(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setToast('已复制到剪贴板');
      setTimeout(() => setToast(null), 2000);
    }
  };

  const handleAction = async (action: 'start' | 'stop' | 'restart', id: string, containerName?: string) => {
    setActionLoading(id);
    try {
      const targetName = containerName || id;
      let response;
      switch (action) {
        case 'start':
          response = await containersApi.start(targetName);
          break;
        case 'stop':
          response = await containersApi.stop(targetName);
          break;
        case 'restart':
          response = await containersApi.restart(targetName);
          break;
      }
      if (!response.success) {
        alert(response.message || '操作失败');
        return;
      }
      await refreshContainers();
    } catch (err: any) {
      console.error('Action error:', err);
      const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || '操作失败';
      alert(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const handleActionAndNavigate = async (action: 'start' | 'stop' | 'restart', container: typeof containers[0]) => {
    const containerName = container.name;
    await handleAction(action, container.id, containerName);
    if (action !== 'start') {
      navigate('/instances');
    }
  };

  const isBuiltIn = (c: typeof containers[0]) => c.labels?.['neutrdice.built-in'] === 'true';
  const builtInContainers = containers.filter(isBuiltIn);
  const sealdiceBuiltIn = sealdiceContainer;
  const napcatBuiltIn = napcatContainer;

  const resolveStats = (container: typeof containers[0]) => {
    const id = container.id;
    const contextStats = stats[id];
    if (contextStats) {
      return {
        cpu_percent: contextStats.cpu,
        memory_percent: contextStats.memory,
        memory_usage: contextStats.memory_usage || container.stats?.memory_usage || 0,
        memory_limit: contextStats.memory_limit || container.stats?.memory_limit || 0,
      };
    }
    return container.stats;
  };

  const totalCPU = containers.reduce((acc, c) => acc + (resolveStats(c)?.cpu_percent || 0), 0);
  const totalMemory = containers.reduce((acc, c) => acc + (resolveStats(c)?.memory_usage || 0), 0);
  const totalMemoryLimit = containers.reduce((acc, c) => acc + (resolveStats(c)?.memory_limit || 0), 0);
  const runningCount = containers.filter((c) => c.state === 'running').length;

  const overviewStats = [
    {
      label: '容器总数',
      value: containers.length,
      subValue: `${runningCount} 运行中`,
      icon: HiServer,
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      textColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: '总 CPU',
      value: totalCPU.toFixed(1) + '%',
      icon: HiChip,
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-600 dark:text-green-400',
    },
    {
      label: '总内存',
      value: formatBytes(totalMemory),
      subValue: totalMemoryLimit > 0 ? `占用 ${formatBytes(totalMemoryLimit)}` : '',
      icon: HiChartPie,
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
      textColor: 'text-purple-600 dark:text-purple-400',
    },
  ];

  const containerStats = (Array.isArray(containers) ? containers : []).map((c) => ({
    container: c,
    stats: resolveStats(c),
  }));

  if (containersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-4 right-4 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-lg z-50 animate-fade-in">
          {toast}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">概览</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            欢迎使用 NeutrDice 管理面板
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshContainers()}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 transition-colors"
          >
            <HiRefresh className="w-4 h-4" />
            刷新
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {overviewStats.map(({ label, value, subValue, icon: Icon, bgColor, textColor }) => (
          <div
            key={label}
            className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <div className={clsx('p-2.5 rounded-lg', bgColor)}>
                <Icon className={clsx('w-5 h-5', textColor)} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
                {subValue && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{subValue}</p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Built-in Containers */}
      {(sealdiceBuiltIn || napcatBuiltIn) && (
        <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <HiCog className="w-5 h-5 text-blue-500" />
              内置服务
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">内置的 NapCat 和海豹核心</p>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {sealdiceBuiltIn && (
              <div className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={clsx('w-2.5 h-2.5 rounded-full', sealdiceBuiltIn.state === 'running' ? 'bg-green-500 animate-pulse' : 'bg-gray-400')} />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{sealdiceBuiltIn.config?.instance_name || '海豹核心'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{sealdiceBuiltIn.image}</p>
                      {sealdiceBuiltIn.config?.network_address && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                          网络: <span className="font-mono font-medium">{sealdiceBuiltIn.config.network_address}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {(() => {
                      const current = resolveStats(sealdiceBuiltIn);
                      return current ? (
                        <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-100 dark:bg-gray-900/50 rounded-lg">
                          <div className="flex items-center gap-1.5">
                            <HiChip className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span className="text-xs font-mono text-blue-600 dark:text-blue-400 font-medium">{current.cpu_percent.toFixed(1)}%</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <HiChartPie className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                            <span className="text-xs font-mono text-purple-600 dark:text-purple-400 font-medium">{current.memory_percent.toFixed(1)}%</span>
                          </div>
                        </div>
                      ) : null;
                    })()}
                    <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                      海豹核心
                    </span>
                    {sealdiceBuiltIn.ports?.find((p) => p.PrivatePort === 3211 || p.private_port === 3211) ? (
                      <a
                        href={`http://127.0.0.1:${sealdiceBuiltIn.ports?.find((p) => p.PrivatePort === 3211 || p.private_port === 3211)?.PublicPort || sealdiceBuiltIn.ports?.find((p) => p.PrivatePort === 3211 || p.private_port === 3211)?.public_port || 32110}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        title="海豹 WebUI"
                      >
                        <HiExternalLink className="w-4 h-4" />
                      </a>
                    ) : (
                      <span className="px-2 py-1 text-xs text-gray-400">端口未配置</span>
                    )}
                  </div>
                </div>
              </div>
            )}
            {napcatBuiltIn && (
              <div className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={clsx('w-2.5 h-2.5 rounded-full', napcatBuiltIn.state === 'running' ? 'bg-green-500 animate-pulse' : 'bg-gray-400')} />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{napcatBuiltIn.config?.instance_name || 'NapCat QQ'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{napcatBuiltIn.image}</p>
                      {napcatBuiltIn.config?.network_address && (
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                          网络: <span className="font-mono font-medium">{napcatBuiltIn.config.network_address}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {(() => {
                      const current = resolveStats(napcatBuiltIn);
                      return current ? (
                        <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-100 dark:bg-gray-900/50 rounded-lg">
                          <div className="flex items-center gap-1.5">
                            <HiChip className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span className="text-xs font-mono text-blue-600 dark:text-blue-400 font-medium">{current.cpu_percent.toFixed(1)}%</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <HiChartPie className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                            <span className="text-xs font-mono text-purple-600 dark:text-purple-400 font-medium">{current.memory_percent.toFixed(1)}%</span>
                          </div>
                        </div>
                      ) : null;
                    })()}
                    <span className="px-2 py-0.5 text-xs rounded-full bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300">
                      NapCat
                    </span>
                    <a
                      href="http://127.0.0.1:6099"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                      title="NapCat WebUI"
                    >
                      <HiExternalLink className="w-4 h-4" />
                    </a>
                    {napcatBuiltIn.config?.webui_password && (
                      <button
                        onClick={() => copyToClipboard(napcatBuiltIn.config?.webui_password || '')}
                        className="px-3 py-1.5 bg-orange-100 dark:bg-orange-900/50 hover:bg-orange-200 dark:hover:bg-orange-900/70 text-orange-700 dark:text-orange-300 text-xs rounded-lg transition-colors flex items-center gap-1"
                        title="复制 Token"
                      >
                        <HiClipboardCopy className="w-3.5 h-3.5" />
                        Token
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Container Resource Usage */}
      <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">容器资源占用</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">实时更新的容器 CPU 和内存使用情况</p>
        </div>

        {containerStats.length === 0 ? (
          <div className="p-12 text-center">
            <HiServer className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">暂无容器</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {containerStats.map(({ container, stats: itemStats }) => (
              <div
                key={container.id}
                className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={clsx(
                      'w-2 h-2 rounded-full',
                      container.state === 'running' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                    )} />
                    <span className="font-medium text-gray-900 dark:text-white text-sm truncate max-w-[150px]">
                      {container.config?.instance_name || container.name}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    {container.state}
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-600 dark:text-gray-300 flex items-center gap-1">
                        <HiChip className="w-3 h-3" /> CPU
                      </span>
                      <span className="text-blue-600 dark:text-blue-400 font-mono font-medium">
                        {itemStats ? `${itemStats.cpu_percent.toFixed(1)}%` : '-'}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(itemStats?.cpu_percent || 0, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-600 dark:text-gray-300 flex items-center gap-1">
                        <HiChartPie className="w-3 h-3" /> 内存
                      </span>
                      <span className="text-purple-600 dark:text-purple-400 font-mono font-medium">
                        {itemStats ? `${itemStats.memory_percent.toFixed(1)}%` : '-'}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(itemStats?.memory_percent || 0, 100)}%` }}
                      />
                    </div>
                    {itemStats && itemStats.memory_usage > 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        占用 {formatBytes(itemStats.memory_usage)} / {formatBytes(itemStats.memory_limit)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                    {container.image}
                  </span>
                  <div className="flex items-center gap-1">
                    {container.state === 'running' ? (
                      <>
                        <button
                          onClick={() => handleActionAndNavigate('stop', container)}
                          disabled={actionLoading === container.id}
                          className="p-1.5 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded transition-colors disabled:opacity-50"
                          title="停止"
                        >
                          <HiStop className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleActionAndNavigate('restart', container)}
                          disabled={actionLoading === container.id}
                          className="p-1.5 text-gray-600 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
                          title="重启"
                        >
                          <HiRefresh className={clsx('w-3.5 h-3.5', actionLoading === container.id && 'animate-spin')} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleAction('start', container.id, container.name)}
                        disabled={actionLoading === container.id}
                        className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors disabled:opacity-50"
                        title="启动"
                      >
                        <HiPlay className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
