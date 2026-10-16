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

export async function minimizeWindow(): Promise<void> {
  if (isDesktop) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().minimize();
  }
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (isDesktop) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().toggleMaximize();
  }
}

export async function closeWindow(): Promise<void> {
  if (isDesktop) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  }
}

export async function startDragging(): Promise<void> {
  if (isDesktop) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().startDragging();
    } catch {
      // ignore
    }
  }
}

export function handleDragMouseDown(e: React.MouseEvent): void {
  // Only trigger on left click and not on interactive controls
  if (e.button === 0 && !(e.target as HTMLElement).closest('button, input, a, select, textarea, [data-no-drag]')) {
    void startDragging();
  }
}

export function handleDragDoubleClick(e: React.MouseEvent): void {
  if (!(e.target as HTMLElement).closest('button, input, a, select, textarea, [data-no-drag]')) {
    void toggleMaximizeWindow();
  }
}
