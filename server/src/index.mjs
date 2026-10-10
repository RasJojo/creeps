import { loadConfig } from './config.mjs'
import { startBank } from './server.mjs'

const config = loadConfig()
const log = (m) => console.log(`[bank] ${m}`)
const bank = await startBank(config, { log, waitForScreening: false })

if (bank.apiPort !== undefined) log(`API (proxy)     http://${config.apiHost}:${bank.apiPort}  origines: ${config.allowedOrigins.join(', ')}  proxy de confiance: ${config.trustProxy ? 'oui' : 'non'}`)
if (bank.apiSocket) log(`API (admin)     socket ${bank.apiSocket}`)
log(`JWKS (publique) http://${config.jwksHost}:${bank.jwksPort}/.well-known/jwks.json`)
log(`issuer=${config.issuer} audience=${config.audience} délai de sécurité=${config.recoveryDelaySeconds}s`)
log(`liste de sanctions: ${bank.screening.size()} adresses (téléchargement en cours si le cache est absent ou ancien)`)
bank.refreshing.then(() => log(`liste de sanctions prête: ${bank.screening.size()} adresses`))

// Rafraîchit la liste de sanctions chaque heure (elle n'est retéléchargée que si elle a plus de 24 h).
setInterval(() => bank.screening.ensureFresh().catch(() => {}), 3_600_000).unref()
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => bank.close().then(() => process.exit(0)))
