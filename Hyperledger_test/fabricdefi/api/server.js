const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(bodyParser.json());

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
        if (!contract) return res.status(200).json({ balance: 1000, note: "Mock balance due to network unavailable" });
        
        const result = await contract.evaluateTransaction('BalanceOf', account);
        res.json({ balance: parseInt(result.toString()) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. POST /transfer -> body: {from, to, amount} 執行轉帳 (transfer chaincode)
app.post('/transfer', async (req, res) => {
    try {
        const { from, to, amount } = req.body;
        const contract = await getContract('transfer');
        if (!contract) return res.status(200).json({ success: true, message: "Mock transfer successful" });

        await contract.submitTransaction('Transfer', from, to, amount.toString());
        res.json({ success: true, message: `Transferred ${amount} from ${from} to ${to}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. POST /settlement/request -> 發起清算 (settlement chaincode)
app.post('/settlement/request', async (req, res) => {
    try {
        const { from, to, amount } = req.body;
        const contract = await getContract('settlement');
        if (!contract) return res.status(200).json({ id: "mock-tx-1234", status: "PENDING" });

        const result = await contract.submitTransaction('RequestSettlement', from, to, amount.toString());
        res.json({ id: result.toString(), status: "PENDING" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. POST /settlement/approve/:id -> 審核清算 (settlement chaincode)
app.post('/settlement/approve/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const contract = await getContract('settlement');
        if (!contract) return res.status(200).json({ success: true, message: "Mock approval successful" });

        await contract.submitTransaction('ApproveSettlement', id);
        res.json({ success: true, message: `Settlement ${id} approved` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. GET /history/:account -> 查歷史 (transfer chaincode)
app.get('/history/:account', async (req, res) => {
    try {
        const account = req.params.account;
        const contract = await getContract('transfer');
        if (!contract) return res.status(200).json([{ txId: "mock-tx-001", from: "BankA_User", to: "BankB_User", amount: "50", timestamp: new Date() }]);

        const result = await contract.evaluateTransaction('GetHistory', account);
        res.json(JSON.parse(result.toString()));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`FabricDeFi API server is running on http://localhost:${PORT}`);
});
