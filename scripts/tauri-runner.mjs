import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';

const isWin = process.platform === 'win32';

function killPort(port) {
  if (isWin) {
    try {
      const res = spawnSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf-8' });
      if (res.stdout) {
        const lines = res.stdout.split('\n');
        for (const line of lines) {
          if (line.includes(`:${port}`) && line.includes('LISTENING')) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== '0' && pid !== String(process.pid)) {
              spawnSync('taskkill.exe', ['/pid', pid, '/f', '/t'], { stdio: 'ignore' });
            }
          }
        }
      }
    } catch {
      // ignore
    }
  } else {
    try {
      spawnSync('sh', ['-c', `lsof -ti :${port} | xargs kill -9 2>/dev/null`], { stdio: 'ignore' });
    } catch {
      // ignore
    }
  }
}

function cleanLingering() {
  if (isWin) {
    try {
      spawnSync('taskkill.exe', ['/im', 'bili-live-web.exe', '/f'], { stdio: 'ignore' });
    } catch {}
  }
  killPort(1421);
  killPort(1420);
}

function runCmd(command, args, options = {}) {
  if (isWin) {
    return spawn('cmd.exe', ['/c', command, ...args], { stdio: 'inherit', ...options });
  }
  return spawn(command, args, { stdio: 'inherit', ...options });
}

const args = process.argv.slice(2);
const isWeb = args.length > 0 && args[0] === 'web';

if (isWeb) {
  console.log('\x1b[36m%s\x1b[0m', '>>> 正在启动 Bili Live Web 调试版...');

  // 1. 启动前先彻底清理上次可能残留的端口与进程，避免 10048 AddrInUse 报错
  cleanLingering();

  console.log('>>> 1/2 启动 Rust 本地服务 (HTTP:1421 + WebSocket)...');
  const rustProcess = runCmd(
    'cargo',
    ['run', '--manifest-path', 'src-tauri/Cargo.toml', '--bin', 'bili-live-web'],
    {
      env: { ...process.env, PORT: '1421' },
    }
  );

  console.log('>>> 2/2 启动 Vite 前端服务 (http://localhost:1420)...');
  const viteProcess = runCmd('npx', ['vite', '--port', '1420', '--open']);

  let cleaning = false;
  const cleanup = () => {
    if (cleaning) return;
    cleaning = true;
    console.log('\n>>> 正在关闭 Web 调试版服务...');
    try {
      if (isWin) {
        if (rustProcess?.pid) {
          spawnSync('taskkill.exe', ['/pid', String(rustProcess.pid), '/f', '/t'], { stdio: 'ignore' });
        }
        if (viteProcess?.pid) {
          spawnSync('taskkill.exe', ['/pid', String(viteProcess.pid), '/f', '/t'], { stdio: 'ignore' });
        }
        try {
          spawnSync('taskkill.exe', ['/im', 'bili-live-web.exe', '/f'], { stdio: 'ignore' });
        } catch {}
      } else {
        if (rustProcess) rustProcess.kill('SIGINT');
        if (viteProcess) viteProcess.kill('SIGINT');
      }
    } catch {
      // ignore
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  rustProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Rust Web 后端退出，退出码: ${code}`);
      cleanup();
    }
  });

  viteProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Vite 前端退出，退出码: ${code}`);
      cleanup();
    }
  });
} else {
  const tauriProcess = runCmd('npx', ['tauri', ...args]);

  tauriProcess.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}
