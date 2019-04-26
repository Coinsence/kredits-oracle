const fetch = require('node-fetch');

const Amounts = { 'kredits-1': 500, 'kredits-2': 1500, 'kredits-3': 5000 };

class PullRequest {

  constructor (data) {
    this.data = data;

    this.pull_request = data.pull_request;
    this.assignees    = this.pull_request.assignees.map(a => a.login);
    this.web_url      = this.pull_request._links.html.href;
    this.pr_issue_url = this.pull_request.issue_url;

    let [date, time] = this.pull_request.merged_at.split('T');
    this.date = date;
    this.time = time;

    if (this.assignees.length > 0) {
      this.recipients = this.assignees;
    } else {
      this.recipients = [this.pull_request.user.login];
    }
  }

  buildContributions () {
    return fetch(this.pr_issue_url)
      .then(response => {
        if (response.status >= 400) {
          throw new Error('Bad response from fetching PR issue');
        }
        return response.json();
      })
      .then(issue => {
        const amount = this.amountFromIssueLabels(issue);
        const repoName = this.pull_request.base.repo.full_name;
        const description = `${repoName}: ${this.pull_request.title}`;

        if (amount === 0) {
          console.log('Kredits amount from issue label is zero; ignoring');
          return [];
        }

        return this.recipients.map(recipient => {
          return { recipient, date: this.date, time: this.time, amount, description, url: this.web_url, details: this.pull_request };
        });
      });
  }

  amountFromIssueLabels (issue) {
    const kreditsLabel = issue.labels.map(l => l.name)
                              .filter(n => n.match(/^kredits/))[0];
    // No label, no kredits
    if (typeof kreditsLabel === 'undefined') { return 0; }
    return Amounts[kreditsLabel];
  }
}

module.exports = function(app, Kredits) {
  console.log('Registering github on /github');
  app.post('/github', (req, res) => {
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

    const pullRequest = new PullRequest(data);
    pullRequest.buildContributions()
      .then(contributions => {
        contributions.forEach(contribution => {
          Kredits.Contributor.findByAccount({
            site: 'github.com',
            username: contribution.recipient
          })
          .then(contributor => {
            console.log(`Creating contribution for ${contributor.id}: ${contribution.description}`);
            Kredits.Contribution.addContribution({
              contributorId: contributor.id,
              contributorIpfsHash: contributor.ipfsHash,
              date: contribution.date,
              time: contribution.time,
              amount: contribution.amount,
              url: contribution.url,
              description: contribution.description,
              details: contribution.details,
              kind: 'dev'
            }, {gasLimit: 600000})
          });
        });
        res.status(200).send('OK');
      })
      .catch(e => {
        console.log(e);
        res.status(500).send('SORRY');
      })
  });

}

