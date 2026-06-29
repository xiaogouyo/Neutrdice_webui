export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: number;
  ports: PortInfo[];
  labels: Record<string, string>;
  config: ContainerConfig;
  network_mode?: string;
  ip_address?: string;
  stats?: ContainerStats;
}

export interface ContainerStats {
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
}

export interface PortInfo {
  IP?: string;
  PrivatePort?: number;
  PublicPort?: number;
  Type?: string;
  ip?: string;
  private_port?: number;
  public_port?: number;
  type?: string;
}

export interface ContainerConfig {
  instance_name: string;
  instance_type: string;
  sealdice_port: number;
  webui_port: number;
  channel: string;
  qq_account: string;
  login_method: string;
  webui_password?: string;
  network_address?: string;
  current_version?: string;
  available_channels?: string[];
  supports_version_switch?: boolean;
}

export interface Instance {
  id: string;
  name: string;
  qq: string;
  channel: string;
  login_method: string;
  sealdice_port: number;
  webui_port: number;
  container_id: string;
  container_name: string;
}

export interface VersionInfo {
  type: string;
  tag_name: string;
  published?: string;
  updated?: string;
  commit_hash?: string;
  commit_url?: string;
  body?: string;
  downloads: {
    linux_amd64: string;
    linux_arm64: string;
  };
}

export interface VersionResponse {
  sealdice: {
    latest: VersionInfo | null;
    stable: VersionInfo | null;
    pre: VersionInfo | null;
  };
  napcat: {
    latest: VersionInfo | null;
    stable: VersionInfo | null;
    beta: VersionInfo | null;
  };
  olivOS?: {
    latest: VersionInfo | null;
  };
}

export interface CoreInfo {
  success: boolean;
  current_core: 'sealdice' | 'olivOS';
  available_cores: string[];
}

export interface DeployOptions {
  qq: string;
  channel: string;
  login_method: string;
  instances?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  [key: string]: unknown;
}

export interface Config {
  panel_port: string;
  panel_password: string;
  docker_socket: string;
  base_dir: string;
}
