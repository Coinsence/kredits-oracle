const fs = require('fs');
const path = require('path');

let localConfig = {};
if (fs.existsSync(path.join(__dirname, 'index.local.js'))) {
  localConfig = require('./index.local.js');
}

const defaults = {
  ethProviderUrl: process.env.ETH_PROVIDER_URL,
  daoAddress: process.env.DAO_ADDRESS,
  apmDomain: (process.env.APM_DOMAIN || 'open.aragonpm.eth'),
  host: (process.env.HOST || 'http://localhost:3000'),
  port: (process.env.PORT || 3000),
  amounts: { 'kredits-1': 500, 'kredits-2': 1500, 'kredits-3': 5000 },
  wallet: {
    password: process.env.WALLET_PASSWORD,
    privateKey: process.env.WALLET_PRIVATE_KEY,
    path: (process.env.WALLET_PATH || './wallet.json')
  },
  github: {
    appPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    appId: process.env.GITHUB_APP_ID,
    amountLabelRegex: /^kredits-\d/i,
    claimedLabel: 'kredits-claimed',
    amounts: { 'kredits-1': 500, 'kredits-2': 1500, 'kredits-3': 5000 },
  },
  ipfs: {
    host: (process.env.IPFS_API_HOST || 'localhost'),
    port: (process.env.IPFS_API_PORT || '5001'),
    protocol: (process.env.IPFS_API_PROTOCOL || 'http')
  },
  grant: {
    defaults: {
      protocol: (process.env.GRANT_PROTOCOL || "http"),
      host: (process.env.GRANT_HOST || 'localhost:3000'),
      transport: 'session'
    },
    github: {
      key: process.env.GITHUB_KEY,
      secret: process.env.GITHUB_SECRET,
      scope: ['user', 'public_repo'],
      callback: '/github/setup'
    }
  }
}

module.exports = Object.assign({}, defaults, localConfig);
