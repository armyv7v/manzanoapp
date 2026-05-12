require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3005;

const VPS_AUTH_TOKEN = process.env.VPS_AUTH_TOKEN || 'manzano_dev_token';
const BINANCE_P2P_SEARCH_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const BINANCE_SPOT_PRICE_URL = 'https://api.binance.com/api/v3/ticker/price';

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

const authenticate = (req, res, next) => {
    const token = req.headers['x-vps-token'];
    if (token !== VPS_AUTH_TOKEN) {
        return res.status(401).json({ error: 'No autorizado. Token P2P incorrecto.' });
    }
    next();
};

async function fetchBinanceP2P(payload) {
    const response = await axios.post(
        BINANCE_P2P_SEARCH_URL,
        payload,
        {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        }
    );

    return response.data;
}

async function fetchBinanceSpotPrice(symbol) {
    const response = await axios.get(
        BINANCE_SPOT_PRICE_URL,
        {
            params: { symbol },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        }
    );

    return response.data;
}

app.get('/api/balance', authenticate, async (req, res) => {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;

    if (!apiKey || !apiSecret) {
        return res.status(500).json({ error: 'Claves de Binance no configuradas en el VPS.' });
    }

    try {
        const timestamp = Date.now();
        const asset = req.query.asset || 'USDT';
        const queryString = `timestamp=${timestamp}`;
        const signature = crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');

        const response = await axios.post(
            `https://api.binance.com/sapi/v3/asset/getUserAsset?${queryString}&signature=${signature}`,
            {},
            {
                headers: {
                    'X-MBX-APIKEY': apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        const assetData = response.data.find((coin) => coin.asset === asset);

        if (!assetData) {
            return res.json({
                asset,
                free: '0.00000000',
                locked: '0.00000000',
                source: 'Binance Funding Wallet'
            });
        }

        res.json({
            asset: assetData.asset,
            free: assetData.free,
            locked: assetData.locked,
            freeze: assetData.freeze,
            withdrawing: assetData.withdrawing,
            source: 'Binance Funding Wallet',
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching balance:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Error consultando Billetera de Fondos.',
            details: error.response?.data || error.message
        });
    }
});

app.post('/api/p2p-rate', authenticate, async (req, res) => {
    const { fiat = 'VES', asset = 'USDT', tradeType = 'BUY', amount } = req.body;

    try {
        const payload = {
            proMerchantAds: false,
            page: 1,
            rows: 5,
            payTypes: [],
            countries: [],
            publisherType: null,
            asset,
            fiat,
            tradeType
        };

        if (amount && amount > 0) {
            payload.transAmount = amount;
        }

        const responseData = await fetchBinanceP2P(payload);
        const dataList = responseData?.data;
        if (!dataList || dataList.length === 0) {
            return res.status(404).json({ error: 'No se encontraron anuncios P2P para estos parámetros.' });
        }

        const topAds = dataList.slice(0, 3).map((item) => ({
            price: parseFloat(item.adv.price),
            advertiser: item.advertiser.nickName,
            orders: item.advertiser.monthOrderCount,
            min: item.adv.minSingleTransAmount,
            max: item.adv.maxSingleTransQuantity,
        }));

        const bestRate = topAds[0].price;

        res.json({
            fiat,
            asset,
            tradeType,
            requestedAmount: amount || null,
            bestRate,
            topAds,
            source: 'Binance P2P',
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching P2P rate:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: 'Fallo comunicarse con Binance P2P.',
            details: error.response?.data || error.message
        });
    }
});

app.post('/api/proxy/p2p', authenticate, async (req, res) => {
    try {
        const responseData = await fetchBinanceP2P(req.body || {});
        res.json(responseData);
    } catch (error) {
        console.error('Error proxying Binance P2P:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: 'Fallo comunicarse con Binance P2P.',
            details: error.response?.data || error.message
        });
    }
});

app.get('/api/proxy/spot', authenticate, async (req, res) => {
    const symbol = req.query.symbol || 'BTCUSDT';

    try {
        const responseData = await fetchBinanceSpotPrice(symbol);
        res.json(responseData);
    } catch (error) {
        console.error('Error proxying Binance spot:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: 'Fallo comunicarse con Binance Spot.',
            details: error.response?.data || error.message
        });
    }
});

app.get('/health', (req, res) => res.send('VPS Ok: ' + new Date().toISOString()));

app.listen(PORT, () => {
    console.log(`[binance-vps] Servidor proxy en puerto ${PORT}`);
});
