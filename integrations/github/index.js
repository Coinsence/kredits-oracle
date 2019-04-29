const fs = require('fs');
const path = require('path');
const pug = require('pug');
const Octokit = require('@octokit/rest');
const OctokitApp = require('@octokit/app');
const Config = require('../../config');

const PullRequest = require('./pull-request');
const GitHubApp = new OctokitApp({ id: Config.github.appId, privateKey: Config.github.appPrivateKey });
const GitHub = Octokit({ auth: GitHubApp.getSignedJsonWebToken() });

function octokitFor (loginOrOrg) {
  return GitHub.apps.listInstallations().then(response => {
    const installation = response.data.find(i => i.account.login.toLowerCase() === loginOrOrg.toLowerCase());
    if (installation) {
      return GitHubApp.getInstallationAccessToken({ installationId: installation.id })
        .then(accessToken => new Octokit({ auth: accessToken }));
    } else {
      return null;
    }
  });
}

function addContributor (Kredits, contributorAttr) {
  return Kredits.Contributor.add(contributorAttr, {gasLimit: 400000})
    .then(transaction => {
      console.log('Contributor added', transaction.hash);
      return transaction.wait()
        .then(confirmedTx => {
          return Kredits.Contributor.findByAccount({
            site: 'github.com',
            username: contributorAttr.github_username
          });
        });
    });
}

function addContributionFor (Kredits, contributor, contribution) {
  const contributionAttr = Object.assign({}, contribution, {
    contributorId: contributor.id,
    contributorIpfsHash: contributor.ipfsHash,
    kind: 'dev'
  });
  return Kredits.Contribution.addContribution(contributionAttr, {gasLimit: 600000})
    .then(transaction => {
      console.log(`Contribution added for contributor #${contributor.id}: ${transaction.hash}`);
      return transaction;
    });
}

module.exports = function(app, options) {
  const Kredits = options.kredits;

  console.log('Registering GitHub');

  app.get('/github/claim/:owner/:repo/pull/:pull_number', async (req, res) => {
    const octokit = await octokitFor(req.params.owner);
    if (!octokit) {
      res.status(404).render('github/error', { error: 'Oracle GitHub app not installed' });
      return;
    }
    const params = {
      owner: req.params.owner,
      repo: req.params.repo,
      pull_number: req.params.pull_number
    };
    let pullRequest;
    try {
      const pull = await octokit.pulls.get(params);
      pullRequest = await new PullRequest(pull.data).load();
    } catch(e) {
      console.log(e);
      res.status(404).render('github/error');
      return;
    }

    if (pullRequest.valid) {
      // Store the requested PR in the session and authenticate with GitHub
      req.session.pull = params;
      res.render('github/login', { pullRequest } );
    } else {
      res.status(404).render('github/error', { pullRequest });
    }
  });

  app.get("/github/setup", async (req, res) => {
    if (!req.session.grant || !req.session.pull) {
      res.status(401).end();
      return;
    }
    const octokit = new Octokit({auth: req.session.grant.response.access_token});

    const user = await octokit.users.getAuthenticated();
    const userId = user.data.id;
    const username = user.data.login;

    const pull = await octokit.pulls.get(req.session.pull);
    const pullRequest = await new PullRequest(pull.data).load();

    if (pullRequest.valid && pullRequest.claimableBy(username)) {
      const contributor = await Kredits.Contributor.findByAccount({
        site: 'github.com',
        username: username
      });
      res.render('github/register', {
        contributor,
        pullRequest,
        name: user.data.name,
        avatar_url: user.data.avatar_url
      });
    } else {
      req.session.pull = null;
      res.render('github/error', {
        error: 'You can not claim this pull request.'
      });
    }
  });

  app.post('/github/register', async (req, res) => {
    if (!req.session.grant || !req.session.pull) {
      res.status(401).end();
      return;
    }
    const octokit = new Octokit({auth: req.session.grant.response.access_token});

    const user = await octokit.users.getAuthenticated();
    const username = user.data.login;
    const pull = await octokit.pulls.get(req.session.pull);
    const pullRequest = await new PullRequest(pull.data).load();
    const contribution = await pullRequest.contributionAttributes();

    if (!pullRequest.valid || !pullRequest.claimableBy(username)) {
      req.session.pull = null;
      res.status(404).render('github/error', { pullRequest });
      return;
    }

    const contributor = await Kredits.Contributor.findByAccount({
      site: 'github.com',
      username: username
    });

    let contributionPromise;
    if (contributor) {
      contributionPromise = addContributionFor(Kredits, contributor, contribution);
    } else {
      let contributorAttr = {};
      contributorAttr.account = req.body.account;
      contributorAttr.name = user.data.name;
      contributorAttr.kind = "person";
      contributorAttr.url = user.data.blog;
      contributorAttr.github_username = user.data.login;
      contributorAttr.github_uid = user.data.id;

      contributionPromise = addContributor(Kredits, contributorAttr).then(contributor => {
        return addContributionFor(Kredits, contributor, contribution);
      });
    }
    contributionPromise.then(contribution => {
      octokit.issues.addLabels({
        owner: pullRequest.repoOwner.login,
        repo: pullRequest.repoName,
        issue_number: pullRequest.number,
        labels: [ Config.github.claimedLabel ]
      });
    });

    req.session.pull = null;
    res.render('github/success', { pullRequest });
  });

  app.post('/github/webhook', async (req, res) => {
    const evt = req.header('X-GitHub-Event');
    let data = req.body;
    // For some reason data is contained in a payload property on one
    // machine, but directly in the root of the object on others
    if (data.payload) { data = JSON.parse(data.payload); }

    console.log(`Received GitHub hook. Event: ${evt}, action: ${data.action}`);

    if (evt !== 'pull_request' || data.action !== 'closed' || !data.pull_request.merged) {
      res.status(200).send('OK');
      return;
    }

    const repo = data.repository;
    const ownerLogin = repo.owner.login;
    const repoName = repo.name;
    const octokit = await octokitFor(ownerLogin);

    const pullRequest = await new PullRequest(data.pull_request).load();
    const contribution = pullRequest.contributionAttributes()

    pullRequest.recipients.forEach(async (recipient) => {
      const contributor = await Kredits.Contributor.findByAccount({
        site: 'github.com',
        username: recipient
      });
      if (contributor) {
        if (pullRequest.valid && pullRequest.claimableBy(recipient)) {
          addContributionFor(Kredits, contributor, contribution).then(tx => {
            octokit.issues.addLabels({
              owner: ownerLogin,
              repo: repoName,
              issue_number: pullRequest.number,
              labels: [ Config.github.claimedLabel ]
            });
          });
        } else {
          console.log(`Invalid PR webhook for ${pullRequest.repoFullName} #${pullRequest.data.number}`);
        }
      } else {
        const body = `We wanted to send you some Kredits, but did not find your contributor profile.

You can claim your Kredits [here](${Config.host}/github/claim/${ownerLogin}/${repoName}/pull/${pullRequest.number})`;
        octokit.issues.createComment({
          owner: ownerLogin,
          repo: repoName,
          issue_number: pullRequest.number,
          body
        });
      }
    });
    res.status(200).send('OK');
  });

}
