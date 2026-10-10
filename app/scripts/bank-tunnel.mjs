// Ouvre le tunnel SSH vers le backend PRIVÉ de la banque: le port local 8787 mène au socket Unix du serveur.
// Le backend n'écoute sur aucun port réseau; ce tunnel est le seul chemin, et il passe par SSH.
//
// Réglages dans app/.env (voir .env.example):
//   BANK_SSH_HOST     hôte SSH du serveur (nom du ~/.ssh/config ou user@adresse)
//   BANK_SOCKET_PATH  chemin du socket de l'API sur le serveur (<dossier de déploiement>/run/api.sock)
//   BANK_LOCAL_PORT   port local (par défaut 8787, celui du proxy de Vite)
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

if (existsSync('.env')) process.loadEnvFile('.env')
const host = process.env.BANK_SSH_HOST
const socket = process.env.BANK_SOCKET_PATH
const port = process.env.BANK_LOCAL_PORT ?? '8787'
if (!host || !socket) {
  console.error('Renseigner BANK_SSH_HOST et BANK_SOCKET_PATH dans app/.env (voir .env.example).')
  process.exit(1)
}

console.log(`Tunnel: http://127.0.0.1:${port}  ->  ${host}:${socket}   (Ctrl+C pour fermer)`)
const ssh = spawn(
  'ssh',
  ['-N', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', '-L', `127.0.0.1:${port}:${socket}`, host],
  { stdio: 'inherit' },
)
ssh.on('exit', (code) => process.exit(code ?? 0))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => ssh.kill(sig))
