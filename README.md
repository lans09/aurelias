# Decentralized Paid-Entry Raffle (Foundry + Chainlink VRF v2.5 & Automation)

An academic/school demonstration of a decentralized, verifiable raffle smart contract built with **Solidity** and **Foundry**. Participants enter by paying an exact entrance fee in native ETH; entry fees form the prize pool, and **Chainlink Automation** + **Chainlink VRF v2.5** autonomously and verifiably select one winner to receive the entire pool.

> **Testnet / Local Only:** This project is strictly for local Anvil and Ethereum Sepolia testnet demonstrations. No mainnet deployment configuration is included.

---

## Project Structure

```text
decentralized-raffle/
├── src/
│   └── Raffle.sol                # Core raffle contract (VRF v2.5 + Automation + ReentrancyGuard)
├── script/
│   ├── HelperConfig.s.sol        # Chain-aware config (Anvil mocks vs. Sepolia addresses)
│   └── DeployRaffle.s.sol        # Programmatic subscription creation, funding, deploy & consumer add
├── test/
│   └── RaffleTest.t.sol          # Unit tests (entry fees, upkeep, VRF fulfillment, access control)
├── frontend/
│   ├── index.html                # Minimal MetaMask demo UI
│   └── app.js                    # Ethers.js v6 contract interactions
├── foundry.toml
└── README.md
```

---

## How Fairness Is Guaranteed

Traditional on-chain lotteries that use `block.timestamp`, `blockhash`, or `block.prevrandao` are vulnerable to miner/validator manipulation or prediction. This project guarantees verifiable fairness using **Chainlink VRF v2.5 (Subscription Method)**:

1. **Verifiable Randomness (No Pseudo-Randomness):** When the raffle interval elapses and at least one player has entered, `performUpkeep()` transitions the raffle state to `CALCULATING` (locking new entries) and requests randomness from the Chainlink VRF v2.5 Coordinator.
2. **Cryptographic Proof:** The Chainlink VRF oracle generates a random word along with a cryptographic proof (`VRF` proof) that the output could not be predicted or tampered with before submission. The VRF Coordinator verifies this proof on-chain before calling `fulfillRandomWords()`.
3. **Restricted Callback:** Only the trusted Chainlink VRF Coordinator address can invoke `rawFulfillRandomWords()` -> `fulfillRandomWords()`.
4. **Autonomous Execution:** **Chainlink Automation** monitors `checkUpkeep()` off-chain and triggers `performUpkeep()` without requiring manual operator intervention.
5. **Reentrancy & State Safety:** `fulfillRandomWords()` uses OpenZeppelin `ReentrancyGuard` (`nonReentrant`) and follows the Checks-Effects-Interactions pattern (resetting `s_raffleState`, clearing `s_players`, updating `s_lastTimeStamp`, and recording `s_recentWinner` before transferring the ETH balance).

---

## Local Anvil Setup

### 1. Start a local Anvil node
```zsh
anvil
```

### 2. Run the Foundry unit test suite
```zsh
forge test -vv
```

### 3. Deploy to local Anvil
In a second terminal (while `anvil` is running):
```zsh
forge script script/DeployRaffle.s.sol:DeployRaffle \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast
```
On Anvil (`chainid 31337`), `HelperConfig` automatically deploys `VRFCoordinatorV2_5Mock` and a mock `LinkToken`, and `DeployRaffle` programmatically creates a VRF subscription, funds it, deploys `Raffle`, and registers `Raffle` as a consumer.

---

## Sepolia Testnet Deployment

### 1. Get Testnet ETH & Testnet LINK
- **Sepolia ETH** (for gas and raffle entries): Obtain from a Sepolia faucet such as [Chainlink Faucets](https://faucets.chain.link/sepolia) or Alchemy/Infura Sepolia faucets.
- **Sepolia Testnet LINK** (for VRF v2.5 subscription funding): Request Sepolia LINK from [faucets.chain.link/sepolia](https://faucets.chain.link/sepolia).

### 2. Configure environment variables
Create a `.env` file (never commit private keys):
```zsh
SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
PRIVATE_KEY="0xYOUR_TESTNET_PRIVATE_KEY"
ETHERSCAN_API_KEY="YOUR_ETHERSCAN_KEY"
```
Load them into your shell:
```zsh
source .env
```

### 3. Deploy to Sepolia
Ensure your deployer account holds Sepolia ETH and Sepolia LINK (or has an existing funded VRF v2.5 subscription ID set in `HelperConfig.s.sol`):
```zsh
forge script script/DeployRaffle.s.sol:DeployRaffle \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify
```
The deployment script will programmatically:
1. Create a Chainlink VRF v2.5 subscription (if `subscriptionId == 0`).
2. Fund the subscription with testnet LINK via `transferAndCall`.
3. Deploy `Raffle.sol`.
4. Add the deployed `Raffle` contract as a VRF consumer.

### 4. Register Chainlink Automation Upkeep
1. Go to [automation.chain.link](https://automation.chain.link/) (Sepolia).
2. Click **Register new Upkeep** -> **Custom logic**.
3. Paste the deployed `Raffle` contract address and fund the upkeep with Sepolia LINK.

---

## Minimal Demo Frontend

1. Serve the `frontend/` folder locally:
   ```zsh
   python3 -m http.server 8080 --directory frontend
   ```
2. Open `http://localhost:8080`, connect MetaMask (switched to Anvil `31337` or Sepolia `11155111`), paste your deployed `Raffle` contract address, and click **Load Contract State** or **Enter Raffle**.

---

## Compliance Notes (Nigeria — Academic Documentation Only)

> *Disclaimer: The following notes are provided strictly for academic project documentation and do not constitute legal advice.*

- **Classification as Lottery / Game of Chance:** Under Nigerian gaming and lottery frameworks (including federal and state gaming/lottery laws), a paid-entry raffle where participants pay consideration (entry fees) for a chance to win a prize determined by randomness may be classified as a **lottery or game of chance**, which typically requires licensing/permits from the relevant regulatory authority if operated commercially.
- **Crypto Promotion & SEC Rules:** Nigeria's Securities and Exchange Commission (SEC) has tightened oversight of digital asset marketing and Virtual Asset Service Providers (VASPs). Public-facing promotions involving crypto assets are subject to SEC rules requiring prior regulatory clearance/approval for VASP advertisements and mandatory disclosure requirements for financial influencers ("finfluencers").
- **Academic Scope:** Because this system is a **non-commercial school project** deployed exclusively on **local Anvil and Ethereum Sepolia testnet** using valueless test ETH/LINK, it does not solicit real-world monetary consideration or operate as a commercial VASP/lottery.
