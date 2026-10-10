import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { SolanaWalletConnectors } from '@dynamic-labs/solana';
import { BitcoinWalletConnectors } from '@dynamic-labs/bitcoin';
import { App } from './App';

const environmentId = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DynamicContextProvider
      settings={{
        environmentId,
        walletConnectors: [EthereumWalletConnectors, SolanaWalletConnectors, BitcoinWalletConnectors],
      }}
    >
      <App />
    </DynamicContextProvider>
  </StrictMode>,
);
