import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { HiArrowLeft, HiRefresh, HiDownload, HiPause, HiPlay } from 'react-icons/hi';
import { containersApi } from '../api';
import clsx from 'clsx';

export default function Logs() {
  const { id } = useParams<{ id: string }>();
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const [tailLines, setTailLines] = useState(200);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!id) return;
    setRefreshing(true);
    try {
      const res = await containersApi.getLogs(id, tailLines);
      if (res.success) {
        setLogs(res.logs || '');
      }
    } catch (err) {
      console.error('Fetch logs error:', err);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [id, tailLines]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh || !id) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/ws/logs/${id}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        setLogs((prev) => {
          const newLog = prev + '\n' + event.data;
          return newLog.slice(-50000);
        });
      };

      ws.onerror = () => {
        setAutoRefresh(false);
      };

      return () => {
        ws.close();
      };
    } catch {
      setAutoRefresh(false);
    }
  }, [autoRefresh, id]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleClear = () => setLogs('');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logs);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = logs;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Link
          to={id ? `/instances/${id}` : '/instances'}
          className="p-2 hover:bg-dice-500/10 rounded-lg text-dice-400 transition-colors"
        >
          <HiArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">容器日志</h1>
          <p className="text-sm text-dice-400/60 font-mono">{id}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={tailLines}
            onChange={(e) => setTailLines(Number(e.target.value))}
            className="px-3 py-1.5 bg-black/30 border border-dice-500/30 rounded-lg text-sm text-dice-300 focus:outline-none focus:border-dice-500"
          >
            <option value={50}>50 行</option>
            <option value={100}>100 行</option>
            <option value={200}>200 行</option>
            <option value={500}>500 行</option>
            <option value={1000}>1000 行</option>
          </select>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              autoRefresh
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-dice-500/10 text-dice-400 border border-dice-500/20'
            )}
          >
            {autoRefresh ? <HiPause className="w-4 h-4" /> : <HiPlay className="w-4 h-4" />}
            {autoRefresh ? '实时' : '已暂停'}
          </button>

          <button
            onClick={fetchLogs}
            disabled={refreshing}
            className="p-2 hover:bg-dice-500/10 rounded-lg text-dice-400 hover:text-dice-300 transition-colors"
            title="刷新日志"
          >
            <HiRefresh className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
          </button>

          <button
            onClick={handleCopy}
            className="p-2 hover:bg-dice-500/10 rounded-lg text-dice-400 hover:text-dice-300 transition-colors"
            title="复制日志"
          >
            <HiDownload className="w-4 h-4" />
          </button>

          <button
            onClick={handleClear}
            className="p-2 hover:bg-dice-500/10 rounded-lg text-dice-400 hover:text-dice-300 transition-colors"
            title="清空显示"
          >
            清除
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-dice-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="log-viewer border border-dice-500/20">
          {typeof logs === 'string' && logs.length > 0 ? (
            logs.split('\n').map((line, i) => (
              <div key={i} className={i % 2 === 0 ? 'opacity-80' : 'opacity-60'}>
                {line || '\u00A0'}
              </div>
            ))
          ) : (
            <span className="text-dice-400/40">暂无日志</span>
          )}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
