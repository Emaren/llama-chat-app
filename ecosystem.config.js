module.exports = {
  apps: [
    {
      name: 'llama-api',
      cwd: '/var/www/llama-chat-api',
      script: 'uvicorn',
      args: 'main:app --host 127.0.0.1 --port 8002',
      interpreter: 'python3',
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'llama-chat',
      cwd: '/var/www/llama-chat-app',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3006',
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
