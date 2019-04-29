const express = require('express');
const session = require('express-session');
const grant = require('grant-express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const Kredits = require('kredits-contracts');

const Config = require('./config');
const integrations = require('./integrations');

(async function() {
  const app = express();
  app.set('view engine', 'pug');
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(session({secret: 'kredits-oracle-45ad32906b7', saveUninitialized: true, resave: true}));

  const grantConfig = {
    "defaults": {
      "protocol": "http",
      "host": "localhost:3000",
      "transport": "session"
    },
    "github": {
      "key": "Iv1.430dc02dc0037aa4",
      "secret": "426ffa0a3f0a78d0a79b2722fd46b87d171cb79e",
      "scope": ["user", "public_repo"],
      "callback": "/github/setup"
    }
  }
  app.use(grant(Config.grant));

  let wallet;
  if (Config.wallet.privateKey) {
    wallet = new ethers.Wallet(Config.wallet.privateKey);
  } else {
    const walletPath  = Config.wallet.path;
    const walletJson  = fs.readFileSync(walletPath);
    wallet = await ethers.Wallet.fromEncryptedJson(walletJson, Config.wallet.password);
  }
  let ethProvider;
  if (Config.ethProviderUrl) {
    ethProvider = new ethers.providers.JsonRpcProvider(Config.ethProviderUrl);
  } else {
    ethProvider = new ethers.getDefaultProvider('rinkeby');
  }
  const signer = wallet.connect(ethProvider);

  let kredits;
  try {
    kredits = await new Kredits(signer.provider, signer, {
      addresses: { Kernel: Config.daoAddress },
      apm: Config.apmDomain,
      ipfsConfig: Config.ipfs
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
    integrations[service](app, { kredits });
  });
  app.listen(Config.port, () => console.log(`Oracle listening on port ${Config.port}`));
})();

