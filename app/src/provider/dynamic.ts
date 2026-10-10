import {
  completeDeviceRegistration,
  createDynamicClient,
  detectDeviceRegistrationRedirect,
  getActiveNetworkData,
  getDefaultClient,
  getDeviceRegistrationTokenFromUrl,
  getElevatedAccessToken,
  getNetworksData,
  getRegisteredDevices,
  getWalletAccounts,
  isDeviceRegistrationRequired,
  isSignedIn,
  isUserMissingMfaAuth,
  isUserOnboardingComplete,
  logout,
  requestExternalAuthElevatedToken,
  revokeAllRegisteredDevices,
  revokeRegisteredDevice,
  signInWithExternalJwt,
  signMessage,
  switchActiveNetwork,
  TokenScope,
  transferAmount,
  waitForClientInitialized,
} from '@dynamic-labs-sdk/client';
import {
  createWaasWalletAccounts,
  exportWaasPrivateKey,
  getChainsMissingWaasWalletAccounts,
  getWalletRecoveryState,
  unlockWallet,
} from '@dynamic-labs-sdk/client/waas';
import { addWaasEvmExtension } from '@dynamic-labs-sdk/evm/waas';
import { addWaasSolanaExtension } from '@dynamic-labs-sdk/solana/waas';
import { addWaasBitcoinExtension, getWaasBitcoinAddressForNetwork } from '@dynamic-labs-sdk/bitcoin/waas';
import { describeAgent } from './describe';
import type { AccessSnapshot, Chain, DeviceInfo, WalletAccount, WalletProvider } from './types';

createDynamicClient({
  environmentId: import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID,
  metadata: { name: 'creeps' },
  // Pas de télémétrie vers un tiers: inutile au fonctionnement, et inacceptable par défaut pour une banque.
  instrumentation: { enabled: false },
});
addWaasEvmExtension();
addWaasSolanaExtension();
addWaasBitcoinExtension();

const CHAINS: Chain[] = ['EVM', 'SOL', 'BTC'];

/** Le seul réseau sur lequel ce prototype accepte de signer, pour chaque chaîne: un réseau de TEST. */
export const TESTNET_ID: Record<Chain, string> = { BTC: '2', EVM: '84532', SOL: '102' };

const sdkAccount = (chain: Chain) => getWalletAccounts().find((a) => a.chain === chain);

function accountsNow(): WalletAccount[] {
  return getWalletAccounts()
    .filter((a) => CHAINS.includes(a.chain as Chain))
    .map((a): WalletAccount => ({
      chain: a.chain as Chain,
      // Le SDK renvoie l'adresse Bitcoin mainnet; on dérive l'adresse testnet de la même clé.
      address:
        a.chain === 'BTC' ? getWaasBitcoinAddressForNetwork({ bitcoinNetwork: 'testnet', walletAccount: a }) : a.address,
    }));
}

/**
 * Signer (ou exporter une clé) exige l'autorisation de la banque: un jeton remis par la banque, que l'appelant a obtenu juste
 * avant. Le fournisseur refuse de coopérer sans lui (403), quel que soit le client utilisé. Le passkey n'est pas celui du
 * fournisseur: c'est la banque qui le vérifie avant de remettre ce jeton. On ne signe jamais "en silence".
 */
function requireBankAuthorization(scope: TokenScope): void {
  if (!getElevatedAccessToken({ consume: false, scope })) throw new Error('The bank has not authorized this action.');
}

/** Refuse de signer tant que le wallet n'est pas sur le réseau de TEST attendu (jamais de mainnet par erreur). */
async function requireTestnet(chain: Chain): Promise<void> {
  const account = sdkAccount(chain);
  if (!account) throw new Error(`No ${chain} wallet on this device.`);
  const want = TESTNET_ID[chain];
  const known = getNetworksData().find((n) => n.networkId === want && n.testnet && String(n.chain) === chain);
  if (!known) throw new Error(`The ${chain} test network is not enabled for this project. Refusing to send.`);
  await switchActiveNetwork({ walletAccount: account, networkId: want });
  const { networkData } = await getActiveNetworkData({ walletAccount: account });
  if (networkData?.networkId !== want || !networkData.testnet) {
    throw new Error(`The ${chain} wallet is not on its test network. Refusing to send.`);
  }
}

export const dynamicProvider: WalletProvider = {
  name: 'dynamic',
  ready: () => waitForClientInitialized(),
  isSignedIn: () => isSignedIn(),
  currentEmail: () => getDefaultClient().user?.email ?? undefined,

  async readAccess(): Promise<AccessSnapshot> {
    if (!isSignedIn()) return { state: 'signed_out', accounts: [] };
    const user = getDefaultClient().user;
    const email = user?.email ?? undefined;
    if (user && isDeviceRegistrationRequired(user)) return { state: 'device_approval', email, accounts: [] };
    if (isUserMissingMfaAuth()) return { state: 'mfa_required', email, accounts: [] };
    if (!isUserOnboardingComplete()) return { state: 'onboarding', email, accounts: [] };
    const accounts = accountsNow();
    if (accounts.length === 0) return { state: 'no_wallet', email, accounts };
    const states = await Promise.all(
      getWalletAccounts()
        .filter((a) => CHAINS.includes(a.chain as Chain))
        .map((a) => getWalletRecoveryState({ walletAccount: a })),
    );
    const locked = states.some((s) => s.walletReadyState !== 'ready');
    return { state: locked ? 'locked' : 'ready', email, accounts };
  },

  async signInWithSso(jwt) {
    await signInWithExternalJwt({ externalJwt: jwt });
  },
  logout: () => logout(),
  async completeDeviceApprovalFromUrl(url) {
    if (!detectDeviceRegistrationRedirect({ url })) return false;
    await completeDeviceRegistration({ deviceToken: getDeviceRegistrationTokenFromUrl({ url }) });
    return true;
  },

  async createWallets(passcode) {
    // Seulement les chaînes qui manquent (évite les doublons) et seulement nos trois chaînes.
    const missing = getChainsMissingWaasWalletAccounts().filter((c) => CHAINS.includes(c as Chain));
    if (missing.length === 0) return;
    await createWaasWalletAccounts({
      chains: missing.map((chain) =>
        chain === 'BTC' ? { chain, bitcoinConfig: { addressType: 'native_segwit', network: 'testnet' } } : { chain },
      ),
      password: passcode,
    });
  },
  listAccounts: () => accountsNow(),
  async unlock(passcode) {
    for (const a of getWalletAccounts()) await unlockWallet({ password: passcode, walletAccount: a });
  },

  async stepUpWithSso(assertionJwt) {
    await requestExternalAuthElevatedToken({ externalJwt: assertionJwt });
  },

  async listDevices() {
    const devices = await getRegisteredDevices();
    return devices.map((d): DeviceInfo => ({
      id: d.id,
      current: d.isCurrentDevice,
      label: describeAgent(d.userAgent ?? ''),
      createdAt: String(d.createdAt),
    }));
  },
  async revokeDevice(id) {
    await revokeRegisteredDevice({ deviceRegistrationId: id });
  },
  async revokeAllDevices() {
    await revokeAllRegisteredDevices();
  },

  async signOwnershipProof(chain, message) {
    const account = sdkAccount(chain);
    if (!account) throw new Error(`No ${chain} wallet on this device.`);
    requireBankAuthorization(TokenScope.Walletsign);
    const { signature } = await signMessage({ walletAccount: account, message });
    return { address: accountsNow().find((a) => a.chain === chain)?.address ?? account.address, signature };
  },

  async sendNative(chain, to, amount) {
    const account = sdkAccount(chain);
    if (!account) throw new Error(`No ${chain} wallet on this device.`);
    await requireTestnet(chain);
    requireBankAuthorization(TokenScope.Walletsign);
    const { transactionHash } = await transferAmount({ walletAccount: account, amount, recipient: to });
    return { hash: transactionHash };
  },

  async exportPrivateKey(chain, passcode, container) {
    const account = sdkAccount(chain);
    if (!account) throw new Error(`No ${chain} wallet on this device.`);
    requireBankAuthorization(TokenScope.Walletexport);
    await exportWaasPrivateKey({ walletAccount: account, password: passcode, displayContainer: container });
  },
};
