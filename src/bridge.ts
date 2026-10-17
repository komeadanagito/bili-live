import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';
import { writeText as tauriWriteText } from '@tauri-apps/plugin-clipboard-manager';

export const isDesktop = isTauri();

type EventCallback<T> = (event: { payload: T }) => void;
type Unlisten = () => void;

interface WsEnvelope {
  event: string;
  payload: unknown;
}

class WebEventManager {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<EventCallback<any>>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedExplicitly = false;

  private connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // When using Vite dev proxy, /ws is forwarded to the Rust server.
    // If not proxied (or running direct), falls back to 1421.
    const url = `${protocol}//${window.location.host}/ws`;
    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onmessage = (event) => {
      try {
        const envelope: WsEnvelope = JSON.parse(event.data);
        const set = this.listeners.get(envelope.event);
        if (set) {
          for (const cb of set) {
            cb({ payload: envelope.payload });
          }
        }
      } catch {
        // ignore malformed frame
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (!this.closedExplicitly) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      if (this.ws) {
        this.ws.close();
      }
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.listeners.size > 0) {
        this.connect();
      }
    }, 2000);
  }

  public subscribe<T>(event: string, callback: EventCallback<T>): Unlisten {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(callback);
    this.closedExplicitly = false;
    this.connect();

    return () => {
      const current = this.listeners.get(event);
      if (current) {
        current.delete(callback);
        if (current.size === 0) {
          this.listeners.delete(event);
        }
      }
      if (this.listeners.size === 0 && this.ws) {
        this.closedExplicitly = true;
        this.ws.close();
        this.ws = null;
      }
    };
  }
}

const webEvents = new WebEventManager();

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isDesktop) {
    return tauriInvoke<T>(cmd, args);
  }

  // Web mode: HTTP API call to Rust Axum server
  const response = await fetch(`/api/invoke/${cmd}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(args ?? {}),
  });

  if (!response.ok) {
    let msg = `请求失败 (${response.status})`;
    try {
      const err = await response.json();
      if (err.error) msg = err.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  return response.json();
}

export async function listen<T>(event: string, handler: EventCallback<T>): Promise<Unlisten> {
  if (isDesktop) {
    return tauriListen<T>(event, handler);
  }
  return webEvents.subscribe<T>(event, handler);
}

export async function copyText(text: string): Promise<void> {
  if (isDesktop) {
    return tauriWriteText(text);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fallback
    }
  }

  // Browser fallback
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'absolute';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

// 预先缓存 Tauri window 实例，消除每次鼠标按下时的动态异步加载延迟 (0ms 瞬时响应)
let cachedWindow: any = null;
if (isDesktop) {
  import('@tauri-apps/api/window').then(mod => {
    cachedWindow = mod.getCurrentWindow();
  }).catch(() => {});
}

export async function minimizeWindow(): Promise<void> {
  if (cachedWindow) {
    await cachedWindow.minimize();
  } else if (isDesktop) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().minimize();
  }
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (cachedWindow) {
    await cachedWindow.toggleMaximize();
  } else if (isDesktop) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().toggleMaximize();
  }
}

export async function closeWindow(): Promise<void> {
  if (cachedWindow) {
    await cachedWindow.close();
  } else if (isDesktop) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  }
}

export function startDragging(): void {
  if (cachedWindow) {
    try {
      void cachedWindow.startDragging();
    } catch {
      // ignore
    }
  } else if (isDesktop) {
    import('@tauri-apps/api/window').then(mod => {
      cachedWindow = mod.getCurrentWindow();
      void cachedWindow.startDragging();
    }).catch(() => {});
  }
}

export function handleDragMouseDown(e: React.MouseEvent): void {
  // 必须是鼠标左键，且明确避开所有可交互控件，直接同步触发原生拖拽
  if (e.button === 0 && !(e.target as HTMLElement).closest('button, input, a, select, textarea, [data-no-drag]')) {
    startDragging();
  }
}

export function handleDragDoubleClick(e: React.MouseEvent): void {
  if (e.button === 0 && !(e.target as HTMLElement).closest('button, input, a, select, textarea, [data-no-drag]')) {
    void toggleMaximizeWindow();
  }
}

export async function openOverlay(theme?: string): Promise<void> {
  if (isDesktop) {
    await invoke('open_overlay_window', { theme });
  } else {
    const width = 380;
    const height = 560;
    const left = window.screen.width - width - 40;
    const top = 60;
    window.open(
      '/#overlay',
      'bili_overlay',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,status=no`
    );
  }
}

export async function closeOverlay(): Promise<void> {
  if (isDesktop) {
    await invoke('close_overlay_window');
  }
}

export async function setOverlayPinned(pinned: boolean): Promise<void> {
  if (isDesktop) {
    await invoke('set_overlay_pinned', { pinned });
  }
}

export async function setOverlayClickThrough(ignore: boolean): Promise<void> {
  if (isDesktop) {
    await invoke('set_overlay_click_through', { ignore });
  }
}

export async function setOverlayAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
  if (isDesktop) {
    await invoke('set_overlay_always_on_top', { alwaysOnTop });
  }
}

export async function isOverlayOpen(): Promise<boolean> {
  if (isDesktop) {
    return invoke<boolean>('is_overlay_open');
  }
  return false;
}

export interface UpdateCheckResult {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  release_name: string;
  release_notes: string;
  download_url?: string;
  asset_name?: string;
  asset_size?: number;
  release_url: string;
}

export interface UpdateProgress {
  downloaded: number;
  total: number;
  percent: number;
  finished: boolean;
}

export async function getAppVersion(): Promise<string> {
  try {
    return await invoke<string>('get_app_version');
  } catch {
    return '0.1.2';
  }
}

export async function checkAppUpdate(): Promise<UpdateCheckResult> {
  return invoke<UpdateCheckResult>('check_app_update');
}

export async function downloadAndInstallUpdate(
  downloadUrl: string,
  assetName?: string
): Promise<void> {
  return invoke<void>('download_and_install_update', {
    downloadUrl,
    assetName,
  });
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isDesktop) {
    try {
      await invoke('open_external_url', { url });
      return;
    } catch {
      // fallback
    }
  }
  window.open(url, '_blank');
}

export async function onUpdateProgress(
  callback: (progress: UpdateProgress) => void
): Promise<Unlisten> {
  return listen<UpdateProgress>('update-download-progress', (event) => {
    callback(event.payload);
  });
}


