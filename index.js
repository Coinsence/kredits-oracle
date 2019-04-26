const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const fetch = require('node-fetch');
const ethers = require('ethers');
const Kredits = require('kredits-contracts');
const integrations = require('./integrations');

const daoAddress = process.env.DAO_ADDRESS;
const apmDomain = process.env.APM_DOMAIN || 'open.aragonpm.eth';
const port = process.env.PORT || 3000;
const ipfsConfig = {
  host: process.env.IPFS_API_HOST || 'localhost',
  port: process.env.IPFS_API_PORT || '5001',
  protocol: process.env.IPFS_API_PROTOCOL || 'http'
};

(async function() {
  const app = express();
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  let wallet;
  if (process.env.KREDITS_WALLET_PRIV_KEY) {
    wallet = new ethers.Wallet(process.env.KREDITS_WALLET_PRIV_KEY);
  } else {
    const walletPath  = process.env.KREDITS_WALLET_PATH || './wallet.json';
    const walletJson  = fs.readFileSync(walletPath);
    wallet = await ethers.Wallet.fromEncryptedJson(walletJson, process.env.KREDITS_WALLET_PASSWORD);
  }
  const ethProviderUrl = process.env.ETH_PROVIDER_URL;
  let ethProvider;
  if (ethProviderUrl) {
    ethProvider = new ethers.providers.JsonRpcProvider(ethProviderUrl);
  } else {
    ethProvider = new ethers.getDefaultProvider('rinkeby');
  }
  const signer = wallet.connect(ethProvider);

  let kredits;
  try {
    kredits = await new Kredits(signer.provider, signer, {
      addresses: { Kernel: daoAddress },
      // TODO support local devchain custom address
      apm: apmDomain,
      ipfsConfig
    }).init();
  } catch(error) {
    console.error('Could not set up kredits:', error);
    process.exit(1);
  }

  console.log('Wallet address: ' + wallet.address);

  ethProvider.getBalance(wallet.address).then(balance => {
    console.log('Wallet balance: ' + ethers.utils.formatEther(balance) + 'ETH');
  });
  ethProvider.getBlockNumber().then(block => {
    console.log('Latest block: ', block);
  });

  Object.keys(integrations).forEach(service => {
    integrations[service](app, kredits);
  });
  app.listen(port, () => console.log(`Oracle listening on port ${port}`));
})();

