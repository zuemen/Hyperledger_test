const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

const app = express();

// CORS 白名單：先前 cors() 全開，任何網站都能代使用者打這些端點。
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({
    origin(origin, cb) {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        return cb(new Error('Origin not allowed'));
    },
}));
app.use(bodyParser.json({ limit: '100kb' }));

/**
 * 端點授權。
 *
 * 先前 /transfer、/settlement/request、/settlement/approve/:id 完全沒有驗證，
 * 而伺服器是用自己 wallet 裡的 appUser 身分送出 Fabric 交易 —— 呼叫者可以在
 * body 裡指定任意 from 帳戶並轉走餘額，或逕自核准任何一筆清算。
 *
 * 這裡分成兩級，且都是 fail-closed（沒設金鑰就停用端點，而不是放行）：
 *   - FABRICDEFI_API_KEY：一般寫入操作（轉帳、發起清算）
 *   - FABRICDEFI_APPROVER_KEY：清算核准，屬於覆核權限，另用一把金鑰
 */
function keyChecker(envName) {
    return (req, res, next) => {
        const expected = process.env[envName];
        if (!expected) {
            return res.status(503).json({
                error: `伺服器未設定 ${envName}，此端點停用`,
            });
        }
        const provided = req.header('X-API-Key') || '';
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            return res.status(401).json({ error: 'unauthorized' });
        }
        next();
    };
}

const requireApiKey = keyChecker('FABRICDEFI_API_KEY');
const requireApproverKey = keyChecker('FABRICDEFI_APPROVER_KEY');

/** 帳戶識別：非空字串、限定字元集、長度上限。 */
function isValidAccount(v) {
    return typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(v);
}

/** 金額：正的有限數字。 */
function isValidAmount(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
}

const channelName = 'defi-channel';

// Helper function to get the gateway connection
async function getContract(contractName) {
    // Load the network configuration
    const ccpPath = path.resolve(__dirname, '..', '..', '..', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
    
    let ccp;
    try {
        const fileExists = fs.existsSync(ccpPath);
        if (fileExists) {
            ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
        } else {
            console.warn("Connection profile not found at:", ccpPath);
            // Return null if not set up, to prevent crashing in a non-deployed environment
            return null;
        }
    } catch(err) {
        return null;
    }

    // Set up the wallet (using simple filesystem wallet for demonstration)
    const walletPath = path.join(process.cwd(), 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    
    // Check to see if we've already enrolled the admin user.
    const identity = await wallet.get('appUser');
    if (!identity) {
        console.log('An identity for the user "appUser" does not exist in the wallet');
        console.log('You need to enroll admin and register appUser first.');
        return null;
    }

    const gateway = new Gateway();
    await gateway.connect(ccp, { wallet, identity: 'appUser', discovery: { enabled: true, asLocalhost: true } });

    const network = await gateway.getNetwork(channelName);
    return network.getContract(contractName);
}

// 1. GET /balance/:account -> 查餘額 (token chaincode)
app.get('/balance/:account', async (req, res) => {
    try {
        const account = req.params.account;
        const contract = await getContract('token');
        // 網路不可用時回錯，不得回傳假餘額讓呼叫端誤以為是真實資料
        if (!contract) return res.status(503).json({ error: 'Fabric 網路不可用' });
        
        const result = await contract.evaluateTransaction('BalanceOf', account);
        res.json({ balance: parseInt(result.toString()) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'internal_error' });
    }
});

// 2. POST /transfer -> body: {from, to, amount} 執行轉帳 (transfer chaincode)
app.post('/transfer', requireApiKey, async (req, res) => {
    try {
        const { from, to, amount } = req.body || {};
        if (!isValidAccount(from) || !isValidAccount(to)) {
            return res.status(400).json({ error: 'from / to 需為合法帳戶識別' });
        }
        if (!isValidAmount(amount)) {
            return res.status(400).json({ error: 'amount 需為正數' });
        }
        const contract = await getContract('transfer');
        // 網路不可用時必須誠實回錯：金流操作絕不可回報未實際發生的成功
        if (!contract) return res.status(503).json({ error: 'Fabric 網路不可用，交易未送出' });

        await contract.submitTransaction('Transfer', from, to, amount.toString());
        res.json({ success: true, message: `Transferred ${amount} from ${from} to ${to}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'internal_error' });
    }
});

// 3. POST /settlement/request -> 發起清算 (settlement chaincode)
app.post('/settlement/request', requireApiKey, async (req, res) => {
    try {
        const { from, to, amount } = req.body || {};
        if (!isValidAccount(from) || !isValidAccount(to)) {
            return res.status(400).json({ error: 'from / to 需為合法帳戶識別' });
        }
        if (!isValidAmount(amount)) {
            return res.status(400).json({ error: 'amount 需為正數' });
        }
        const contract = await getContract('settlement');
        if (!contract) return res.status(503).json({ error: 'Fabric 網路不可用，清算未建立' });

        const result = await contract.submitTransaction('RequestSettlement', from, to, amount.toString());
        res.json({ id: result.toString(), status: "PENDING" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'internal_error' });
    }
});

// 4. POST /settlement/approve/:id -> 審核清算 (settlement chaincode)
app.post('/settlement/approve/:id', requireApproverKey, async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidAccount(id)) {
            return res.status(400).json({ error: 'settlement id 格式不正確' });
        }
        const contract = await getContract('settlement');
        if (!contract) return res.status(503).json({ error: 'Fabric 網路不可用，核准未送出' });

        await contract.submitTransaction('ApproveSettlement', id);
        res.json({ success: true, message: `Settlement ${id} approved` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'internal_error' });
    }
});

// 5. GET /history/:account -> 查歷史 (transfer chaincode)
app.get('/history/:account', async (req, res) => {
    try {
        const account = req.params.account;
        const contract = await getContract('transfer');
        if (!contract) return res.status(503).json({ error: 'Fabric 網路不可用' });

        const result = await contract.evaluateTransaction('GetHistory', account);
        res.json(JSON.parse(result.toString()));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'internal_error' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`FabricDeFi API server is running on http://localhost:${PORT}`);
});
