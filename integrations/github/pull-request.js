const fetch = require('node-fetch');
const Config = require('../../config');

class PullRequest {

  constructor (data) {
    this.data = data;
    this.number = this.data.number;
    this.assignees    = this.data.assignees.map(a => a.login);
    this.web_url      = this.data._links.html.href;
    this.pr_issue_url = this.data.issue_url;
    this.repoFullName = this.data.base.repo.full_name;
    this.repoName = this.data.base.repo.name;
    this.repoOwner = this.data.base.repo.owner;
    this.title = this.data.title;
    this.description = `${this.repoFullName}: ${this.title}`;

    if (this.data.merged_at) {
      let [date, time] = this.data.merged_at.split('T');
      this.date = date;
      this.time = time;
    }

    if (this.assignees.length > 0) {
      this.recipients = this.assignees;
    } else {
      this.recipients = [this.data.user.login];
    }
  }

  get valid () {
    return this.merged && !this.claimed && this.amount > 0;
  }

  get merged () {
    return this.data.merged;
  }

  get claimed () {
    return this.labels.includes(Config.github.claimedLabel);
  }

  get amount () {
    const amountsLabel = this.labels.filter(l => l.match(Config.github.amountLabelRegex))[0];
    // No label, no kredits
    if (typeof amountsLabel === 'undefined') { return 0; }
    return Config.github.amounts[amountsLabel];
  }

  get labels () {
    return this.issue.labels.map(l => l.name.toLowerCase());
  }

  claimableBy (login) {
    return this.recipients.includes(login);
  }

  load () {
    return fetch(this.pr_issue_url)
      .then(response => {
        if (response.status >= 400) {
          throw new Error('Bad response from fetching PR issue');
        }
        return response.json();
      })
      .then(issue => {
        this.issue = issue;
        return this;
      });
  }

  contributionAttributes () {
    return {
      date: this.date,
      time: this.time,
      amount: this.amount,
      description: this.description,
      url: this.web_url,
      details: this.data
    };
  }
}

module.exports = PullRequest;
