import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { containersApi, versionsApi, statsApi } from '../api';
import type { ContainerInfo, VersionResponse } from '../types';

interface DataContextValue {
  containers: ContainerInfo[];
  containersLoading: boolean;
  refreshContainers: () => Promise<void>;
  
  versions: VersionResponse | null;
  versionsLoading: boolean;
  refreshVersions: () => Promise<void>;
  
  stats: Record<string, { cpu: number; memory: number; memory_usage?: number; memory_limit?: number }>;
  
  sealdiceContainer: ContainerInfo | undefined;
  napcatContainer: ContainerInfo | undefined;
  
  containerLogs: Record<string, string[]>;
  connectContainerLog: (containerId: string) => void;
  disconnectContainerLog: (containerId: string) => void;
  clearContainerLogs: (containerId: string) => void;
  appendContainerLog: (containerId: string, log: string) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

const LOG_MAX_LINES = 500;

export function DataProvider({ children }: { children: React.ReactNode }) {
  // Container data
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [containersLoading, setContainersLoading] = useState(true);
  
  // Versions data
  const [versions, setVersions] = useState<VersionResponse | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);
  
  // Stats data (per container)
  const [stats, setStats] = useState<Record<string, { cpu: number; memory: number; memory_usage?: number; memory_limit?: number }>>({});
  
  // Logs data (per container)
  const [containerLogs, setContainerLogs] = useState<Record<string, string[]>>({});
  const eventSourcesRef = useRef<Record<string, EventSource>>({});

  // Refresh containers
  const refreshContainers = useCallback(async () => {
    try {
      const res = await containersApi.list();
      if (res.success) {
        setContainers(Array.isArray(res.containers) ? res.containers : []);
      } else {
        setContainers([]);
      }
    } catch (err) {
      console.error('Failed to fetch containers:', err);
      setContainers([]);
    } finally {
      setContainersLoading(false);
    }
  }, []);

  // Fetch versions (lazy, only when needed)
  const refreshVersions = useCallback(async () => {
    if (versions) return;
    setVersionsLoading(true);
    try {
      const res = await versionsApi.getVersions();
      if (res.success && res.versions) {
        setVersions(res.versions);
      }
    } catch (err) {
      console.error('Failed to fetch versions:', err);
    } finally {
      setVersionsLoading(false);
    }
  }, [versions]);

  // Fetch stats for all containers
  const fetchStats = useCallback(async () => {
    try {
      const res = await statsApi.get();
      if (res.success && res.stats) {
        const statsMap: Record<string, { cpu: number; memory: number; memory_usage?: number; memory_limit?: number }> = {};
        // stats is keyed by container name like "napcat-core", "sealdice-core"
        for (const [containerName, containerStats] of Object.entries(res.stats)) {
          if (containerStats && typeof containerStats === 'object') {
            statsMap[containerName] = {
              cpu: (containerStats as any).cpu_percent || 0,
              memory: (containerStats as any).memory_percent || 0,
              memory_usage: (containerStats as any).memory_usage || 0,
              memory_limit: (containerStats as any).memory_limit || 0,
            };
          }
        }
        setStats(statsMap);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshContainers();
    fetchStats();
  }, [refreshContainers, fetchStats]);

  // Periodic refresh (every 5s for containers, every 3s for stats)
  useEffect(() => {
    const interval = setInterval(() => {
      refreshContainers();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshContainers]);

  useEffect(() => {
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // SSE log streaming for a container
  const connectContainerLog = useCallback(async (containerId: string) => {
    if (eventSourcesRef.current[containerId]) return;
    
    // 加载历史日志
    try {
      const res = await fetch(`/api/logs/${encodeURIComponent(containerId)}`);
      const data = await res.json();
      if (data.logs && data.logs.length > 0) {
        setContainerLogs((prev) => ({ ...prev, [containerId]: data.logs }));
      }
    } catch (err) {
      console.error('Failed to load historical logs:', err);
    }
    
    const es = new EventSource(`/api/logs/stream/${encodeURIComponent(containerId)}`);
    
    es.onmessage = (event) => {
      setContainerLogs((prev) => {
        const existing = prev[containerId] || [];
        const updated = [...existing, event.data];
        if (updated.length > LOG_MAX_LINES) {
          return { ...prev, [containerId]: updated.slice(-LOG_MAX_LINES) };
        }
        return { ...prev, [containerId]: updated };
      });
    };

    es.onerror = () => {
      setTimeout(() => {
        if (eventSourcesRef.current[containerId] === es && es.readyState === EventSource.CLOSED) {
          eventSourcesRef.current[containerId]?.close();
          delete eventSourcesRef.current[containerId];
          connectContainerLog(containerId);
        }
      }, 3000);
    };

    eventSourcesRef.current[containerId] = es;
  }, []);

  const disconnectContainerLog = useCallback((containerId: string) => {
    const es = eventSourcesRef.current[containerId];
    if (es) {
      es.close();
      delete eventSourcesRef.current[containerId];
    }
  }, []);

  const clearContainerLogs = useCallback((containerId: string) => {
    setContainerLogs((prev) => {
      const updated = { ...prev };
      delete updated[containerId];
      return updated;
    });
  }, []);

  const appendContainerLog = useCallback((containerId: string, log: string) => {
    setContainerLogs((prev) => {
      const existing = prev[containerId] || [];
      const updated = [...existing, log];
      if (updated.length > LOG_MAX_LINES) {
        return { ...prev, [containerId]: updated.slice(-LOG_MAX_LINES) };
      }
      return { ...prev, [containerId]: updated };
    });
  }, []);

  // Cleanup all SSE connections on unmount
  useEffect(() => {
    return () => {
      Object.values(eventSourcesRef.current).forEach((es) => es.close());
    };
  }, []);

  // Derived values
  const sealdiceContainer = useMemo(
    () => containers.find((c) => c.labels?.['neutrdice.type'] === 'sealdice'),
    [containers]
  );

  const napcatContainer = useMemo(
    () => containers.find((c) => c.labels?.['neutrdice.type'] === 'napcat'),
    [containers]
  );

  const value: DataContextValue = {
    containers,
    containersLoading,
    refreshContainers,
    versions,
    versionsLoading,
    refreshVersions,
    stats,
    sealdiceContainer,
    napcatContainer,
    containerLogs,
    connectContainerLog,
    disconnectContainerLog,
    clearContainerLogs,
    appendContainerLog,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error('useData must be used within a DataProvider');
  }
  return ctx;
}
