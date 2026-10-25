# FabricDeFi — a permissioned DeFi prototype on Hyperledger Fabric

A Hyperledger Fabric 2.5 prototype of inter-bank token transfers with regulator-approved settlement.
在 Hyperledger Fabric 2.5 上做的許可制 DeFi 雛形：代幣、P2P 轉帳，以及需要監管機構審核的跨機構清算。

## What is in this repository

| Path | What it is |
|---|---|
| [`Hyperledger_test/fabricdefi/`](Hyperledger_test/fabricdefi/) | **The project itself.** Three Go chaincodes — `token` (ERC-20-style FBT balances), `transfer` (P2P transfers with history) and `settlement` (cross-institution clearing that a Regulator must approve) — plus an Express REST API that requires an `X-API-Key` for writes and a single-file frontend. Setup and an end-to-end walkthrough are in its [README](Hyperledger_test/fabricdefi/README.md). |
| `fabric-samples/` | A copy of [hyperledger/fabric-samples](https://github.com/hyperledger/fabric-samples) (Apache-2.0), used for its `test-network`. It is not original work here and contains local changes, so it is kept as a copy rather than a submodule. |
| `fix.sh` | WSL helper: installs a `docker-compose` shim that calls `docker compose`. |

## Quick start

From the repository root:

```bash
cd fabric-samples/test-network
./network.sh up createChannel -c defi-channel
./network.sh deployCC -ccn token -ccp ../../Hyperledger_test/fabricdefi/chaincode/token -ccl go -c defi-channel -cci InitLedger
```

Then deploy `transfer` and `settlement` the same way and start the API — see the [fabricdefi README](Hyperledger_test/fabricdefi/README.md).

Runs on a local Fabric test network only; accounts (BankA_User, BankB_User, Regulator) are fictional.
