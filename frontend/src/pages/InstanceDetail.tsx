import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  HiArrowLeft,
  HiPlay,
  HiStop,
  HiRefresh,
  HiExternalLink,
  HiTerminal,
  HiUpload,
  HiTrash,
} from 'react-icons/hi';
import { containersApi, instancesApi, versionsApi } from '../api';
import type { ContainerInfo, Instance, VersionInfo } from '../types';
import clsx from 'clsx';

export default function InstanceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [container, setContainer] = useState<ContainerInfo | null>(null);
  const [instance, setInstance] = useState<Instance | null>(null);
  const [versions, setVersions] = useState<Record<string, VersionInfo | null>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [updateChannel, setUpdateChannel] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const [cRes, iRes, vRes] = await Promise.all([
        containersApi.getInfo(id),
        instancesApi.list(),
        versionsApi.getVersions(),
      ]);
      if (cRes.success) setContainer(cRes.info);
      if (iRes.success) {
        const inst = iRes.instances.find(
          (inst: Instance) =>
            inst.container_id === id || inst.name === id
        );
        setInstance(inst || null);
      }
      if (vRes.success && vRes.versions && typeof vRes.versions === 'object') setVersions(vRes.versions);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!id) return;
    setActionLoading(true);
    try {
      switch (action) {
        case 'start':
          await containersApi.start(id);
          break;
        case 'stop':
          await containersApi.stop(id);
          break;
        case 'restart':
          await containersApi.restart(id);
          break;
      }
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.message || '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!id || !updateChannel) return;
    if (!confirm(`确定要将此实例更新至 ${updateChannel} 版本吗？`)) return;
    setUpdateLoading(true);
    try {
      await containersApi.update(id, updateChannel);
      alert('更新请求已发送，容器将重新拉取镜像并启动');
      setUpdateChannel('');
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.message || '更新失败');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!instance) return;
    if (!confirm(`确定要删除实例 "${instance.name}" 吗？`)) return;
    setActionLoading(true);
    try {
      await instancesApi.delete(instance.name);
      navigate('/instances');
    } catch (err: any) {
      alert(err?.response?.data?.message || '删除失败');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-dice-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!container) {
    return (
      <div className="text-center py-20">
        <p className="text-dice-400/50">未找到容器</p>
        <Link to="/instances" className="text-dice-400 hover:underline mt-2 inline-block">
          返回实例列表
        </Link>
      </div>
    );
  }

  const isRunning = container.state === 'running';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/instances"
          className="p-2 hover:bg-dice-500/10 rounded-lg text-dice-400 transition-colors"
        >
          <HiArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">
            {container.config?.instance_name || container.name}
          </h1>
          <p className="text-sm text-dice-400/60">{container.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAction('stop')}
            disabled={actionLoading || !isRunning}
            className="flex items-center gap-2 px-4 py-2 text-yellow-400 hover:text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
          >
            <HiStop className="w-4 h-4" />
            停止
          </button>
          <button
            onClick={() => handleAction('start')}
            disabled={actionLoading || isRunning}
            className="flex items-center gap-2 px-4 py-2 text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
          >
            <HiPlay className="w-4 h-4" />
            启动
          </button>
          <button
            onClick={() => handleAction('restart')}
            disabled={actionLoading || !isRunning}
            className="flex items-center gap-2 px-4 py-2 text-dice-400 hover:text-dice-300 bg-dice-500/10 hover:bg-dice-500/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
          >
            <HiRefresh className={clsx('w-4 h-4', actionLoading && 'animate-spin')} />
            重启
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">基本信息</h2>
          <div className="space-y-3">
            {[
              { label: '容器状态', value: isRunning ? '运行中' : '已停止' },
              { label: '容器名称', value: container.name },
              { label: '镜像', value: container.image },
              { label: '版本渠道', value: container.config?.channel || '-' },
              { label: '登录方式', value: container.config?.login_method || '-' },
              { label: 'QQ 号', value: container.config?.qq_account || '-' },
              { label: '运行状态', value: container.status },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-dice-400/60">{label}</span>
                <span className="text-sm text-white font-mono">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">快速访问</h2>
          <div className="space-y-3">
            <a
              href={`http://${window.location.hostname}:${instance?.sealdice_port || container.config?.sealdice_port || 32110}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-colors"
            >
              <div className="p-2 rounded-lg bg-blue-500/20">
                <HiExternalLink className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">海豹 WebUI</p>
                <p className="text-xs text-blue-400/60">
                  端口 {instance?.sealdice_port || container.config?.sealdice_port || 32110}
                </p>
              </div>
            </a>
            <a
              href={`http://${window.location.hostname}:${instance?.webui_port || container.config?.webui_port || 22000}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 transition-colors"
            >
              <div className="p-2 rounded-lg bg-orange-500/20">
                <HiTerminal className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">NapCat WebUI</p>
                <p className="text-xs text-orange-400/60">
                  端口 {instance?.webui_port || container.config?.webui_port || 22000}
                </p>
              </div>
            </a>
            <Link
              to={`/logs/${id}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-dice-500/10 hover:bg-dice-500/20 border border-dice-500/20 transition-colors"
            >
              <div className="p-2 rounded-lg bg-dice-500/20">
                <HiTerminal className="w-5 h-5 text-dice-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">查看日志</p>
                <p className="text-xs text-dice-400/60">实时流式日志</p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      <div className="glass rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-4">版本更新</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {versions && typeof versions === 'object' ? (
            Object.entries(versions).map(([channel, info]) => (
            <button
              key={channel}
              onClick={() => setUpdateChannel(channel)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                updateChannel === channel
                  ? 'border-dice-500 bg-dice-500/20 text-white'
                  : 'border-dice-500/20 bg-black/20 text-dice-300 hover:border-dice-500/40'
              )}
            >
              {channel === 'stable' ? '稳定版' : channel === 'latest' ? '最新版本' : '预发布'} 
              {info?.tag_name && (
                <span className="ml-2 text-xs opacity-60">{info.tag_name}</span>
              )}
            </button>
          ))
          ) : (
            <span className="text-dice-400/60">加载中...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleUpdate}
            disabled={!updateChannel || updateLoading}
            className="flex items-center gap-2 px-4 py-2 bg-dice-600 hover:bg-dice-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <HiUpload className="w-4 h-4" />
            {updateLoading ? '更新中...' : `更新至 ${updateChannel || '?'} 版本`}
          </button>
        </div>
      </div>

      <div className="glass rounded-xl p-5 border border-red-500/20">
        <h2 className="text-lg font-semibold text-red-400 mb-2">危险操作</h2>
        <p className="text-sm text-dice-400/50 mb-4">
          删除实例将同时删除海豹和 NapCat 容器，此操作不可恢复。
        </p>
        <button
          onClick={handleDelete}
          disabled={actionLoading}
          className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <HiTrash className="w-4 h-4" />
          删除实例
        </button>
      </div>
    </div>
  );
}
