# DEF Lock Interface

Vue interface for viewing and operating a deployed `DefTokenLock` contract.

## Configure

For local development, start `npx hardhat node`, deploy with `npm run deploy:local`, and select Hardhat Local. It uses chain ID `31337`, `http://127.0.0.1:8545`, and lock address `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`; update the constant if your deployment address differs. Import the private key for the deployed contract owner from the accounts printed by the Hardhat node into the browser wallet. Only use Hardhat development keys locally, never for real funds. The network warning offers wallet switching and adds missing networks when supported by the wallet.

## Run

```bash
npm install
npm run dev
```

Public lock data is available without a wallet. Connect an injected wallet to release vested allocations. The contract owner can revoke active allocations or fund a new allocation through an ERC-20 approval followed by `createAllocation`.

## Docker

From the repository root:

```bash
docker build -t def-lock-frontend ./frontend
docker run --rm -p 8080:80 def-lock-frontend
```

Open `http://localhost:8080`. The multi-stage image builds the frontend with Node and serves the production files with Nginx; Node is not included in the runtime image.

Network settings in `src/chains.ts` are bundled at build time. Rebuild the image after changing them. RPC requests run in the user's browser, so the Hardhat RPC at `127.0.0.1:8545` refers to the browser's machine, not the container. For remote access, configure a browser-reachable RPC URL and serve the app over HTTPS for wallet and clipboard support.