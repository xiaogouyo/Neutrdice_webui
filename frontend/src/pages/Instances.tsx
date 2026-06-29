import { useState, useEffect, useRef } from 'react';
import {
  HiPlay,
  HiStop,
  HiRefresh,
  HiX,
  HiDownload,
  HiChevronDown,
  HiPause,
} from 'react-icons/hi';
import { containersApi } from '../api';
import { useData } from '../contexts/DataContext';
import type { VersionInfo } from '../types';
import clsx from 'clsx';

export default function Instances() {
  const {
    containers,
    containersLoading,
    refreshContainers,
    versions,
    versionsLoading,
    refreshVersions,
    sealdiceContainer,
    napcatContainer,
    containerLogs,
    connectContainerLog,
    disconnectContainerLog,
    clearContainerLogs,
    appendContainerLog,
  } = useData();

  // Refresh containers on mount (e.g., after stopping from Dashboard)
  useEffect(() => {
    refreshContainers();
  }, [refreshContainers]);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showVersionModal, setShowVersionModal] = useState<string | null>(null);
  const [versionLoading, setVersionLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');
  const [napcatPaused, setNapcatPaused] = useState(false);
  const sealdiceLogRef = useRef<HTMLDivElement>(null);
  const napcatLogRef = useRef<HTMLDivElement>(null);
  const prevSealdiceLogsRef = useRef<string[]>([]);
  const prevNapcatLogsRef = useRef<string[]>([]);

  // Connect/disconnect log streams based on container state
  useEffect(() => {
    if (sealdiceContainer && sealdiceContainer.state === 'running') {
      connectContainerLog(sealdiceContainer.name);
    } else {
      disconnectContainerLog(sealdiceContainer?.name || '');
    }
  }, [sealdiceContainer?.state, sealdiceContainer?.name]);

  useEffect(() => {
    if (napcatContainer && napcatContainer.state === 'running') {
      connectContainerLog(napcatContainer.name);
    } else {
      disconnectContainerLog(napcatContainer?.name || '');
    }
  }, [napcatContainer?.state, napcatContainer?.name]);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    const logs = sealdiceContainer ? containerLogs[sealdiceContainer.name] || [] : [];
    if (logs.length !== prevSealdiceLogsRef.current.length && sealdiceLogRef.current) {
      sealdiceLogRef.current.scrollTop = sealdiceLogRef.current.scrollHeight;
    }
    prevSealdiceLogsRef.current = logs;
  }, [containerLogs, sealdiceContainer?.name]);

  useEffect(() => {
    const logs = napcatContainer ? containerLogs[napcatContainer.name] || [] : [];
    if (logs.length !== prevNapcatLogsRef.current.length && !napcatPaused && napcatLogRef.current) {
      napcatLogRef.current.scrollTop = napcatLogRef.current.scrollHeight;
    }
    prevNapcatLogsRef.current = logs;
  }, [containerLogs, napcatPaused, napcatContainer?.name]);

  // Load versions when modal opens
  useEffect(() => {
    if (showVersionModal) {
      refreshVersions();
    }
  }, [showVersionModal, refreshVersions]);

  const handleAction = async (
    action: 'start' | 'stop' | 'restart',
    containerName: string,
    type: 'sealdice' | 'napcat'
  ) => {
    setActionLoading(containerName);
    const actionText = action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启';
    const separator = `------------------${actionText}------------------`;
    
    try {
      switch (action) {
        case 'start':
          await containersApi.start(containerName);
          break;
        case 'stop':
          await containersApi.stop(containerName);
          break;
        case 'restart':
          await containersApi.restart(containerName);
          break;
      }
      appendContainerLog(containerName, separator);
      await refreshContainers();
    } catch (err: any) {
      alert(err?.response?.data?.message || '操作失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleVersionSwitch = async (containerName: string, channel: string, type: 'sealdice' | 'napcat') => {
    if (!confirm(`确定要切换到 ${channel} 版本吗？`)) return;
    setVersionLoading(true);
    setDownloadProgress('正在切换版本...');
    try {
      await containersApi.update(containerName, channel);
      setDownloadProgress('版本切换成功');
      await refreshContainers();
      setTimeout(() => {
        setShowVersionModal(null);
        setDownloadProgress('');
      }, 5000);
    } catch (err: any) {
      setDownloadProgress(`切换失败: ${err?.response?.data?.message || '未知错误'}`);
    } finally {
      setVersionLoading(false);
    }
  };

  const napcatChannel = napcatContainer?.config?.channel || 'latest';

  const sealdiceLogs = sealdiceContainer ? containerLogs[sealdiceContainer.name] || [] : [];
  const napcatLogs = napcatContainer ? containerLogs[napcatContainer.name] || [] : [];

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const truncateHash = (hash?: string) => {
    if (!hash) return '';
    return hash.length > 7 ? hash.substring(0, 7) : hash;
  };

  if (containersLoading) {
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">实例管理</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            管理内置服务
          </p>
        </div>
        <button
          onClick={() => refreshContainers()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <HiRefresh className="w-4 h-4" />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sealdice Panel */}
        <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 shadow-sm" style={{ height: 'calc(100vh - 220px)' }}>
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={clsx(
                  'w-3 h-3 rounded-full',
                  sealdiceContainer?.state === 'running' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                )} />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">海豹核心</h2>
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {sealdiceContainer?.state === 'running' ? '运行中' : '已停止'}
                </span>
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
                  实时
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => sealdiceContainer && handleAction('stop', sealdiceContainer.name, 'sealdice')}
                disabled={actionLoading === sealdiceContainer?.name || sealdiceContainer?.state !== 'running'}
                className="flex items-center gap-1.5 px-4 py-2 bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <HiStop className="w-4 h-4" />
                停止
              </button>
              <button
                onClick={() => sealdiceContainer && handleAction('start', sealdiceContainer.name, 'sealdice')}
                disabled={actionLoading === sealdiceContainer?.name || sealdiceContainer?.state === 'running'}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <HiPlay className="w-4 h-4" />
                启动
              </button>
              <button
                onClick={() => sealdiceContainer && handleAction('restart', sealdiceContainer.name, 'sealdice')}
                disabled={actionLoading === sealdiceContainer?.name}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <HiRefresh className={clsx('w-4 h-4', actionLoading === sealdiceContainer?.name && 'animate-spin')} />
                重启
              </button>

              <div className="flex-1" />

            </div>
          </div>

          <div
            ref={sealdiceLogRef}
            className="flex-1 p-4 bg-gray-900 text-gray-100 font-mono text-xs overflow-y-auto"
          >
            {Array.isArray(sealdiceLogs) && sealdiceLogs.length > 0 ? (
              sealdiceLogs.map((log, i) => (
                <div key={i} className="leading-relaxed whitespace-pre-wrap break-all">{log}</div>
              ))
            ) : (
              <span className="text-gray-500">等待日志输出...</span>
            )}
          </div>
        </div>

        {/* NapCat Panel */}
        <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 shadow-sm" style={{ height: 'calc(100vh - 220px)' }}>
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-orange-50 dark:bg-orange-900/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={clsx(
                  'w-3 h-3 rounded-full',
                  napcatContainer?.state === 'running' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                )} />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">NapCat</h2>
                <span className="px-2 py-0.5 text-xs rounded-full bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300">
                  {napcatContainer?.state === 'running' ? '运行中' : '已停止'}
                </span>
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
                  实时
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => napcatContainer && handleAction('stop', napcatContainer.name, 'napcat')}
                disabled={actionLoading === napcatContainer?.name || napcatContainer?.state !== 'running'}
                className="flex items-center gap-1.5 px-4 py-2 bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <HiStop className="w-4 h-4" />
                停止
              </button>
              <button
                onClick={() => napcatContainer && handleAction('start', napcatContainer.name, 'napcat')}
                disabled={actionLoading === napcatContainer?.name || napcatContainer?.state === 'running'}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <HiPlay className="w-4 h-4" />
                启动
              </button>
              <button
                onClick={() => napcatContainer && handleAction('restart', napcatContainer.name, 'napcat')}
                disabled={actionLoading === napcatContainer?.name}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <HiRefresh className={clsx('w-4 h-4', actionLoading === napcatContainer?.name && 'animate-spin')} />
                重启
              </button>

              <div className="flex-1" />

              <button
                onClick={() => setNapcatPaused(!napcatPaused)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                  napcatPaused
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                )}
              >
                {napcatPaused ? <HiPlay className="w-4 h-4" /> : <HiPause className="w-4 h-4" />}
                {napcatPaused ? '继续' : '暂停'}
              </button>

              <button
                onClick={() => setShowVersionModal('napcat')}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-sm font-medium rounded-lg transition-colors"
              >
                <HiDownload className="w-4 h-4" />
                {napcatChannel === 'latest' ? '最新版' : napcatChannel}
                <HiChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            ref={napcatLogRef}
            className="flex-1 p-4 bg-gray-900 text-gray-100 font-mono text-xs overflow-y-auto"
          >
            {Array.isArray(napcatLogs) && napcatLogs.length > 0 ? (
              napcatLogs.map((log, i) => (
                <div key={i} className="leading-relaxed whitespace-pre-wrap break-all">{log}</div>
              ))
            ) : (
              <span className="text-gray-500">等待日志输出...</span>
            )}
          </div>
        </div>
      </div>

      {/* Version Switch Modal */}
      {showVersionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop:blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {showVersionModal === 'sealdice' ? '海豹核心' : 'NapCat'} 版本切换
              </h2>
              <button
                onClick={() => {
                  setShowVersionModal(null);
                  setDownloadProgress('');
                }}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>

            {versionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="ml-3 text-gray-600 dark:text-gray-400">加载版本信息...</span>
              </div>
            ) : (
              <>
                {downloadProgress && (
                  <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-700 dark:text-blue-300">{downloadProgress}</p>
                  </div>
                )}

                <div className="space-y-3">
                  {showVersionModal === 'napcat' && versions?.napcat && (
                    <>
                      {versions.napcat.latest && (
                        <button
                          onClick={() => napcatContainer && handleVersionSwitch(napcatContainer.name, 'latest', 'napcat')}
                          disabled={versionLoading || napcatChannel === 'latest'}
                          className="w-full p-4 rounded-xl border transition-all text-left disabled:opacity-60 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 text-xs bg-blue-500 text-white rounded-full">Latest</span>
                              <span className="font-bold text-gray-900 dark:text-white">{versions.napcat.latest.tag_name}</span>
                            </div>
                            {napcatChannel === 'latest' && (
                              <span className="px-2 py-1 text-xs bg-blue-500 text-white rounded-full">当前</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
                            {versions.napcat.latest.commit_hash && (
                              <span className="font-mono">
                                Commit: <a href={versions.napcat.latest.commit_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">{truncateHash(versions.napcat.latest.commit_hash)}</a>
                              </span>
                            )}
                            {versions.napcat.latest.published && (
                              <span>发布于: {formatDate(versions.napcat.latest.published)}</span>
                            )}
                          </div>
                        </button>
                      )}
                      {versions.napcat.stable && (
                        <button
                          onClick={() => napcatContainer && handleVersionSwitch(napcatContainer.name, 'stable', 'napcat')}
                          disabled={versionLoading || napcatChannel === 'stable'}
                          className="w-full p-4 rounded-xl border transition-all text-left disabled:opacity-60 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 text-xs bg-green-500 text-white rounded-full">Stable</span>
                              <span className="font-bold text-gray-900 dark:text-white">{versions.napcat.stable.tag_name}</span>
                            </div>
                            {napcatChannel === 'stable' && (
                              <span className="px-2 py-1 text-xs bg-green-500 text-white rounded-full">当前</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
                            {versions.napcat.stable.commit_hash && (
                              <span className="font-mono">
                                Commit: <a href={versions.napcat.stable.commit_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">{truncateHash(versions.napcat.stable.commit_hash)}</a>
                              </span>
                            )}
                            {versions.napcat.stable.published && (
                              <span>发布于: {formatDate(versions.napcat.stable.published)}</span>
                            )}
                          </div>
                        </button>
                      )}
                      {versions.napcat.beta && (
                        <button
                          onClick={() => napcatContainer && handleVersionSwitch(napcatContainer.name, 'beta', 'napcat')}
                          disabled={versionLoading || napcatChannel === 'beta'}
                          className="w-full p-4 rounded-xl border transition-all text-left disabled:opacity-60 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 text-xs bg-yellow-500 text-white rounded-full">Beta</span>
                              <span className="font-bold text-gray-900 dark:text-white">{versions.napcat.beta.tag_name}</span>
                            </div>
                            {napcatChannel === 'beta' && (
                              <span className="px-2 py-1 text-xs bg-yellow-500 text-white rounded-full">当前</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
                            {versions.napcat.beta.commit_hash && (
                              <span className="font-mono">
                                Commit: <a href={versions.napcat.beta.commit_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">{truncateHash(versions.napcat.beta.commit_hash)}</a>
                              </span>
                            )}
                            {versions.napcat.beta.published && (
                              <span>发布于: {formatDate(versions.napcat.beta.published)}</span>
                            )}
                          </div>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            <button
              onClick={() => {
                setShowVersionModal(null);
                setDownloadProgress('');
              }}
              className="w-full mt-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl text-sm font-medium transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
