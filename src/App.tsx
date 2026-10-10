import { DynamicWidget, useDynamicContext, useUserWallets } from '@dynamic-labs/sdk-react-core';

export function App() {
  const { user } = useDynamicContext();
  const wallets = useUserWallets();

  return (
    <main style={{ maxWidth: 640, margin: '2rem auto', fontFamily: 'system-ui' }}>
      <h1>creeps</h1>
      <DynamicWidget />
      {user && (
        <section>
          <h2>Wallets</h2>
          <ul>
            {wallets.map((w) => (
              <li key={w.id}>
                {w.chain} — {w.address}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
