# FabricDeFi

這是一個基於 Hyperledger Fabric 2.5 的去中心化金融 (DeFi) 雛形，包含三個主要 Chaincode：
- `token`: ERC-20 風格代幣 (FBT)，管理帳戶餘額。
- `transfer`: P2P 轉帳，並提供轉帳歷史查詢。
- `settlement`: 跨機構清算，需要監管機構 (Regulator) 審核。

## 系統需求
- Windows WSL2 (Ubuntu)
- Docker, Docker Compose
- Node.js (v18+)
- Go (1.20+)

## 啟動網路
由於 WSL2 的 Docker socket 轉發限制，若在 `deployCC` 階段遇到 `broken pipe`，建議使用原生的 Linux 環境或 Docker Desktop WSL 整合模式。

1. 進入 test-network 目錄
```bash
cd ~/fabric-workspace/fabric-samples/test-network
```

2. 啟動網路與建立通道
```bash
./network.sh up createChannel -c defi-channel
```

3. 部署 Chaincode (需要依次部署 token, transfer, settlement)
```bash
# 部署 Token 合約並初始化帳戶
./network.sh deployCC -ccn token -ccp ../../Hyperledger_test/fabricdefi/chaincode/token -ccl go -c defi-channel -cci InitLedger

# 部署 Transfer 合約
./network.sh deployCC -ccn transfer -ccp ../../Hyperledger_test/fabricdefi/chaincode/transfer -ccl go -c defi-channel

# 部署 Settlement 合約
./network.sh deployCC -ccn settlement -ccp ../../Hyperledger_test/fabricdefi/chaincode/settlement -ccl go -c defi-channel
```

## 啟動 REST API 伺服器
提供與區塊鏈互動的介面。如果未成功部署 Chaincode，API 內建了 Mock 機制以便展示前端。

1. 安裝依賴
```bash
cd ~/fabric-workspace/Hyperledger_test/fabricdefi/api
npm install
```

2. 啟動伺服器
```bash
npm start
```
API 將運行於 `http://localhost:3000`。

## 前端操作介面
前端為單一 HTML 檔案，使用原生 JS 與 API 互動。

1. 打開 `frontend/index.html` (可在瀏覽器直接開啟檔案 `file:///C:/Users/sanketsu/fabric-workspace/Hyperledger_test/fabricdefi/frontend/index.html`)
2. 介面提供以下功能：
   - 即時餘額查詢 (BankA_User, BankB_User, Regulator)
   - P2P 轉帳操作
   - 發起跨機構清算與審核
   - 查詢交易歷史紀錄

## 測試流程 (端到端)
1. 確保網路與 API 已啟動。
2. 前往前端介面。
3. **P2P轉帳:** 選擇 `BankA_User` 轉帳 `100` 到 `BankB_User`，點擊「執行轉帳」。
4. **清算請求:** 選擇 `BankB_User` 轉帳 `50` 到 `BankA_User`，點擊「發起清算請求」，並複製出現的 ID。
5. **審核:** 將 ID 貼入審核欄位，點擊「監管機構審核通過」。
6. **歷史:** 查詢 `BankA_User` 歷史，可看到上述交易。
