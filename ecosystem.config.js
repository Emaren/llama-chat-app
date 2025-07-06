module.exports = {
  apps: [
    {
      name: 'llama-chat-app',
      cwd: '/var/www/llama-chat-app',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3006',
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
